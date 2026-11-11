import { surgeAccelToPitchHz } from './accelerationMapping';
import {
  computeBalanceTone,
  type BalanceHysteresisState,
} from './balanceMapping';
import { catchLockTimeToPitchHz } from './catchSharpnessMapping';
import {
  computeCatchReportDecision,
  createCatchReportFadeState,
} from './catchReportLogic';
import { estimateOutputLatencyMs, isTimingSensitiveReliable } from './latency';
import { playOneShotTone } from './oneShotTone';
import { DEFAULT_AUDIO_COACH_SETTINGS, mergeAudioCoachSettings } from './settings';
import {
  buildSpokenSummary,
  createSummarySchedulerState,
  shouldSpeakSummary,
} from './summaryText';
import { ToneEngine } from './toneEngine';
import type {
  AccelerationInput,
  AudioCoachMode,
  AudioCoachSettings,
  AudioOutputState,
  BalanceLiveInput,
  CatchSharpnessInput,
  CatchStrokeInput,
  SummaryBlockInput,
} from './types';
import type { AudioContextLike, SpeechSynthesisLike } from './webAudioTypes';
import {
  SpeechQueue,
  type UtteranceFactory,
  defaultUtteranceFactory,
} from './speechQueue';

export interface AudioCoachDependencies {
  audioContext?: AudioContextLike | null;
  speechSynthesis?: SpeechSynthesisLike | null;
  createContext?: () => AudioContextLike;
  createUtterance?: UtteranceFactory;
}

export class AudioCoach {
  private settings: AudioCoachSettings;
  private ctx: AudioContextLike | null;
  private readonly createContext: (() => AudioContextLike) | null;
  private mode: AudioCoachMode = 'off';
  private toneEngine: ToneEngine | null = null;
  private balanceHysteresis: BalanceHysteresisState = { wasAudible: false };
  private catchFadeState = createCatchReportFadeState();
  private summaryScheduler = createSummarySchedulerState();
  private speech: SpeechQueue;
  private ownsContext = false;
  private disposed = false;
  private readonly onContextStateChange = (): void => {
    this.handleContextStateChange();
  };

  constructor(
    initialSettings?: Partial<AudioCoachSettings>,
    deps: AudioCoachDependencies = {}
  ) {
    this.settings = mergeAudioCoachSettings(
      DEFAULT_AUDIO_COACH_SETTINGS,
      initialSettings ?? {}
    );
    this.createContext =
      deps.createContext ??
      (typeof AudioContext !== 'undefined'
        ? () => new AudioContext() as unknown as AudioContextLike
        : null);
    if (deps.audioContext !== undefined) {
      this.ctx = deps.audioContext;
      this.bindContext(this.ctx);
    } else {
      this.ctx = null;
    }
    this.speech = new SpeechQueue(
      deps.speechSynthesis,
      deps.createUtterance ?? defaultUtteranceFactory
    );
  }

  getSettings(): AudioCoachSettings {
    return mergeAudioCoachSettings(this.settings, {});
  }

  updateSettings(partial: Partial<AudioCoachSettings>): void {
    this.settings = mergeAudioCoachSettings(this.settings, partial);
    if (
      this.mode === 'balance' ||
      this.mode === 'accelerationSonification'
    ) {
      this.rebuildContinuousEngine();
    }
  }

  getMode(): AudioCoachMode {
    return this.mode;
  }

  getOutputState(): AudioOutputState {
    if (this.disposed) return 'unavailable';
    if (!this.ctx) {
      if (!this.createContext) return 'unavailable';
      return 'locked';
    }
    switch (this.ctx.state) {
      case 'running':
        return 'running';
      case 'suspended':
        return 'suspended';
      case 'closed':
        return 'unavailable';
      default:
        return 'locked';
    }
  }

  async unlock(): Promise<AudioOutputState> {
    if (this.disposed) return 'unavailable';
    if (!this.ctx) {
      if (!this.createContext) return 'unavailable';
      try {
        this.ctx = this.createContext();
        this.ownsContext = true;
        this.bindContext(this.ctx);
      } catch {
        return 'unavailable';
      }
    }
    try {
      await this.ctx.resume();
    } catch {
      return this.getOutputState();
    }
    this.handleContextStateChange();
    return this.getOutputState();
  }

  getEstimatedLatencyMs(): number {
    return estimateOutputLatencyMs(this.ctx, this.settings.latencyOffsetMs);
  }

  isTimingSensitiveReliable(): boolean {
    return isTimingSensitiveReliable(
      this.getEstimatedLatencyMs(),
      this.settings.timingSensitiveThresholdMs
    );
  }

  start(mode: AudioCoachMode): void {
    if (this.disposed || mode === 'off') {
      this.stop();
      return;
    }
    if (this.mode !== mode) {
      this.stopEngines();
      this.mode = mode;
    }
    if (
      (mode === 'balance' || mode === 'accelerationSonification') &&
      this.audioReady()
    ) {
      this.ensureToneEngine();
    }
  }

  stop(): void {
    this.mode = 'off';
    this.stopEngines();
    this.balanceHysteresis = { wasAudible: false };
  }

  dispose(): void {
    this.stop();
    this.speech.cancel();
    this.unbindContext();
    if (this.ownsContext && this.ctx?.close) {
      void this.ctx.close();
    }
    this.ctx = null;
    this.disposed = true;
  }

  updateBalanceLive(input: BalanceLiveInput): void {
    if (this.mode !== 'balance' || !this.audioReady()) return;
    const engine = this.ensureToneEngine();
    if (!engine) return;

    const result = computeBalanceTone(
      input,
      this.settings.balance,
      this.balanceHysteresis,
      this.settings.monoOutput
    );
    this.balanceHysteresis = result.hysteresis;

    if (!result.audible) {
      engine.update({
        frequencyHz: this.settings.balance.stereoPitchHz,
        gain: 0,
        pan: 0,
        masterVolume: this.settings.masterVolume,
        rampSec: this.settings.balance.rampSec,
      });
      return;
    }

    if (!engine.isRunning()) {
      engine.start({
        frequencyHz: result.pitchHz,
        gain: result.gain,
        pan: result.pan,
        masterVolume: this.settings.masterVolume,
        rampSec: this.settings.balance.rampSec,
      });
    } else {
      engine.update({
        frequencyHz: result.pitchHz,
        gain: result.gain,
        pan: result.pan,
        masterVolume: this.settings.masterVolume,
        rampSec: this.settings.balance.rampSec,
      });
    }
  }

  reportCatchStroke(input: CatchStrokeInput): void {
    if (this.mode !== 'catchReport' || !this.audioReady() || !this.ctx) return;

    const { decision, nextState } = computeCatchReportDecision(
      input,
      this.settings.catchReport,
      this.catchFadeState,
      this.settings.monoOutput
    );
    this.catchFadeState = nextState;
    if (!decision.play) return;

    const durationSec = this.settings.catchReport.toneDurationMs / 1000;
    const t0 = this.ctx.currentTime;
    const beep = durationSec * 0.45;
    const gap = 0.07;
    const mv = this.settings.masterVolume;
    const stereo = !this.settings.monoOutput;

    if (this.settings.monoOutput) {
      if (decision.monoSidePattern === 'left') {
        playOneShotTone(this.ctx, {
          frequencyHz: decision.pitchHz,
          durationSec: beep,
          gainLevel: 0.85,
          pan: 0,
          useStereoPanner: false,
          masterVolume: mv,
          when: t0,
        });
        playOneShotTone(this.ctx, {
          frequencyHz: decision.pitchHz,
          durationSec: beep,
          gainLevel: 0.85,
          pan: 0,
          useStereoPanner: false,
          masterVolume: mv,
          when: t0 + beep + gap,
        });
      } else if (decision.monoSidePattern === 'neutral') {
        const triGap = 0.05;
        const triBeep = beep * 0.35;
        for (let i = 0; i < 3; i++) {
          playOneShotTone(this.ctx, {
            frequencyHz: decision.pitchHz,
            durationSec: triBeep,
            gainLevel: 0.85,
            pan: 0,
            useStereoPanner: false,
            masterVolume: mv,
            when: t0 + i * (triBeep + triGap),
          });
        }
      } else {
        playOneShotTone(this.ctx, {
          frequencyHz: decision.pitchHz,
          durationSec: durationSec,
          gainLevel: 0.85,
          pan: 0,
          useStereoPanner: false,
          masterVolume: mv,
          when: t0,
        });
      }
    } else {
      playOneShotTone(this.ctx, {
        frequencyHz: decision.pitchHz,
        durationSec,
        gainLevel: 0.85,
        pan: decision.pan,
        useStereoPanner: stereo,
        masterVolume: mv,
        when: t0,
      });
    }
  }

  tickSummary(
    strokeDelta: number,
    metreDelta: number,
    input: SummaryBlockInput
  ): void {
    if (this.mode !== 'spokenSummary') return;
    const { speak, nextState } = shouldSpeakSummary(
      this.summaryScheduler,
      strokeDelta,
      metreDelta,
      this.settings.spokenSummary
    );
    this.summaryScheduler = nextState;
    if (!speak) return;
    const text = buildSpokenSummary(input);
    this.speech.speak(text);
  }

  reportCatchSharpness(input: CatchSharpnessInput): void {
    if (this.mode !== 'catchSharpness' || !this.audioReady() || !this.ctx) return;
    const pitch = catchLockTimeToPitchHz(input, this.settings.catchSharpness);
    const duration = this.settings.catchSharpness.toneDurationMs / 1000;
    playOneShotTone(this.ctx, {
      frequencyHz: pitch,
      durationSec: duration,
      gainLevel: 0.9,
      pan: 0,
      useStereoPanner: false,
      masterVolume: this.settings.masterVolume,
    });
  }

  updateAccelerationSonification(input: AccelerationInput): void {
    if (this.mode !== 'accelerationSonification' || !this.audioReady()) return;
    const engine = this.ensureToneEngine();
    if (!engine) return;

    const pitchHz = surgeAccelToPitchHz(input, this.settings.acceleration);
    const rampSec = this.settings.acceleration.smoothingSec;

    if (!engine.isRunning()) {
      engine.start({
        frequencyHz: pitchHz,
        gain: 0.35,
        pan: 0,
        masterVolume: this.settings.masterVolume,
        rampSec,
      });
    } else {
      engine.update({
        frequencyHz: pitchHz,
        gain: 0.35,
        pan: 0,
        masterVolume: this.settings.masterVolume,
        rampSec,
      });
    }
  }

  resetCatchReportFade(): void {
    this.catchFadeState = createCatchReportFadeState();
  }

  private audioReady(): boolean {
    return this.ctx !== null && this.ctx.state === 'running' && !this.disposed;
  }

  private bindContext(ctx: AudioContextLike | null): void {
    if (!ctx?.addEventListener) return;
    ctx.addEventListener('statechange', this.onContextStateChange);
  }

  private unbindContext(): void {
    if (!this.ctx?.removeEventListener) return;
    this.ctx.removeEventListener('statechange', this.onContextStateChange);
  }

  private handleContextStateChange(): void {
    if (!this.ctx || this.disposed) return;
    if (this.ctx.state === 'suspended') {
      this.stopEngines();
    }
  }

  private rebuildContinuousEngine(): void {
    if (this.mode !== 'balance' && this.mode !== 'accelerationSonification') {
      return;
    }
    this.stopEngines();
    if (this.audioReady()) {
      this.ensureToneEngine();
    }
  }

  private ensureToneEngine(): ToneEngine | null {
    if (!this.ctx) return null;
    if (!this.toneEngine) {
      const throttle =
        this.mode === 'accelerationSonification'
          ? this.settings.acceleration.smoothingSec
          : this.settings.balance.updateThrottleSec;
      this.toneEngine = new ToneEngine(this.ctx, {
        useStereoPanner: !this.settings.monoOutput,
        throttleSec: throttle,
      });
    }
    return this.toneEngine;
  }

  private stopEngines(): void {
    this.toneEngine?.stop();
    this.toneEngine = null;
  }
}
