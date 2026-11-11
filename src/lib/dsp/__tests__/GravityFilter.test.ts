import { describe, it, expect } from 'vitest';
import { GravityFilter } from '../GravityFilter';
import type { Vec3 } from '../quaternion';

const G = 9.81;
const DT = 0.02;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const angleDeg = (a: Vec3, b: Vec3): number => {
  const dot = (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
  return Math.acos(Math.min(1, Math.max(-1, dot))) * R2D;
};

/** Phone tilted so that "up" is this direction; a horizontal direction "fore" to push along. */
const UP: Vec3 = (() => {
  const v = { x: 0.3, y: -0.2, z: 0.93 };
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
})();
const FORE: Vec3 = (() => {
  // x axis made perpendicular to UP
  const d = UP.x;
  const v = { x: 1 - d * UP.x, y: -d * UP.y, z: -d * UP.z };
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
})();

interface Drive {
  /** Fore-aft acceleration at time t (m/s²). */
  surge?: (t: number) => number;
  /** Constant gyro bias (deg/s, phone frame). */
  biasDegS?: [number, number, number];
}

/** Runs a phone that does not rotate and returns the worst tilt error (deg) in [fromS, toS]. */
function runFixed(filter: GravityFilter, toS: number, fromS: number, drive: Drive = {}): number {
  const [bx, by, bz] = (drive.biasDegS ?? [0, 0, 0]).map((v) => v * D2R);
  let worst = 0;
  for (let i = 0; i * DT <= toS; i++) {
    const t = i * DT;
    const s = drive.surge ? drive.surge(t) : 0;
    filter.update(bx, by, bz, G * UP.x + s * FORE.x, G * UP.y + s * FORE.y, G * UP.z + s * FORE.z, i === 0 ? 0 : DT);
    if (t >= fromS) worst = Math.max(worst, angleDeg(filter.up, UP));
  }
  return worst;
}

describe('GravityFilter', () => {
  it('takes the accelerometer direction and magnitude at rest', () => {
    const f = new GravityFilter();
    expect(runFixed(f, 5, 0)).toBeLessThan(1e-6);
    expect(f.getGravityMagnitude()).toBeCloseTo(G, 6);
  });

  it('follows a rotation through the gyro, with the right sense', () => {
    // Rotating about the phone's x axis at ω moves "up" by u × ω: from z toward +y.
    const f = new GravityFilter();
    for (let i = 0; i <= 3000; i++) f.update(0, 0, 0, 0, 0, G, i === 0 ? 0 : DT);
    const rate = 20 * D2R;
    let worst = 0;
    for (let i = 1; i <= 50; i++) {
      const a = rate * i * DT;
      // The accelerometer is deliberately left at the starting attitude: only the gyro can be followed.
      f.update(rate, 0, 0, 0, 0, G, DT);
      worst = Math.max(worst, angleDeg(f.up, { x: 0, y: Math.sin(a), z: Math.cos(a) }));
    }
    // 20° in a second; the stale accelerometer pulls back by less than a degree.
    expect(worst).toBeLessThan(1);
    expect(f.up.y).toBeGreaterThan(Math.sin(19 * D2R));
  });

  it('settles to a low correction gain: about 0.1 /s', () => {
    const f = new GravityFilter();
    runFixed(f, 120, 0);
    expect(f.getTiltGain()).toBeGreaterThan(0.07);
    expect(f.getTiltGain()).toBeLessThan(0.14);
  });

  it('learns a constant gyro bias of 1°/s and keeps the tilt', () => {
    const f = new GravityFilter();
    const bias: [number, number, number] = [1, -1, 0.5];
    const worstLate = runFixed(f, 180, 120, { biasDegS: bias });
    console.info(
      `[gravity filter] gyro bias 1°/s: tilt error from 120 s ≤ ${worstLate.toFixed(3)}°, ` +
        `bias estimate (${[f.bias.x, f.bias.y, f.bias.z].map((v) => (v * R2D).toFixed(3)).join(', ')})°/s`,
    );
    expect(worstLate).toBeLessThan(0.1);

    // Only the horizontal part of the bias is observable; the part about "up" stays unknown.
    const along = bias[0] * UP.x + bias[1] * UP.y + bias[2] * UP.z;
    const horizontalTruth = [bias[0] - along * UP.x, bias[1] - along * UP.y, bias[2] - along * UP.z];
    const est = [f.bias.x * R2D, f.bias.y * R2D, f.bias.z * R2D];
    for (let i = 0; i < 3; i++) expect(Math.abs(est[i] - horizontalTruth[i])).toBeLessThan(0.05);
  });

  it('lets through less than 0.3° of a ±3 m/s² surge at stroke frequency', () => {
    // ±3 m/s² is ±17° on a bare inclinometer. A first-order correction at the
    // same gain would let 1.0° through at 16 SPM and 0.7° at 24.
    for (const [spm, limit] of [[16, 0.3], [24, 0.15], [36, 0.08]]) {
      const f = new GravityFilter();
      const w = (2 * Math.PI * spm) / 60;
      // Rowing starts after a minute at rest, so only the steady leak is measured.
      const worst = runFixed(f, 180, 120, { surge: (t) => (t < 60 ? 0 : 3 * Math.sin(w * (t - 60))) });
      console.info(`[gravity filter] surge leak at ${spm} SPM: ≤ ${worst.toFixed(3)}° tilt error`);
      expect(worst).toBeLessThan(limit);
    }
  });

  it('is not biased by an asymmetric but zero-mean stroke', () => {
    // Short deep check, long shallow drive, mean exactly zero over the 125
    // samples of a stroke. Normalising the accelerometer, gating or clipping
    // would all weigh the check differently and tilt the estimate (0.4° here
    // for a filter that corrects toward the normalised reading).
    const f = new GravityFilter();
    const surge = (i: number) => (i % 125 < 12 ? -6 : (6 * 12) / 113);
    const u = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 150 * 50; i++) {
      const s = surge(i);
      f.update(0, 0, 0, G * UP.x + s * FORE.x, G * UP.y + s * FORE.y, G * UP.z + s * FORE.z, i === 0 ? 0 : DT);
      if (i >= 100 * 50) {
        u.x += f.up.x;
        u.y += f.up.y;
        u.z += f.up.z;
      }
    }
    expect(angleDeg(u, UP)).toBeLessThan(0.02);
  });

  it('recovers from a cold start in the middle of a drive', () => {
    const f = new GravityFilter();
    const w = (2 * Math.PI * 24) / 60;
    // The first sample is taken at the peak of the drive: 17° wrong.
    const surge = (t: number) => 3 * Math.cos(w * t);
    const at10 = runFixed(f, 12, 10, { surge });
    const f2 = new GravityFilter();
    const at30 = runFixed(f2, 40, 30, { surge });
    console.info(`[gravity filter] cold start at the drive peak: ≤ ${at10.toFixed(2)}° at 10–12 s, ≤ ${at30.toFixed(2)}° at 30–40 s`);
    expect(at10).toBeLessThan(3);
    expect(at30).toBeLessThan(0.5);
  });

  it('reset() returns to the initial state', () => {
    const f = new GravityFilter();
    runFixed(f, 30, 0, { biasDegS: [1, 1, 1], surge: (t) => 2 * Math.sin(3 * t) });
    f.reset();
    expect(f.up).toEqual({ x: 0, y: 0, z: 1 });
    expect(f.bias).toEqual({ x: 0, y: 0, z: 0 });
    expect(f.getTiltGain()).toBe(0);
    expect(runFixed(f, 1, 0)).toBeLessThan(1e-6);
  });
});
