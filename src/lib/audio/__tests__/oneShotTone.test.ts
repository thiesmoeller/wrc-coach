import { describe, expect, it } from 'vitest';
import { playOneShotTone } from '../oneShotTone';
import { FakeAudioContext } from './fakeAudioContext';

describe('playOneShotTone', () => {
  it('does not schedule when context is suspended', () => {
    const ctx = new FakeAudioContext();
    expect(playOneShotTone(ctx, {
      frequencyHz: 800,
      durationSec: 0.1,
      gainLevel: 0.8,
      pan: 0,
      useStereoPanner: false,
      masterVolume: 1,
    })).toBe(false);
    expect(ctx.oscillators.length).toBe(0);
  });

  it('starts gain at zero before envelope', async () => {
    const ctx = new FakeAudioContext();
    await ctx.resume();
    playOneShotTone(ctx, {
      frequencyHz: 800,
      durationSec: 0.1,
      gainLevel: 0.8,
      pan: 0,
      useStereoPanner: false,
      masterVolume: 1,
    });
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(ctx.gains[0].gain.setValueAtTimeCalls).toBeGreaterThan(0);
  });
});
