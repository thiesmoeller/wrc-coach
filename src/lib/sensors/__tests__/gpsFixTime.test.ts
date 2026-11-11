import { describe, it, expect } from 'vitest';
import { gpsFixTimeOnImuClock, MAX_GPS_FIX_AGE_MS } from '../gpsFixTime';

const EPOCH = 1_762_862_400_000;
const PERF = 84_250.5;

describe('gpsFixTimeOnImuClock', () => {
  it('places a fix at its own time: arrival minus its age', () => {
    expect(gpsFixTimeOnImuClock(EPOCH - 420, EPOCH, PERF)).toBeCloseTo(PERF - 420, 9);
    expect(gpsFixTimeOnImuClock(EPOCH, EPOCH, PERF)).toBe(PERF);
  });

  it('removes delivery jitter: fixes measured 1 s apart stay 1 s apart', () => {
    const first = gpsFixTimeOnImuClock(EPOCH, EPOCH + 150, PERF + 150);
    const second = gpsFixTimeOnImuClock(EPOCH + 1000, EPOCH + 1000 + 900, PERF + 1000 + 900);
    expect(second - first).toBeCloseTo(1000, 9);
  });

  it('stamps a fix from the future at its arrival', () => {
    expect(gpsFixTimeOnImuClock(EPOCH + 3_000, EPOCH, PERF)).toBe(PERF);
  });

  it('limits the age of a stale fix', () => {
    expect(gpsFixTimeOnImuClock(EPOCH - 60_000, EPOCH, PERF)).toBe(PERF - MAX_GPS_FIX_AGE_MS);
    expect(gpsFixTimeOnImuClock(EPOCH - MAX_GPS_FIX_AGE_MS, EPOCH, PERF)).toBe(PERF - MAX_GPS_FIX_AGE_MS);
    // A timestamp in another epoch altogether.
    expect(gpsFixTimeOnImuClock(784_000_000, EPOCH, PERF)).toBe(PERF - MAX_GPS_FIX_AGE_MS);
  });

  it('falls back to the arrival time when the fix has no usable timestamp', () => {
    expect(gpsFixTimeOnImuClock(NaN, EPOCH, PERF)).toBe(PERF);
    expect(gpsFixTimeOnImuClock(undefined as unknown as number, EPOCH, PERF)).toBe(PERF);
  });

  it('never returns epoch-scale values', () => {
    for (const fix of [EPOCH - 1, EPOCH, EPOCH + 1e6, 0, -5, Infinity]) {
      const t = gpsFixTimeOnImuClock(fix, EPOCH, PERF);
      expect(t).toBeLessThanOrEqual(PERF);
      expect(t).toBeGreaterThanOrEqual(PERF - MAX_GPS_FIX_AGE_MS);
    }
  });
});
