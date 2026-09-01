import { describe, it, expect } from 'vitest';
import { ButterworthBandpass, Biquad, designLowpass, designHighpass } from '../Biquad';

/** Steady-state amplitude of the filter response to a sine at frequency f. */
function sineGain(process: (x: number) => number, f: number, fs: number, cycles = 60): number {
  const n = Math.round((cycles * fs) / f);
  let maxOut = 0;
  // Discard the first half (transient), measure the second half.
  for (let i = 0; i < n; i++) {
    const y = process(Math.sin((2 * Math.PI * f * i) / fs));
    if (i > n / 2) maxOut = Math.max(maxOut, Math.abs(y));
  }
  return maxOut;
}

describe('Biquad lowpass/highpass design', () => {
  it('lowpass passes DC with unity gain', () => {
    const bq = new Biquad(designLowpass(5, 100));
    let y = 0;
    for (let i = 0; i < 500; i++) y = bq.process(1);
    expect(y).toBeCloseTo(1, 2);
  });

  it('highpass rejects DC', () => {
    const bq = new Biquad(designHighpass(5, 100));
    let y = 0;
    for (let i = 0; i < 500; i++) y = bq.process(1);
    expect(Math.abs(y)).toBeLessThan(0.02);
  });
});

describe('ButterworthBandpass', () => {
  const fs = 50;
  const bp = () => new ButterworthBandpass(0.2, 2.0, fs);

  it('rejects DC / gravity leakage', () => {
    const f = bp();
    let y = 0;
    for (let i = 0; i < 2000; i++) y = f.process(9.81);
    expect(Math.abs(y)).toBeLessThan(0.05);
  });

  it('passes a 0.5 Hz stroke-band sine near unity', () => {
    const f = bp();
    const g = sineGain((x) => f.process(x), 0.5, fs);
    // Passband gain should be close to 1 (within Butterworth ripple/skirt).
    expect(g).toBeGreaterThan(0.7);
    expect(g).toBeLessThan(1.2);
  });

  it('attenuates out-of-band low (0.03 Hz) and high (10 Hz) content', () => {
    const fLow = bp();
    const fHigh = bp();
    const gLow = sineGain((x) => fLow.process(x), 0.03, fs, 8);
    const gHigh = sineGain((x) => fHigh.process(x), 10, fs);
    expect(gLow).toBeLessThan(0.3);
    expect(gHigh).toBeLessThan(0.3);
  });

  it('is sample-rate aware: redesign keeps the passband at the new fs', () => {
    const f = new ButterworthBandpass(0.2, 2.0, 50);
    f.redesign(100);
    const g = sineGain((x) => f.process(x), 0.5, 100);
    expect(g).toBeGreaterThan(0.6);
  });
});
