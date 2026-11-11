import { describe, expect, it, vi } from 'vitest';
import { AudioCoach } from '../AudioCoach';
import { DEFAULT_AUDIO_COACH_SETTINGS } from '../settings';
import { playOneShotTone } from '../oneShotTone';
import { FakeAudioContext } from './fakeAudioContext';

vi.mock('../oneShotTone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../oneShotTone')>();
  return {
    ...actual,
    playOneShotTone: vi.fn(actual.playOneShotTone),
  };
});

const playOneShotMock = vi.mocked(playOneShotTone);

function fakeSpeech() {
  let speaking = false;
  let pending = false;
  return {
    speak: vi.fn(() => {
      speaking = true;
    }),
    cancel: vi.fn(() => {
      speaking = false;
    }),
    get speaking() {
      return speaking;
    },
    get pending() {
      return pending;
    },
    _setSpeaking(v: boolean) {
      speaking = v;
    },
  };
}

describe('AudioCoach engine', () => {
  it('unlock and suspended state', async () => {
    const ctx = new FakeAudioContext();
    const coach = new AudioCoach({}, { audioContext: ctx });
    expect(coach.getOutputState()).toBe('suspended');
    await coach.unlock();
    expect(coach.getOutputState()).toBe('running');
  });

  it('suspend stops work and resume recovers', async () => {
    const ctx = new FakeAudioContext();
    const coach = new AudioCoach({}, { audioContext: ctx });
    await coach.unlock();
    coach.start('balance');
    coach.updateBalanceLive({ rollDeg: 2, phase: 'approach' });
    expect(ctx.oscillators.some((o) => o.started)).toBe(true);
    const callsBeforeSuspend = ctx.totalParamRetargetCalls();
    await ctx.suspend();
    expect(coach.getOutputState()).toBe('suspended');
    coach.updateBalanceLive({ rollDeg: 2, phase: 'approach' });
    expect(ctx.totalParamRetargetCalls()).toBe(callsBeforeSuspend);
    await coach.unlock();
    coach.updateBalanceLive({ rollDeg: 2, phase: 'approach' });
    expect(ctx.oscillators.some((o) => o.started && !o.stopped)).toBe(true);
  });

  it('100 Hz balance updates stay within throttle bound over 10s', async () => {
    const ctx = new FakeAudioContext();
    const throttle = 0.05;
    const coach = new AudioCoach(
      {
        balance: {
          ...DEFAULT_AUDIO_COACH_SETTINGS.balance,
          updateThrottleSec: throttle,
        },
      },
      { audioContext: ctx }
    );
    await coach.unlock();
    coach.start('balance');
    const maxCalls = Math.ceil(10 / throttle) * 2 + 6;
    for (let i = 0; i < 1000; i++) {
      ctx.advanceTime(0.01);
      coach.updateBalanceLive({ rollDeg: 2, phase: 'approach' });
    }
    expect(ctx.totalParamRetargetCalls()).toBeLessThanOrEqual(maxCalls);
    expect(ctx.totalParamRetargetCalls()).toBeGreaterThan(0);
  });

  it('stop and mode switch stop all oscillators', async () => {
    const ctx = new FakeAudioContext();
    const coach = new AudioCoach({}, { audioContext: ctx });
    await coach.unlock();
    coach.start('balance');
    coach.updateBalanceLive({ rollDeg: 2, phase: 'approach' });
    coach.stop();
    expect(ctx.oscillators.every((o) => o.stopped || !o.started)).toBe(true);
    coach.start('balance');
    coach.updateBalanceLive({ rollDeg: 2, phase: 'approach' });
    coach.start('accelerationSonification');
    coach.updateAccelerationSonification({ surgeAccelMs2: 1 });
    expect(ctx.oscillators.filter((o) => o.started && !o.stopped).length).toBe(1);
  });

  it('updateSettings rebuilds engine for mono and master volume', async () => {
    const ctx = new FakeAudioContext();
    const coach = new AudioCoach({ monoOutput: false }, { audioContext: ctx });
    await coach.unlock();
    coach.start('balance');
    coach.updateBalanceLive({ rollDeg: 2, phase: 'approach' });
    const before = ctx.oscillators.length;
    coach.updateSettings({ monoOutput: true, masterVolume: 0.2 });
    coach.updateBalanceLive({ rollDeg: 2, phase: 'approach' });
    expect(ctx.oscillators.length).toBeGreaterThan(before);
    expect(ctx.oscillators.some((o) => o.started && !o.stopped)).toBe(true);
  });

  it('dispose closes owned context only', async () => {
    const owned = new FakeAudioContext();
    const coach = new AudioCoach({}, { createContext: () => owned });
    await coach.unlock();
    coach.dispose();
    expect(owned.closed).toBe(true);

    const injected = new FakeAudioContext();
    const coach2 = new AudioCoach({}, { audioContext: injected });
    await coach2.unlock();
    coach2.dispose();
    expect(injected.closed).toBe(false);
  });

  it('drops overlapping speech (second summary while speaking)', async () => {
    const ctx = new FakeAudioContext();
    const speech = fakeSpeech();
    const coach = new AudioCoach(
      {
        spokenSummary: {
          everyNStrokes: 1,
          everyMetres: 250,
          enabledStrokeInterval: true,
          enabledMetreInterval: false,
        },
      },
      { audioContext: ctx, speechSynthesis: speech }
    );
    await coach.unlock();
    coach.start('spokenSummary');
    speech._setSpeaking(true);
    coach.tickSummary(1, 0, { strokeRateSpm: 20, meanCatchLeanDeg: 1, wobbleTrend: 'down' });
    expect(speech.speak).not.toHaveBeenCalled();
    speech._setSpeaking(false);
    coach.tickSummary(1, 0, { strokeRateSpm: 20, meanCatchLeanDeg: 1, wobbleTrend: 'down' });
    expect(speech.speak).toHaveBeenCalledTimes(1);
  });

  it('does not play catch report when suspended', async () => {
    const ctx = new FakeAudioContext();
    const coach = new AudioCoach({}, { audioContext: ctx });
    coach.start('catchReport');
    playOneShotMock.mockClear();
    coach.reportCatchStroke({ leanDeg: 2, approachWobbleDeg: 1 });
    expect(playOneShotMock).not.toHaveBeenCalled();
    await coach.unlock();
    coach.reportCatchStroke({ leanDeg: 2, approachWobbleDeg: 1 });
    expect(playOneShotMock).toHaveBeenCalled();
  });
});
