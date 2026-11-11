import { describe, it, expect } from 'vitest';
import { BoatFrameEstimator, type BoatFrameOptions } from '../BoatFrameEstimator';
import type { Vec3 } from '../quaternion';

const G = 9.81;
const DT = 0.02;
const R2D = 180 / Math.PI;

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};
const angleDeg = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, Math.max(-1, dot(unit(a), unit(b))))) * R2D;

/** A phone mounted askew: none of the boat axes coincides with a phone axis. */
const UP = unit({ x: 0.25, y: -0.15, z: 0.95 });
const BOW = unit(cross(UP, cross({ x: 0.6, y: 0.8, z: 0 }, UP)));
const STARBOARD = cross(BOW, UP);

/** One stroke of surge (m/s²) with zero mean: a long gentle fall and a steep rise at the catch. */
const catchShape = (phase: number): number => {
  const p = phase - Math.floor(phase);
  return p < 0.1 ? -3 + 6 * (p / 0.1) : 3 - 6 * ((p - 0.1) / 0.9);
};
/** The same stroke run backwards in time: the steep edge now points to the stern. */
const reversedShape = (phase: number): number => catchShape(-phase);

interface Sim {
  frame: BoatFrameEstimator;
  /** Advance to time `toS`; returns the number of samples on which the bow reversed. */
  run(toS: number): number;
  t(): number;
}

interface SimConfig {
  surge?: (t: number) => number;
  sway?: (t: number) => number;
  /** Gravity direction seen by the phone; defaults to UP. */
  gravity?: (t: number) => Vec3;
  /** GPS speed reported at fix time t (one fix per second); omit for no GPS. */
  gpsSpeed?: (t: number) => number;
  bow?: Vec3;
  options?: BoatFrameOptions;
}

function simulate(cfg: SimConfig): Sim {
  const frame = new BoatFrameEstimator(cfg.options);
  const bow = cfg.bow ?? BOW;
  const stb = cross(bow, UP);
  let i = 0;
  const lin = { x: 0, y: 0, z: 0 };
  const accel = { x: 0, y: 0, z: 0 };
  return {
    frame,
    t: () => i * DT,
    run(toS: number): number {
      let flips = 0;
      for (; i * DT < toS; i++) {
        const t = i * DT;
        if (cfg.gpsSpeed && i > 0 && i % 50 === 0) frame.updateGps(cfg.gpsSpeed(t));
        const s = cfg.surge ? cfg.surge(t) : 0;
        const w = cfg.sway ? cfg.sway(t) : 0;
        const g = cfg.gravity ? cfg.gravity(t) : UP;
        lin.x = s * bow.x + w * stb.x;
        lin.y = s * bow.y + w * stb.y;
        lin.z = s * bow.z + w * stb.z;
        accel.x = lin.x + G * g.x;
        accel.y = lin.y + G * g.y;
        accel.z = lin.z + G * g.z;
        if (frame.update(g, lin, accel, i === 0 ? 0 : DT)) flips++;
      }
      return flips;
    },
  };
}

const STROKE_S = 2.5;
const rowing = (shape: (phase: number) => number) => (t: number) => shape(t / STROKE_S);

/**
 * Speed that goes with a surge of `shape` plus a build of `gain` m/s over
 * `rampS` seconds starting at `fromS`, and the matching surge.
 */
function withSpeedChange(shape: (phase: number) => number, fromS: number, rampS: number, gain: number) {
  const extra = (t: number) => (t >= fromS && t < fromS + rampS ? gain / rampS : 0);
  const surge = (t: number) => shape(t / STROKE_S) + extra(t);
  const speeds: number[] = [];
  let v = 3;
  for (let i = 0; i < 400 / DT; i++) {
    speeds.push(v);
    v += surge(i * DT) * DT;
  }
  const speedAt = (t: number) => speeds[Math.max(0, Math.min(speeds.length - 1, Math.round(t / DT)))];
  return { surge, speedAt };
}

describe('BoatFrameEstimator: axes', () => {
  it('finds up, the fore-aft axis and a right-handed starboard in an askew phone', () => {
    const sim = simulate({ surge: rowing(catchShape), sway: (t) => 0.5 * Math.sin(7 * t) });
    sim.run(30);
    const f = sim.frame;
    expect(angleDeg(f.up, UP)).toBeLessThan(0.01);
    expect(angleDeg(f.bow, BOW)).toBeLessThan(1);
    expect(angleDeg(f.starboard, STARBOARD)).toBeLessThan(1);
    expect(Math.abs(dot(f.bow, f.up))).toBeLessThan(1e-9);
    expect(angleDeg(f.starboard, cross(f.bow, f.up))).toBeLessThan(1e-6);
  });

  it('keeps the axis perpendicular to up when the phone is pitched in the boat', () => {
    // Gravity removal that is slightly off leaves a vertical component in the
    // linear acceleration; the axis must not follow it out of the horizontal.
    const sim = simulate({ surge: rowing(catchShape) });
    sim.run(30);
    expect(Math.abs(dot(sim.frame.bow, UP))).toBeLessThan(1e-3);
  });
});

describe('BoatFrameEstimator: level reference', () => {
  it('takes a constant lean as level', () => {
    const leaning = unit({ x: UP.x + 0.08, y: UP.y, z: UP.z });
    const sim = simulate({ surge: rowing(catchShape), gravity: () => leaning });
    sim.run(20);
    expect(angleDeg(sim.frame.up, leaning)).toBeLessThan(1e-6);
  });

  it('forgets a 5° lean held for the first 3 s within 10 s', () => {
    const lean = unit({ x: UP.x + Math.tan(5 / R2D) * STARBOARD.x, y: UP.y + Math.tan(5 / R2D) * STARBOARD.y, z: UP.z + Math.tan(5 / R2D) * STARBOARD.z });
    const sim = simulate({ surge: rowing(catchShape), gravity: (t) => (t < 3 ? lean : UP) });
    let settled = 0;
    for (let t = 0.5; t <= 60; t += 0.5) {
      sim.run(t);
      if (angleDeg(sim.frame.up, UP) >= 0.5) settled = t + 0.5;
    }
    console.info(`[boat frame] 5° lean for the first 3 s: level reference within 0.5° after ${settled.toFixed(1)} s`);
    // Weights grow linearly with time: 5° · (3 / t)² falls below 0.5° at 9.5 s.
    expect(settled).toBeLessThan(10);
    expect(angleDeg(sim.frame.up, UP)).toBeLessThan(0.02);
  });

  it('follows a lasting change of trim with its time constant', () => {
    const lean = unit({ x: UP.x + 0.05 * STARBOARD.x, y: UP.y + 0.05 * STARBOARD.y, z: UP.z + 0.05 * STARBOARD.z });
    const sim = simulate({ surge: rowing(catchShape), gravity: (t) => (t < 300 ? UP : lean), options: { levelTauS: 60 } });
    sim.run(300);
    expect(angleDeg(sim.frame.up, UP)).toBeLessThan(1e-6);
    sim.run(360);
    const total = angleDeg(lean, UP);
    // One time constant: 63 % of the way.
    expect(angleDeg(sim.frame.up, UP) / total).toBeGreaterThan(0.58);
    expect(angleDeg(sim.frame.up, UP) / total).toBeLessThan(0.68);
  });
});

describe('BoatFrameEstimator: bow from the stroke shape', () => {
  it('points the bow along the steep edge of the stroke, whichever way the phone faces', () => {
    for (const bow of [BOW, { x: -BOW.x, y: -BOW.y, z: -BOW.z }]) {
      const sim = simulate({ surge: rowing(catchShape), bow });
      sim.run(30);
      expect(dot(sim.frame.bow, bow)).toBeGreaterThan(0.999);
      expect(sim.frame.getBowSignSource()).toBe('shape');
      expect(sim.frame.getJerkSkewness()).toBeGreaterThan(1);
      expect(sim.frame.getBowConfidence()).toBe(1);
    }
  });

  it('does not decide before the axis has been learned, and then at most once', () => {
    for (const bow of [BOW, { x: -BOW.x, y: -BOW.y, z: -BOW.z }]) {
      const sim = simulate({ surge: rowing(catchShape), bow, options: { minLearnTimeS: 8 } });
      expect(sim.run(7.5)).toBe(0);
      sim.run(120);
      expect(sim.frame.getFlipCount()).toBeLessThanOrEqual(1);
      expect(dot(sim.frame.bow, bow)).toBeGreaterThan(0.999);
    }
  });

  it('reports no confidence for a stroke without a steeper edge', () => {
    const sim = simulate({ surge: (t) => 3 * Math.sin((2 * Math.PI * t) / STROKE_S) });
    sim.run(60);
    expect(sim.frame.getBowSignSource()).toBe('shape');
    expect(sim.frame.getBowConfidence()).toBeLessThan(0.05);
  });

  it('keeps axis and bow through ten minutes of sitting still', () => {
    const sim = simulate({
      surge: (t) => (t < 40 ? catchShape(t / STROKE_S) : 0.05 * Math.sin(40 * t)),
      sway: (t) => (t < 40 ? 0 : 0.1 * Math.sin(31 * t)),
    });
    sim.run(40);
    const learned = sim.frame.getActiveTime();
    const before = { ...sim.frame.bow };
    expect(sim.run(640)).toBe(0);
    // The 2 s activity average needs some seconds to fall from rowing to the floor.
    expect(sim.frame.getActiveTime() - learned).toBeLessThan(12);
    expect(angleDeg(sim.frame.bow, before)).toBeLessThan(0.5);
  });
});

describe('BoatFrameEstimator: bow from GPS', () => {
  it('confirms the bow from one speed change when the stroke shape says nothing', () => {
    const sine = (phase: number) => 3 * Math.sin(2 * Math.PI * phase);
    for (const bow of [BOW, { x: -BOW.x, y: -BOW.y, z: -BOW.z }]) {
      for (const latencyS of [0, 1.5]) {
        const { surge, speedAt } = withSpeedChange(sine, 30, 8, 2.5);
        const sim = simulate({ surge, bow, gpsSpeed: (t) => speedAt(t - latencyS) });
        sim.run(30);
        expect(sim.frame.getBowSignSource()).toBe('shape');
        let lockedAt = Infinity;
        for (let t = 31; t <= 90 && lockedAt === Infinity; t++) {
          sim.run(t);
          if (sim.frame.getBowSignSource() === 'gps') lockedAt = t;
        }
        expect(lockedAt).toBeLessThan(60);
        expect(dot(sim.frame.bow, bow)).toBeGreaterThan(0.999);
        expect(sim.frame.getGpsEvidence()).toBeGreaterThan(0);
        expect(sim.frame.getBowConfidence()).toBeGreaterThan(0.9);
      }
    }
  });

  it('is unmoved by a constant accelerometer offset', () => {
    // The offset is carried by `accel` only, as a real sensor bias would be.
    const sine = (phase: number) => 3 * Math.sin(2 * Math.PI * phase);
    const { surge, speedAt } = withSpeedChange(sine, 30, 8, 2.5);
    const a = simulate({ surge, gpsSpeed: (t) => speedAt(t - 1) });
    const frame = new BoatFrameEstimator();
    const lin = { x: 0, y: 0, z: 0 };
    const accel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i * DT < 90; i++) {
      const t = i * DT;
      if (i > 0 && i % 50 === 0) frame.updateGps(speedAt(t - 1));
      const s = surge(t);
      lin.x = s * BOW.x;
      lin.y = s * BOW.y;
      lin.z = s * BOW.z;
      accel.x = lin.x + G * UP.x + 0.4;
      accel.y = lin.y + G * UP.y - 0.3;
      accel.z = lin.z + G * UP.z + 0.2;
      frame.update(UP, lin, accel, i === 0 ? 0 : DT);
    }
    a.run(90);
    expect(frame.getBowSignSource()).toBe('gps');
    expect(frame.getGpsEvidence()).toBeCloseTo(a.frame.getGpsEvidence(), 6);
  });

  it('overrules the stroke shape, reports the reversal once, and keeps the bow afterwards', () => {
    // The steep edge points to the stern here, so the shape rule picks the stern.
    const { surge, speedAt } = withSpeedChange(reversedShape, 30, 8, 2.5);
    const sim = simulate({ surge, gpsSpeed: (t) => speedAt(t - 1) });
    sim.run(30);
    expect(dot(sim.frame.bow, BOW)).toBeLessThan(-0.999);
    const flipsBefore = sim.frame.getFlipCount();

    expect(sim.run(120)).toBe(1);
    expect(sim.frame.getFlipCount()).toBe(flipsBefore + 1);
    expect(sim.frame.getBowSignSource()).toBe('gps');
    expect(dot(sim.frame.bow, BOW)).toBeGreaterThan(0.999);
    expect(angleDeg(sim.frame.starboard, STARBOARD)).toBeLessThan(1);

    // The evidence fades with its memory; the confirmed bow stays.
    expect(sim.run(900)).toBe(0);
    expect(sim.frame.getBowSignSource()).toBe('gps');
    expect(dot(sim.frame.bow, BOW)).toBeGreaterThan(0.999);
    expect(sim.frame.getGpsEvidence()).toBeLessThan(0.01);
    expect(sim.frame.getBowConfidence()).toBeGreaterThanOrEqual(0.5);
  });

  it('is not overturned by a GPS speed step that the accelerometer does not show', () => {
    const sine = (phase: number) => 3 * Math.sin(2 * Math.PI * phase);
    const first = withSpeedChange(sine, 30, 8, 2.5);
    let contrary = 0;
    const sim = simulate({
      surge: first.surge,
      // From 200 s on the GPS claims speed changes of its own that the boat does not make.
      gpsSpeed: (t) => first.speedAt(t - 1) + contrary * Math.max(0, Math.min(1, (t - 200) / 8)),
    });
    sim.run(190);
    expect(sim.frame.getBowSignSource()).toBe('gps');
    expect(dot(sim.frame.bow, BOW)).toBeGreaterThan(0.999);

    // A GPS glitch with nothing behind it in the accelerometer is no evidence either way.
    contrary = -2.5;
    expect(sim.run(400)).toBe(0);
    expect(dot(sim.frame.bow, BOW)).toBeGreaterThan(0.999);
  });

  it('follows the GPS when later evidence contradicts an earlier confirmation', () => {
    // As if the phone had been turned round in its mount at 200 s: the same
    // boat motion now reads with the opposite sign along the axis.
    const sine = (phase: number) => 3 * Math.sin(2 * Math.PI * phase);
    const extra = (t: number) => ((t >= 30 && t < 38) || (t >= 230 && t < 238) ? 2.5 / 8 : 0);
    const boatSurge = (t: number) => sine(t / STROKE_S) + extra(t);
    const speeds: number[] = [];
    let v = 3;
    for (let i = 0; i < 400 / DT; i++) {
      speeds.push(v);
      v += boatSurge(i * DT) * DT;
    }
    const sim = simulate({
      surge: (t) => (t < 200 ? boatSurge(t) : -boatSurge(t)),
      gpsSpeed: (t) => speeds[Math.max(0, Math.round((t - 1) / DT))],
    });
    sim.run(200);
    expect(sim.frame.getBowSignSource()).toBe('gps');
    expect(dot(sim.frame.bow, BOW)).toBeGreaterThan(0.999);
    expect(sim.run(330)).toBe(1);
    expect(dot(sim.frame.bow, BOW)).toBeLessThan(-0.999);
    expect(sim.frame.getBowSignSource()).toBe('gps');
  });

  it('ignores unusable fixes and long gaps', () => {
    const sim = simulate({ surge: rowing(catchShape) });
    sim.run(20);
    const f = sim.frame;
    f.updateGps(NaN);
    f.updateGps(-1);
    f.updateGps(3);
    f.updateGps(30); // same instant as the previous fix
    sim.run(40);
    f.updateGps(9); // 20 s later: not a speed change to act on
    sim.run(41);
    f.updateGps(9);
    expect(f.getBowSignSource()).toBe('shape');
    expect(Math.abs(f.getGpsEvidence())).toBeLessThan(1e-9);
  });

  it('takes no evidence while the smoothing still remembers the start', () => {
    const sine = (phase: number) => 3 * Math.sin(2 * Math.PI * phase);
    const { surge, speedAt } = withSpeedChange(sine, 2, 6, 2.5);
    const sim = simulate({ surge, gpsSpeed: (t) => speedAt(t - 1), options: { gpsSettleS: 15 } });
    sim.run(14.9);
    expect(Math.abs(sim.frame.getGpsEvidence())).toBe(0);
    sim.run(40);
    expect(Math.abs(sim.frame.getGpsEvidence())).toBeGreaterThan(0);
  });
});

describe('BoatFrameEstimator: reset', () => {
  it('starts afresh', () => {
    const { surge, speedAt } = withSpeedChange(catchShape, 30, 8, 2.5);
    const sim = simulate({ surge, gpsSpeed: (t) => speedAt(t - 1) });
    sim.run(90);
    const f = sim.frame;
    expect(f.getBowSignSource()).toBe('gps');
    f.reset();
    expect(f.getBowSignSource()).toBe('shape');
    expect(f.getFlipCount()).toBe(0);
    expect(f.getActiveTime()).toBe(0);
    expect(Math.abs(f.getGpsEvidence())).toBe(0);
    expect(f.up).toEqual({ x: 0, y: 0, z: 1 });
  });
});
