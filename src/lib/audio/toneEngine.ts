import type { AudioContextLike, GainNodeLike, OscillatorNodeLike, StereoPannerNodeLike } from './webAudioTypes';

export interface ToneEngineTarget {
  frequencyHz: number;
  gain: number;
  pan: number;
  masterVolume: number;
  rampSec: number;
}

export interface ToneEngineOptions {
  useStereoPanner: boolean;
  throttleSec: number;
}

export class ToneEngine {
  private ctx: AudioContextLike;
  private osc: OscillatorNodeLike | null = null;
  private gain: GainNodeLike | null = null;
  private panner: StereoPannerNodeLike | null = null;
  private running = false;
  private lastParamUpdateTime = -Infinity;
  private readonly opts: ToneEngineOptions;

  constructor(ctx: AudioContextLike, opts: ToneEngineOptions) {
    this.ctx = ctx;
    this.opts = opts;
  }

  isRunning(): boolean {
    return this.running;
  }

  start(initial: ToneEngineTarget): void {
    if (this.running) return;
    this.osc = this.ctx.createOscillator();
    this.gain = this.ctx.createGain();
    this.osc.type = 'sine';
    this.osc.frequency.value = initial.frequencyHz;
    this.gain.gain.value = 0;

    if (this.opts.useStereoPanner && this.ctx.createStereoPanner) {
      this.panner = this.ctx.createStereoPanner();
      this.panner.pan.value = initial.pan;
      this.osc.connect(this.panner);
      this.panner.connect(this.gain);
    } else {
      this.osc.connect(this.gain);
    }

    this.gain.connect(this.ctx.destination);
    this.osc.start();
    this.running = true;
    this.applyTarget(initial, true);
  }

  stop(): void {
    if (!this.running) return;
    try {
      this.osc?.stop();
    } catch {
      /* already stopped */
    }
    this.osc?.disconnect();
    this.panner?.disconnect();
    this.gain?.disconnect();
    this.osc = null;
    this.panner = null;
    this.gain = null;
    this.running = false;
  }

  update(target: ToneEngineTarget): boolean {
    if (!this.running) return false;
    const t = this.ctx.currentTime;
    if (t - this.lastParamUpdateTime < this.opts.throttleSec) {
      return false;
    }
    this.applyTarget(target, false);
    this.lastParamUpdateTime = t;
    return true;
  }

  private applyTarget(target: ToneEngineTarget, immediate: boolean): void {
    if (!this.osc || !this.gain) return;
    const t = this.ctx.currentTime;
    const audibility = target.gain * target.masterVolume;
    const freq = Math.min(2000, Math.max(500, target.frequencyHz));

    if (immediate) {
      this.osc.frequency.value = freq;
      this.gain.gain.value = audibility;
      if (this.panner) this.panner.pan.value = target.pan;
    } else {
      const ramp = target.rampSec;
      if (this.osc.frequency.setTargetAtTime) {
        this.osc.frequency.setTargetAtTime(freq, t, ramp);
      } else {
        this.osc.frequency.value = freq;
      }
      if (this.gain.gain.setTargetAtTime) {
        this.gain.gain.setTargetAtTime(audibility, t, ramp);
      } else {
        this.gain.gain.value = audibility;
      }
      if (this.panner) {
        if (this.panner.pan.setTargetAtTime) {
          this.panner.pan.setTargetAtTime(target.pan, t, ramp);
        } else {
          this.panner.pan.value = target.pan;
        }
      }
    }
  }
}
