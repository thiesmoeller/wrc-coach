import { describe, it, expect } from 'vitest';
import { SampleRateEstimator } from '../SampleRateEstimator';

describe('SampleRateEstimator', () => {
  it('returns fallback before enough data', () => {
    const est = new SampleRateEstimator();
    expect(est.getRate(50)).toBe(50);
    est.update(0);
    expect(est.isReady()).toBe(false);
  });

  it('estimates a steady 100 Hz stream', () => {
    const est = new SampleRateEstimator();
    for (let i = 0; i < 50; i++) est.update(i * 10); // 10 ms → 100 Hz
    expect(est.isReady()).toBe(true);
    expect(est.getRate()).toBeCloseTo(100, 1);
    expect(est.getMedianDt()).toBeCloseTo(10, 5);
  });

  it('is robust to dropped frames (median, not mean)', () => {
    const est = new SampleRateEstimator();
    let t = 0;
    for (let i = 0; i < 40; i++) {
      t += 20; // 50 Hz
      est.update(t);
      if (i % 10 === 0) {
        t += 200; // occasional long gap
        est.update(t);
      }
    }
    // Median should still reflect the dominant 20 ms interval → ~50 Hz.
    expect(est.getRate()).toBeGreaterThan(45);
    expect(est.getRate()).toBeLessThan(55);
  });

  it('clamps returned dt for integration safety', () => {
    const est = new SampleRateEstimator(64, 1, 500);
    est.update(0);
    const dt = est.update(100000); // huge gap
    expect(dt).toBeLessThanOrEqual(0.5);
    expect(dt).toBeGreaterThan(0);
  });
});
