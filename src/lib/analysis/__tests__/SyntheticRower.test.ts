import { describe, it, expect } from 'vitest';
import {
  APPROACH_FRACTION,
  CATCH_KICK_RISE_MS,
  REALISTIC_CATCH_PHASE,
  SCENARIOS,
  WOBBLE_FADE_MS,
  YAW_KICK_WIDTH_MS,
  createSurgeProfile,
  createSyntheticRowerStream,
  defaultDriveFraction,
  generateSyntheticRow,
  surgeShape,
  type SyntheticConfig,
  type SyntheticData,
  type SyntheticGpsFix,
  type TruthStroke,
} from '../SyntheticRower';
import type { Vec3 } from '../../dsp/quaternion';

const G = 9.81;
const D2R = Math.PI / 180;

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const accel = (d: SyntheticData, i: number): Vec3 => ({ x: d.imu[i].ax, y: d.imu[i].ay, z: d.imu[i].az });
const gyroRad = (d: SyntheticData, i: number): Vec3 => ({
  x: d.imu[i].gx * D2R,
  y: d.imu[i].gy * D2R,
  z: d.imu[i].gz * D2R,
});

/** Rotate v by the rotation vector r (Rodrigues). */
function rotate(v: Vec3, r: Vec3): Vec3 {
  const angle = norm(r);
  if (angle < 1e-15) return v;
  const k = { x: r.x / angle, y: r.y / angle, z: r.z / angle };
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kxv = cross(k, v);
  const kv = dot(k, v) * (1 - c);
  return {
    x: v.x * c + kxv.x * s + k.x * kv,
    y: v.y * c + kxv.y * s + k.y * kv,
    z: v.z * c + kxv.z * s + k.z * kv,
  };
}

/** Linear interpolation of a per-sample channel at an IMU-clock time. */
function at(d: SyntheticData, channel: number[], t: number): number {
  const dt = 1000 / d.config.rateHz;
  const x = (t - d.imu[0].t) / dt;
  const i = Math.max(0, Math.min(channel.length - 2, Math.floor(x)));
  return channel[i] + (channel[i + 1] - channel[i]) * (x - i);
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const rms = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const NOISE_FREE: SyntheticConfig = { noise: 0, gyroNoise: 0, gpsNoise: 0 };

describe('SyntheticRower: defaults keep the legacy behaviour', () => {
  const d = generateSyntheticRow();

  it('resolves the same defaults, sample count and fix count', () => {
    expect(d.config).toMatchObject({
      strokeRate: 24,
      durationS: 60,
      rateHz: 50,
      mountPitchDeg: 18,
      mountRollDeg: -6,
      mountYawDeg: 0,
      boatHeadingDeg: 40,
      rollAmpDeg: 3,
      driveAccelPeak: 3.2,
      noise: 0.05,
      gyroNoise: 0.5,
      speedMps: 4.2,
      seed: 12345,
      surgeProfile: 'legacy',
      gpsSpeedModel: 'legacy',
    });
    expect(d.imu).toHaveLength(3000);
    expect(d.gps).toHaveLength(60);
    expect(d.imu[0].t).toBe(1_000_000);
    expect(d.imu[1].t - d.imu[0].t).toBe(20);
    d.gps.forEach((fix, i) => {
      expect(fix.t).toBe(1_000_000 + i * 1000);
      expect(fix.heading).toBe(40);
      expect(fix.accuracy).toBe(5);
      expect(Math.abs(fix.speed - 4.2)).toBeLessThan(0.4);
    });
  });

  it('keeps truthRollDeg = 3°·sin(2π·cycle) and the legacy surge shape', () => {
    expect(d.truthRollDeg).toBe(d.truth.rollDeg);
    for (let i = 0; i < d.imu.length; i++) {
      const cyclePos = ((i * 20) % 2500) / 2500;
      expect(d.truthRollDeg[i]).toBeCloseTo(3 * Math.sin(2 * Math.PI * cyclePos), 9);
      expect(d.truth.surge[i]).toBeCloseTo(surgeShape(cyclePos, 3.2), 9);
      expect(d.truth.pitchDeg[i]).toBe(0);
    }
  });

  it('reports the legacy profile as it is: non-zero mean, shallow check, 34 % drive', () => {
    const p = createSurgeProfile();
    expect(p.mean).toBeCloseTo(0.636, 2);
    expect(p.at(p.landmarks.check)).toBeCloseTo(-0.5, 3);
    expect(d.config.driveFraction).toBeCloseTo(0.3405, 3);
    expect(d.config.checkDepth).toBeCloseTo(0.5, 3);
  });
});

describe('SyntheticRower: realistic surge profile', () => {
  const rates = [16, 18, 20, 24, 28, 32, 36, 40];

  it('is zero-mean over a cycle at every rate', () => {
    for (const strokeRate of rates) {
      const p = createSurgeProfile({ surgeProfile: 'realistic', strokeRate });
      expect(Math.abs(p.mean)).toBeLessThan(1e-6);
    }
    const d = generateSyntheticRow({ surgeProfile: 'realistic', strokeRate: 24, durationS: 50, rateHz: 100 });
    expect(Math.abs(mean(d.truth.surge))).toBeLessThan(1e-3);
  });

  it('has a deep, narrow check, a steep catch, a twin-peak drive and a mild recovery (24 SPM)', () => {
    const p = createSurgeProfile({ surgeProfile: 'realistic', strokeRate: 24 });
    const lm = p.landmarks;
    const T = 2500;
    const n = 25000; // 0.1 ms steps
    const s = Array.from({ length: n }, (_, i) => p.at(i / n));
    const idx = (phase: number) => Math.round(phase * n);

    expect(p.at(lm.check)).toBeCloseTo(-4, 6);
    expect(Math.min(...s)).toBeGreaterThan(-4.0001);

    const plateau = p.at(lm.finish + 0.5 * (1 + lm.check - lm.finish - 0.1));
    expect(plateau).toBeLessThan(0);
    expect(plateau).toBeGreaterThan(-1.2);

    // Width of the dip below the recovery level, up to the catch zero crossing.
    let i = idx(lm.check);
    while (s[i] < plateau - 0.02) i--;
    const widthMs = ((idx(lm.catch) - i) / n) * T;
    expect(widthMs).toBeGreaterThan(100);
    expect(widthMs).toBeLessThan(150);

    const slope = (p.at(lm.catch + 1e-4) - p.at(lm.catch - 1e-4)) / ((2e-4 * T) / 1000);
    expect(slope).toBeGreaterThan(30); // m/s³

    const peaks: number[] = [];
    for (let j = idx(lm.catch) + 1; j < idx(lm.finish); j++) {
      if (s[j] > s[j - 1] && s[j] >= s[j + 1]) peaks.push(j);
    }
    expect(peaks).toHaveLength(2);
    expect(peaks[0] / n).toBeCloseTo(lm.firstPeak, 3);
    expect(Math.max(s[peaks[0]], s[peaks[1]])).toBeCloseTo(2.0, 3);
    const dip = Math.min(...s.slice(peaks[0], peaks[1]));
    expect(dip).toBeGreaterThan(0.5);
    expect(dip).toBeLessThan(0.8 * s[peaks[0]]);

    // From the end of the release to the start of the check the hull only decelerates gently.
    for (let j = idx(lm.finish + 0.15); j < n; j++) {
      expect(s[j]).toBeLessThan(0);
      expect(s[j]).toBeGreaterThan(-1.2);
    }
  });

  it('default check depth is about −4 m/s² at 24 SPM and is configurable', () => {
    const d = generateSyntheticRow({ surgeProfile: 'realistic', strokeRate: 24, durationS: 1 });
    expect(d.config.checkDepth).toBeCloseTo(4, 6);
    const p = createSurgeProfile({ surgeProfile: 'realistic', strokeRate: 24, checkDepth: 6 });
    expect(p.at(p.landmarks.check)).toBeCloseTo(-6, 6);
    expect(Math.abs(p.mean)).toBeLessThan(1e-6);
  });

  it('drive fraction follows the rate (35 % at 18 SPM → 50 % at 36+) and can be overridden', () => {
    const fraction = (cfg: SyntheticConfig) => {
      const lm = createSurgeProfile({ surgeProfile: 'realistic', ...cfg }).landmarks;
      return lm.finish - lm.catch;
    };
    expect(fraction({ strokeRate: 18 })).toBeCloseTo(0.35, 4);
    expect(fraction({ strokeRate: 24 })).toBeCloseTo(0.4, 4);
    expect(fraction({ strokeRate: 36 })).toBeCloseTo(0.5, 4);
    expect(fraction({ strokeRate: 40 })).toBeCloseTo(0.5, 4);
    expect(fraction({ strokeRate: 24, driveFraction: 0.45 })).toBeCloseTo(0.45, 4);
    expect(defaultDriveFraction(18)).toBeCloseTo(0.35, 9);

    // Drive time stays roughly constant while the recovery shortens.
    const driveMs = (rate: number) => (defaultDriveFraction(rate) * 60000) / rate;
    const recoveryMs = (rate: number) => ((1 - defaultDriveFraction(rate)) * 60000) / rate;
    expect(driveMs(18) / driveMs(36)).toBeLessThan(1.5);
    expect(recoveryMs(18) / recoveryMs(36)).toBeGreaterThan(2.5);
  });

  it('puts the single-rower catch at REALISTIC_CATCH_PHASE', () => {
    const lm = createSurgeProfile({ surgeProfile: 'realistic', strokeRate: 28 }).landmarks;
    expect(lm.catch).toBeCloseTo(REALISTIC_CATCH_PHASE, 9);
    expect(lm.check).toBeLessThan(lm.catch);
    expect(lm.firstPeak).toBeGreaterThan(lm.catch);
    expect(lm.finish).toBeGreaterThan(lm.firstPeak);
  });

  it('rejects configurations it cannot make zero-mean', () => {
    expect(() =>
      createSurgeProfile({ surgeProfile: 'realistic', strokeRate: 24, driveAccelPeak: 0.2, checkDepth: 8 }),
    ).toThrow(/zero-mean/);
    expect(() => createSurgeProfile({ catchSpreadMs: 40, releaseSpreadMs: 10 })).toThrow(/legacy/);
  });
});

describe('SyntheticRower: truth landmarks', () => {
  // 23 SPM: the period (2608.7 ms) is not a multiple of the sample interval.
  const cfg: SyntheticConfig = { surgeProfile: 'realistic', strokeRate: 23, durationS: 40 };
  const d50 = generateSyntheticRow({ ...cfg, rateHz: 50 });
  const d1k = generateSyntheticRow({ ...cfg, rateHz: 1000 });

  const crossing = (d: SyntheticData, near: number, up: boolean): number => {
    const s = d.truth.surge;
    let best = NaN;
    for (let i = 0; i + 1 < s.length; i++) {
      const hit = up ? s[i] <= 0 && s[i + 1] > 0 : s[i] > 0 && s[i + 1] <= 0;
      if (!hit) continue;
      const t = d.imu[i].t + ((0 - s[i]) / (s[i + 1] - s[i])) * (d.imu[i + 1].t - d.imu[i].t);
      if (Number.isNaN(best) || Math.abs(t - near) < Math.abs(best - near)) best = t;
    }
    return best;
  };
  const extremum = (d: SyntheticData, from: number, to: number, sign: 1 | -1): number => {
    let best = -Infinity;
    let tBest = NaN;
    d.imu.forEach((smp, i) => {
      if (smp.t < from || smp.t > to) return;
      if (sign * d.truth.surge[i] > best) {
        best = sign * d.truth.surge[i];
        tBest = smp.t;
      }
    });
    return tBest;
  };

  it('lists whole strokes in order with consistent periods', () => {
    const strokes = d50.truth.strokes;
    expect(strokes.length).toBeGreaterThanOrEqual(13);
    strokes.forEach((s, i) => {
      expect(s.index).toBe(i);
      expect(s.checkTime).toBeLessThan(s.catchTime);
      expect(s.catchTime).toBeLessThan(s.firstPeakTime);
      expect(s.firstPeakTime).toBeLessThan(s.finishTime);
      expect(s.checkTime).toBeGreaterThanOrEqual(d50.imu[0].t);
      expect(s.finishTime).toBeLessThanOrEqual(d50.imu[d50.imu.length - 1].t);
      expect(s.periodMs).toBeCloseTo(60000 / 23, 6);
      if (i > 0) expect(s.catchTime - strokes[i - 1].catchTime).toBeCloseTo(strokes[i - 1].periodMs, 6);
    });
  });

  it('agree with the zero crossings and extrema of the sampled noise-free surge', () => {
    for (const s of d50.truth.strokes) {
      expect(Math.abs(crossing(d50, s.catchTime, true) - s.catchTime)).toBeLessThan(2);
      expect(Math.abs(crossing(d50, s.finishTime, false) - s.finishTime)).toBeLessThan(2);
    }
    for (const s of d1k.truth.strokes) {
      expect(Math.abs(crossing(d1k, s.catchTime, true) - s.catchTime)).toBeLessThan(0.05);
      expect(Math.abs(crossing(d1k, s.finishTime, false) - s.finishTime)).toBeLessThan(0.05);
      expect(Math.abs(extremum(d1k, s.catchTime - 400, s.catchTime, -1) - s.checkTime)).toBeLessThanOrEqual(1);
      expect(Math.abs(extremum(d1k, s.catchTime, s.catchTime + 150, 1) - s.firstPeakTime)).toBeLessThanOrEqual(1);
    }
  });

  it('are located on the continuous profile, not on the sample grid, and do not depend on the sample rate', () => {
    const offGrid = d50.truth.strokes.filter((s) => {
      const frac = ((s.catchTime - d50.imu[0].t) / 20) % 1;
      return frac > 0.02 && frac < 0.98;
    });
    expect(offGrid.length).toBeGreaterThan(d50.truth.strokes.length / 2);
    d50.truth.strokes.forEach((s, i) => {
      const other = d1k.truth.strokes[i];
      expect(s.checkTime).toBeCloseTo(other.checkTime, 6);
      expect(s.catchTime).toBeCloseTo(other.catchTime, 6);
      expect(s.firstPeakTime).toBeCloseTo(other.firstPeakTime, 6);
      expect(s.finishTime).toBeCloseTo(other.finishTime, 6);
    });
  });

  it('truth phase is 0 at each catch and rises linearly to the next', () => {
    const strokes = d50.truth.strokes;
    for (let k = 0; k + 1 < strokes.length; k++) {
      const t = strokes[k].catchTime + 0.37 * strokes[k].periodMs;
      expect(at(d50, d50.truth.phase, t)).toBeCloseTo(0.37, 6);
    }
  });

  it('startPhase sets where in the generator cycle the recording begins', () => {
    for (const startPhase of [0, 0.25, 0.5, 0.75]) {
      const real = generateSyntheticRow({ surgeProfile: 'realistic', durationS: 1, startPhase });
      expect(real.truth.phase[0]).toBeCloseTo((startPhase - REALISTIC_CATCH_PHASE + 1) % 1, 9);
      const legacy = generateSyntheticRow({ durationS: 1, startPhase });
      const legacyCatch = createSurgeProfile().landmarks.catch;
      expect(legacy.truth.phase[0]).toBeCloseTo((startPhase - legacyCatch + 1) % 1, 9);
      expect(legacy.truth.surge[0]).toBeCloseTo(surgeShape(startPhase, 3.2), 9);
    }
  });

  it('rate jitter varies the stroke period by the configured fraction', () => {
    const d = generateSyntheticRow({ surgeProfile: 'realistic', strokeRate: 30, durationS: 400, rateHz: 25, rateJitterPct: 3 });
    const periods = d.truth.strokes.map((s) => s.periodMs);
    const m = mean(periods);
    const sd = Math.sqrt(mean(periods.map((p) => (p - m) ** 2)));
    expect(m).toBeGreaterThan(2000 * 0.99);
    expect(m).toBeLessThan(2000 * 1.01);
    expect(sd / m).toBeGreaterThan(0.022);
    expect(sd / m).toBeLessThan(0.038);
  });
});

describe('SyntheticRower: speed is consistent with surge', () => {
  const trapezoid = (d: SyntheticData): number[] => {
    const dt = 1 / d.config.rateHz;
    const v = [0];
    for (let i = 1; i < d.truth.surge.length; i++) {
      v.push(v[i - 1] + 0.5 * (d.truth.surge[i - 1] + d.truth.surge[i]) * dt);
    }
    return v;
  };

  it('true speed = mean speed + integral of the noise-free surge (realistic profile)', () => {
    const d = generateSyntheticRow({ surgeProfile: 'realistic', strokeRate: 24, durationS: 50, rateHz: 200, speedMps: 4.2 });
    const v = trapezoid(d);
    for (let i = 0; i < v.length; i++) {
      expect(Math.abs(d.truth.speed[i] - d.truth.speed[0] - v[i])).toBeLessThan(0.005);
    }
    expect(mean(d.truth.speed)).toBeCloseTo(4.2, 3); // 20 whole cycles
    const swing = Math.max(...d.truth.speed) - Math.min(...d.truth.speed);
    expect(swing).toBeGreaterThan(0.8);
    expect(swing).toBeLessThan(2.0);
  });

  it('with rate jitter the speed still follows the surge integral', () => {
    const d = generateSyntheticRow({ surgeProfile: 'realistic', durationS: 60, rateHz: 200, rateJitterPct: 3 });
    const v = trapezoid(d);
    for (let i = 0; i < v.length; i += 7) {
      expect(Math.abs(d.truth.speed[i] - d.truth.speed[0] - v[i])).toBeLessThan(0.01);
    }
  });

  it('legacy profile: the consistent speed integrates the surge minus its (unphysical) mean', () => {
    const d = generateSyntheticRow({ durationS: 50, rateHz: 200, gpsSpeedModel: 'consistent' });
    const bias = createSurgeProfile().mean;
    const dt = 1 / 200;
    const perCycle = 500;
    // Per cycle, with room for the trapezoid error at the legacy profile's jumps.
    for (let start = 0; start + perCycle < d.truth.surge.length; start += perCycle) {
      let v = 0;
      for (let i = start + 1; i <= start + perCycle; i++) {
        v += (0.5 * (d.truth.surge[i - 1] + d.truth.surge[i]) - bias) * dt;
        expect(Math.abs(d.truth.speed[i] - d.truth.speed[start] - v)).toBeLessThan(0.02);
      }
      expect(d.truth.speed[start]).toBeCloseTo(d.truth.speed[0], 9);
    }
    expect(mean(d.truth.speed)).toBeCloseTo(4.2, 2);
  });

  it('GPS fixes are 1 Hz samples of the true speed, delayed by gpsLatencyMs', () => {
    for (const gpsLatencyMs of [0, 700, 1000]) {
      const d = generateSyntheticRow({ surgeProfile: 'realistic', durationS: 30, gpsLatencyMs, ...NOISE_FREE });
      const first = Math.ceil(gpsLatencyMs / 1000);
      expect(d.gps).toHaveLength(30 - first);
      d.gps.forEach((fix, i) => {
        expect(fix.t).toBe(d.imu[0].t + (first + i) * 1000);
        expect(fix.speed).toBeCloseTo(at(d, d.truth.speed, fix.t - gpsLatencyMs), 3);
      });
    }
  });

  it('GPS noise has the configured spread and the position advances with the speed', () => {
    const d = generateSyntheticRow({ surgeProfile: 'realistic', durationS: 400, rateHz: 25, gpsNoise: 0.3, boatHeadingDeg: 0 });
    const err = d.gps.map((fix) => fix.speed - at(d, d.truth.speed, fix.t));
    expect(Math.abs(mean(err))).toBeLessThan(0.06);
    expect(rms(err)).toBeGreaterThan(0.25);
    expect(rms(err)).toBeLessThan(0.35);
    const last = d.gps[d.gps.length - 1];
    const northM = (last.lat - d.gps[0].lat) * 111320;
    expect(northM).toBeGreaterThan(4.2 * 399 * 0.99);
    expect(northM).toBeLessThan(4.2 * 399 * 1.01);
    expect(last.lon).toBeCloseTo(d.gps[0].lon, 9);
  });

  it('start from rest: sits still, then builds to cruising with the matching mean acceleration', () => {
    const d = generateSyntheticRow({
      surgeProfile: 'realistic', strokeRate: 24, durationS: 60, rateHz: 200, rampUpS: 15, speedMps: 4, ...NOISE_FREE,
    });
    const rowStartS = REALISTIC_CATCH_PHASE * 2.5; // first catch
    const idx = (s: number) => Math.round(s * 200);

    for (let i = 0; i < idx(rowStartS) - 1; i++) {
      expect(d.truth.speed[i]).toBe(0);
      expect(d.truth.surge[i]).toBe(0);
    }
    expect(Math.min(...d.truth.speed)).toBeGreaterThanOrEqual(0);

    const v = trapezoid(d);
    for (let i = 0; i < v.length; i += 5) {
      expect(Math.abs(d.truth.speed[i] - v[i])).toBeLessThan(0.02);
    }

    // Mean over whole cycles: a quarter of the way up the ramp, and after it.
    const cycleMean = (fromS: number, cycles: number) =>
      mean(d.truth.speed.slice(idx(fromS), idx(fromS + cycles * 2.5)));
    expect(cycleMean(rowStartS + 15, 10)).toBeCloseTo(4, 2);
    expect(cycleMean(rowStartS + 20, 10)).toBeCloseTo(4, 2);
    expect(cycleMean(rowStartS + 2.5, 2)).toBeGreaterThan(1);
    expect(cycleMean(rowStartS + 2.5, 2)).toBeLessThan(3);

    const rampSurge = d.truth.surge.slice(idx(rowStartS), idx(rowStartS + 15));
    expect(mean(rampSurge)).toBeGreaterThan(0.2);
    const cruiseSurge = d.truth.surge.slice(idx(rowStartS + 15), idx(rowStartS + 40));
    expect(Math.abs(mean(cruiseSurge))).toBeLessThan(0.01);

    // GPS sees the build-up, and truth strokes start once the ramp is over.
    expect(d.gps[0].speed).toBe(0);
    expect(d.gps[30].speed).toBeGreaterThan(3);
    expect(d.truth.strokes.length).toBeGreaterThan(10);
    expect(d.truth.strokes[0].checkTime).toBeGreaterThanOrEqual(d.imu[0].t + (rowStartS + 15) * 1000);
  });
});

describe('SyntheticRower: accelerometer and gyroscope share one attitude trajectory', () => {
  // Everything that moves the attitude at once, but no linear acceleration, so
  // the accelerometer reads gravity alone and gives the true "up" in the phone.
  const attitudeOnly: SyntheticConfig = {
    driveAccelPeak: 0,
    durationS: 40,
    rateHz: 100,
    rollAmpDeg: 3,
    rollOffsetDeg: 1,
    approachDriftDeg: 2,
    approachWobbleDeg: 1.5,
    catchKickDeg: 1.5,
    catchYawKickDegS: 5,
    pitchAmpDeg: 1,
    rateJitterPct: 2,
    mountYawDeg: 150,
    ...NOISE_FREE,
  };

  it('accelerometer = specific force of the truth attitude (legacy defaults, noise-free)', () => {
    const d = generateSyntheticRow({ durationS: 10, ...NOISE_FREE });
    for (let i = 0; i < d.imu.length; i++) {
      const a = accel(d, i);
      expect(dot(a, d.truth.bowPhone)).toBeCloseTo(d.truth.surge[i], 9);
      expect(dot(a, d.truth.upPhone)).toBeCloseTo(G * Math.cos(d.truth.rollDeg[i] * D2R), 9);
      // + roll = starboard down: gravity's reaction leans toward port.
      const port = cross(d.truth.upPhone, d.truth.bowPhone);
      expect(dot(a, port)).toBeCloseTo(G * Math.sin(d.truth.rollDeg[i] * D2R), 9);
    }
  });

  it('bow and up are orthonormal and follow the mount (yaw 180° points the phone at the stern)', () => {
    const flat = generateSyntheticRow({ durationS: 0.1, mountPitchDeg: 0, mountRollDeg: 0, mountYawDeg: 180 });
    expect(flat.truth.bowPhone.x).toBeCloseTo(-1, 9);
    expect(flat.truth.upPhone.z).toBeCloseTo(1, 9);
    const tilted = generateSyntheticRow({ durationS: 0.1 });
    expect(norm(tilted.truth.bowPhone)).toBeCloseTo(1, 9);
    expect(norm(tilted.truth.upPhone)).toBeCloseTo(1, 9);
    expect(dot(tilted.truth.bowPhone, tilted.truth.upPhone)).toBeCloseTo(0, 9);
  });

  it('+ pitch is bow up: the bow axis then feels part of gravity', () => {
    const d = generateSyntheticRow({ driveAccelPeak: 0, rollAmpDeg: 0, pitchAmpDeg: 2, durationS: 10, ...NOISE_FREE });
    for (let i = 0; i < d.imu.length; i++) {
      expect(dot(accel(d, i), d.truth.bowPhone)).toBeCloseTo(G * Math.sin(d.truth.pitchDeg[i] * D2R), 9);
    }
    // Bow highest at the catch.
    const firstCatch = createSurgeProfile().landmarks.catch * 2500;
    expect(at(d, d.truth.pitchDeg, d.imu[0].t + firstCatch)).toBeCloseTo(2, 2);
    expect(at(d, d.truth.pitchDeg, d.imu[0].t + firstCatch + 1250)).toBeCloseTo(-2, 2);
  });

  it('integrating the gyro reproduces the gravity direction seen by the accelerometer', () => {
    const d = generateSyntheticRow(attitudeOnly);
    const dt = 1 / d.config.rateHz;
    const unit = (i: number): Vec3 => {
      const a = accel(d, i);
      const n = norm(a);
      return { x: a.x / n, y: a.y / n, z: a.z / n };
    };
    // A world-fixed vector seen from the rotating phone turns by −ω·dt.
    let up = unit(0);
    let worst = 0;
    for (let i = 1; i < d.imu.length; i++) {
      const w0 = gyroRad(d, i - 1);
      const w1 = gyroRad(d, i);
      up = rotate(up, {
        x: -0.5 * (w0.x + w1.x) * dt,
        y: -0.5 * (w0.y + w1.y) * dt,
        z: -0.5 * (w0.z + w1.z) * dt,
      });
      const ref = unit(i);
      worst = Math.max(worst, Math.acos(Math.min(1, dot(up, ref))) / D2R);
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('truth body rates are the gyro projected on the boat axes', () => {
    const d = generateSyntheticRow(attitudeOnly);
    const port = cross(d.truth.upPhone, d.truth.bowPhone);
    for (let i = 0; i < d.imu.length; i++) {
      const w: Vec3 = { x: d.imu[i].gx, y: d.imu[i].gy, z: d.imu[i].gz };
      expect(dot(w, d.truth.bowPhone)).toBeCloseTo(d.truth.rollRateDegS[i], 9);
      expect(dot(w, d.truth.upPhone)).toBeCloseTo(d.truth.yawRateDegS[i], 9);
      expect(-dot(w, port)).toBeCloseTo(d.truth.pitchRateDegS[i], 9);
    }
  });

  it('truth roll and pitch rates are the time derivatives of truth roll and pitch', () => {
    const d = generateSyntheticRow({
      driveAccelPeak: 0, durationS: 20, rateHz: 100, rollAmpDeg: 3, pitchAmpDeg: 1, ...NOISE_FREE,
    });
    const dt = 1 / d.config.rateHz;
    let maxRollRate = 0;
    for (let i = 1; i + 1 < d.imu.length; i++) {
      const rollRate = (d.truth.rollDeg[i + 1] - d.truth.rollDeg[i - 1]) / (2 * dt);
      const pitchRate = (d.truth.pitchDeg[i + 1] - d.truth.pitchDeg[i - 1]) / (2 * dt);
      expect(Math.abs(d.truth.rollRateDegS[i] - rollRate)).toBeLessThan(0.02);
      expect(Math.abs(d.truth.pitchRateDegS[i] - pitchRate)).toBeLessThan(0.02);
      // Pitching while rolled shows up on the boat's own up axis.
      const coupled = pitchRate * Math.sin(d.truth.rollDeg[i] * D2R);
      expect(Math.abs(d.truth.yawRateDegS[i] - coupled)).toBeLessThan(0.005);
      maxRollRate = Math.max(maxRollRate, d.truth.rollRateDegS[i]);
    }
    expect(maxRollRate).toBeCloseTo(3 * 2 * Math.PI * 0.4, 1);
  });

  it('gyro bias is added per phone axis', () => {
    const bias: [number, number, number] = [0.2, -0.3, 0.4];
    const clean = generateSyntheticRow({ durationS: 5 });
    const biased = generateSyntheticRow({ durationS: 5, gyroBiasDegS: bias });
    for (let i = 0; i < clean.imu.length; i++) {
      expect(biased.imu[i].gx - clean.imu[i].gx).toBeCloseTo(bias[0], 9);
      expect(biased.imu[i].gy - clean.imu[i].gy).toBeCloseTo(bias[1], 9);
      expect(biased.imu[i].gz - clean.imu[i].gz).toBeCloseTo(bias[2], 9);
      expect(biased.imu[i].ax).toBe(clean.imu[i].ax);
    }
  });

  it('turning: heading changes, the gyro sees the yaw rate and the accelerometer the centripetal v·ω', () => {
    const d = generateSyntheticRow({
      surgeProfile: 'realistic', durationS: 60, rateHz: 100, turnRateDegS: 2, rollAmpDeg: 0, speedMps: 4, ...NOISE_FREE,
    });
    const port = cross(d.truth.upPhone, d.truth.bowPhone);
    const dt = 1 / d.config.rateHz;

    // Integrate the full phone attitude: track where two world-fixed directions
    // (initial bow and initial port) end up in the phone frame.
    let bow0 = d.truth.bowPhone;
    let port0 = port;
    for (let i = 1; i < d.imu.length; i++) {
      const w0 = gyroRad(d, i - 1);
      const w1 = gyroRad(d, i);
      const step = {
        x: -0.5 * (w0.x + w1.x) * dt,
        y: -0.5 * (w0.y + w1.y) * dt,
        z: -0.5 * (w0.z + w1.z) * dt,
      };
      bow0 = rotate(bow0, step);
      port0 = rotate(port0, step);
    }
    // After a turn of ψ to port the old bow lies ψ to starboard of the new one.
    const turned = Math.atan2(-dot(bow0, port), dot(bow0, d.truth.bowPhone)) / D2R;
    const elapsedS = (d.imu.length - 1) * dt;
    expect(turned).toBeCloseTo(2 * elapsedS, 1);
    expect(dot(port0, d.truth.upPhone)).toBeCloseTo(0, 4);

    for (let i = 0; i < d.imu.length; i += 3) {
      expect(d.truth.yawRateDegS[i]).toBeCloseTo(2, 6);
      expect(dot(accel(d, i), port)).toBeCloseTo(d.truth.speed[i] * 2 * D2R, 6);
      expect(dot(accel(d, i), d.truth.bowPhone)).toBeCloseTo(d.truth.surge[i], 6);
    }
    // + yaw is to port, so the compass course falls by 2°/s.
    d.gps.forEach((fix, i) => expect(fix.heading).toBeCloseTo((40 - 2 * i + 360) % 360, 6));
  });
});

describe('SyntheticRower: roll and yaw scenarios', () => {
  const base: SyntheticConfig = { ...SCENARIOS.skiffSteady, durationS: 120 };
  const steady = generateSyntheticRow(base);
  const delta = (d: SyntheticData, channel: 'rollDeg' | 'yawRateDegS') =>
    d.truth[channel].map((v, i) => v - steady.truth[channel][i]);
  const approachStart = (strokes: TruthStroke[], k: number) =>
    strokes[k].catchTime - APPROACH_FRACTION * (strokes[k].catchTime - strokes[k - 1].finishTime);

  it('the same seed gives the same stroke timeline whatever the scenario', () => {
    const drift = generateSyntheticRow({ ...base, approachDriftDeg: 2, approachWobbleDeg: 1 });
    expect(drift.truth.strokes).toEqual(steady.truth.strokes);
  });

  it('static lean and the 1× sinusoid add up', () => {
    const cfg: SyntheticConfig = { surgeProfile: 'realistic', durationS: 10, rollAmpDeg: 2, rollOffsetDeg: 1.5 };
    const d = generateSyntheticRow(cfg);
    const flat = generateSyntheticRow({ ...cfg, rollAmpDeg: 0, rollOffsetDeg: 0 });
    expect(Math.max(...flat.truth.rollDeg.map(Math.abs))).toBe(0);
    expect(mean(d.truth.rollDeg)).toBeCloseTo(1.5, 6); // 4 whole cycles
    expect(Math.max(...d.truth.rollDeg)).toBeCloseTo(3.5, 2);
    expect(Math.min(...d.truth.rollDeg)).toBeCloseTo(-0.5, 2);
  });

  it('approach drift: level until the approach, N° at the catch, level again by the finish', () => {
    const d = generateSyntheticRow(SCENARIOS.skiffApproachDrift);
    const drift = delta(d, 'rollDeg');
    const strokes = d.truth.strokes;
    expect(Math.max(...drift)).toBeLessThanOrEqual(2 + 1e-9);
    expect(Math.min(...drift)).toBeGreaterThanOrEqual(-1e-9);
    for (let k = 1; k < strokes.length; k++) {
      const start = approachStart(strokes, k);
      const midRecovery = 0.5 * (strokes[k - 1].finishTime + start);
      expect(at(d, drift, midRecovery)).toBeCloseTo(0, 6);
      expect(at(d, drift, start)).toBeCloseTo(0, 2);
      expect(at(d, drift, 0.5 * (start + strokes[k].catchTime))).toBeCloseTo(1, 1);
      expect(at(d, drift, strokes[k].catchTime)).toBeCloseTo(2, 2);
      expect(at(d, drift, strokes[k].finishTime)).toBeCloseTo(0, 2);
    }
  });

  it('approach wobble: confined to the approach, different on every stroke', () => {
    const d = generateSyntheticRow(SCENARIOS.skiffApproachWobble);
    const wobble = delta(d, 'rollDeg');
    const strokes = d.truth.strokes;
    const dt = 1000 / d.config.rateHz;

    const atCatch: number[] = [];
    const perStrokeRms: number[] = [];
    const grid = 20;
    const ensemble = new Array<number>(grid).fill(0);
    for (let k = 1; k < strokes.length; k++) {
      const start = approachStart(strokes, k);
      const end = strokes[k].catchTime + WOBBLE_FADE_MS;
      // Silent from the end of the previous fade to the start of this approach.
      for (let t = strokes[k - 1].catchTime + WOBBLE_FADE_MS + dt; t < start - dt; t += dt) {
        expect(at(d, wobble, t)).toBeCloseTo(0, 9);
      }
      const shape: number[] = [];
      for (let g = 0; g < grid; g++) shape.push(at(d, wobble, start + ((g + 0.5) / grid) * (end - start)));
      shape.forEach((v, g) => (ensemble[g] += v / (strokes.length - 1)));
      perStrokeRms.push(rms(shape));
      atCatch.push(at(d, wobble, strokes[k].catchTime));
      expect(Math.max(...shape.map(Math.abs))).toBeLessThanOrEqual(1.5 * 1.5 + 1e-9);
    }
    expect(mean(perStrokeRms)).toBeGreaterThan(0.3);
    // Stroke-to-stroke noise: both signs at the catch, and the average stroke is nearly flat.
    expect(atCatch.filter((v) => v > 0.2).length).toBeGreaterThan(5);
    expect(atCatch.filter((v) => v < -0.2).length).toBeGreaterThan(5);
    expect(rms(ensemble)).toBeLessThan(0.4 * mean(perStrokeRms));
  });

  it('approach wobble oscillates at the configured frequency', () => {
    const cfg: SyntheticConfig = { ...base, strokeRate: 16, rateJitterPct: 0, approachWobbleDeg: 1, approachWobbleHz: 3 };
    const d = generateSyntheticRow(cfg);
    const ref = generateSyntheticRow({ ...cfg, approachWobbleDeg: 0 });
    const wobble = d.truth.rollDeg.map((v, i) => v - ref.truth.rollDeg[i]);
    const strokes = d.truth.strokes;
    // Zero crossings in the full-amplitude part of the approach are half a period (167 ms) apart.
    const gaps: number[] = [];
    for (let k = 1; k < strokes.length; k++) {
      const from = approachStart(strokes, k) + 0.3 * (strokes[k].catchTime - approachStart(strokes, k));
      let last = NaN;
      for (let t = from; t < strokes[k].catchTime; t += 1) {
        if (at(d, wobble, t) * at(d, wobble, t + 1) < 0) {
          if (!Number.isNaN(last)) gaps.push(t - last);
          last = t;
        }
      }
    }
    expect(gaps.length).toBeGreaterThan(20);
    expect(mean(gaps)).toBeGreaterThan(160);
    expect(mean(gaps)).toBeLessThan(173);
  });

  it('catch kick: a signed roll step just after the catch that decays over the drive, with a yaw-rate pulse', () => {
    const d = generateSyntheticRow(SCENARIOS.skiffUnevenCatch);
    const kick = delta(d, 'rollDeg');
    const yawRate = delta(d, 'yawRateDegS');
    const dtS = 1 / d.config.rateHz;
    for (const s of d.truth.strokes) {
      expect(at(d, kick, s.catchTime - 30)).toBeCloseTo(0, 9);
      expect(at(d, kick, s.catchTime + CATCH_KICK_RISE_MS)).toBeCloseTo(1.5, 1);
      expect(at(d, kick, 0.5 * (s.catchTime + CATCH_KICK_RISE_MS + s.finishTime))).toBeCloseTo(0.75, 1);
      expect(at(d, kick, s.finishTime + 30)).toBeCloseTo(0, 9);

      expect(at(d, yawRate, s.catchTime + YAW_KICK_WIDTH_MS / 2)).toBeCloseTo(4, 0);
      expect(at(d, yawRate, s.catchTime - 30)).toBeCloseTo(0, 6);
      // The heading is back on its line by the finish: the pulse integrates to zero over the drive.
      let heading = 0;
      d.imu.forEach((smp, i) => {
        if (smp.t >= s.catchTime - 40 && smp.t <= s.finishTime + 40) heading += yawRate[i] * dtS;
      });
      expect(Math.abs(heading)).toBeLessThan(0.01);
    }
    const flipped = generateSyntheticRow({ ...SCENARIOS.skiffUnevenCatch, catchKickDeg: -1.5, catchYawKickDegS: -4 });
    const s = flipped.truth.strokes[3];
    expect(at(flipped, delta(flipped, 'rollDeg'), s.catchTime + CATCH_KICK_RISE_MS)).toBeCloseTo(-1.5, 1);
    expect(at(flipped, delta(flipped, 'yawRateDegS'), s.catchTime + YAW_KICK_WIDTH_MS / 2)).toBeCloseTo(-4, 0);
  });

  it('crew catch spread: the surge is two half crews apart in time, so the catch rises in two steps', () => {
    const together = createSurgeProfile(SCENARIOS.crewTogether);
    const spread = createSurgeProfile(SCENARIOS.crewCatchSpread);
    const shift = 30 / (60000 / 30);
    for (let i = 0; i < 2000; i++) {
      const phase = i / 2000;
      const expected =
        0.5 * together.at((phase + shift) % 1) + 0.5 * together.at((phase - shift + 1) % 1);
      expect(spread.at(phase)).toBeCloseTo(expected, 9);
    }
    expect(Math.abs(spread.mean)).toBeLessThan(1e-6);

    // Steepest-rise instants around the catch, on a 1 ms grid.
    const T = 2000;
    const steps = (p: typeof spread): { at: number[]; steepest: number } => {
      const slope = (ms: number) => p.at((ms + 1) / T) - p.at(ms / T);
      const out: number[] = [];
      let steepest = 0;
      const from = Math.round(REALISTIC_CATCH_PHASE * T) - 200;
      for (let ms = from; ms < from + 400; ms++) {
        steepest = Math.max(steepest, slope(ms));
        if (slope(ms) > 0.02 && slope(ms) > slope(ms - 1) && slope(ms) >= slope(ms + 1)) out.push(ms);
      }
      return { at: out, steepest };
    };
    expect(steps(together).at).toHaveLength(1);
    // 60 ms is shorter than one rise (125 ms), so the two steps merge into a
    // slower, shallower catch: the "smear" a hull-mounted phone can see.
    expect(steps(spread).steepest).toBeLessThan(0.8 * steps(together).steepest);
    expect(spread.at(spread.landmarks.check)).toBeGreaterThan(0.8 * together.at(together.landmarks.check));
    const lockMs = (p: typeof spread) => (p.landmarks.firstPeak - p.landmarks.check) * T;
    expect(lockMs(spread)).toBeGreaterThan(lockMs(together) + 5);
    // A spread longer than the rise shows the two partial steps separately.
    const wide = steps(createSurgeProfile({ ...SCENARIOS.crewTogether, catchSpreadMs: 150 }));
    expect(wide.at).toHaveLength(2);
    expect(wide.at[1] - wide.at[0]).toBeGreaterThan(140);
    expect(wide.at[1] - wide.at[0]).toBeLessThan(160);

    // The release is spread the same way; the truth landmarks are those of the summed surge.
    const d = generateSyntheticRow({ ...SCENARIOS.crewCatchSpread, durationS: 20, rateHz: 1000 });
    const s = d.truth.strokes[2];
    expect(at(d, d.truth.surge, s.catchTime)).toBeCloseTo(0, 3);
    expect(at(d, d.truth.surge, s.finishTime)).toBeCloseTo(0, 3);
    const separate = createSurgeProfile({ ...SCENARIOS.crewCatchSpread, releaseSpreadMs: 0 });
    expect(Math.abs(separate.mean)).toBeLessThan(1e-6);
    expect(separate.landmarks.finish).not.toBeCloseTo(spread.landmarks.finish, 4);
  });

  it('every named scenario generates finite, self-consistent data', () => {
    for (const [name, cfg] of Object.entries(SCENARIOS)) {
      const d = generateSyntheticRow({ ...cfg, durationS: 45 });
      expect(d.config.surgeProfile, name).toBe('realistic');
      expect(d.config.gpsSpeedModel, name).toBe('consistent');
      expect(d.truth.strokes.length, name).toBeGreaterThan(5);
      for (const smp of d.imu) {
        expect(Number.isFinite(smp.ax + smp.ay + smp.az + smp.gx + smp.gy + smp.gz), name).toBe(true);
      }
      for (const fix of d.gps) {
        expect(Number.isFinite(fix.speed + fix.lat + fix.lon + fix.heading), name).toBe(true);
        expect(fix.speed, name).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('SyntheticRower: streaming', () => {
  const everything: SyntheticConfig = {
    ...SCENARIOS.skiffUnevenCatch,
    approachDriftDeg: 1,
    approachWobbleDeg: 1,
    turnRateDegS: 1,
    catchSpreadMs: 30,
    gpsLatencyMs: 700,
    durationS: 40,
    rateHz: 60,
    seed: 99,
  };

  const collect = (cfg: SyntheticConfig, samples: number, pollEvery: number) => {
    const stream = createSyntheticRowerStream(cfg);
    const imu = [];
    const roll: number[] = [];
    const surge: number[] = [];
    const speed: number[] = [];
    const gps: SyntheticGpsFix[] = [];
    const strokes: TruthStroke[] = [];
    for (let i = 0; i < samples; i++) {
      const frame = stream.nextImu();
      imu.push(frame.sample);
      roll.push(frame.truth.rollDeg);
      surge.push(frame.truth.surge);
      speed.push(frame.truth.speed);
      if (i % pollEvery === pollEvery - 1 || i === samples - 1) {
        gps.push(...stream.takeGps());
        strokes.push(...stream.takeStrokes());
      }
    }
    return { imu, roll, surge, speed, gps, strokes, stream };
  };

  it.each([
    ['legacy defaults', {} as SyntheticConfig],
    ['every scenario option at once', everything],
    ['start from rest', SCENARIOS.startFromRest as SyntheticConfig],
  ])('batch and stream produce identical samples, fixes and truth (%s)', (_name, cfg) => {
    const batch = generateSyntheticRow(cfg);
    const streamed = collect(cfg, batch.imu.length, 37);
    expect(streamed.imu).toEqual(batch.imu);
    expect(streamed.roll).toEqual(batch.truth.rollDeg);
    expect(streamed.surge).toEqual(batch.truth.surge);
    expect(streamed.speed).toEqual(batch.truth.speed);
    expect(streamed.gps).toEqual(batch.gps);
    expect(streamed.strokes).toEqual(batch.truth.strokes);
    expect(streamed.stream.config).toEqual(batch.config);
    expect(streamed.stream.bowPhone).toEqual(batch.truth.bowPhone);
    expect(streamed.stream.upPhone).toEqual(batch.truth.upPhone);
  });

  it('a GPS fix becomes available only once the IMU clock reaches its timestamp', () => {
    const stream = createSyntheticRowerStream({ surgeProfile: 'realistic', gpsLatencyMs: 1000 });
    let lastT = 0;
    let fixes = 0;
    for (let i = 0; i < 500; i++) {
      lastT = stream.nextImu().sample.t;
      for (const fix of stream.takeGps()) {
        fixes++;
        expect(fix.t).toBeLessThanOrEqual(lastT);
        expect(lastT - fix.t).toBeLessThan(20);
      }
    }
    expect(fixes).toBe(9); // fixes stamped 1 s … 9 s
  });

  it('runs indefinitely with bounded buffers, drained or not', () => {
    const cfg: SyntheticConfig = { ...everything, rateHz: 25 };
    const undrained = createSyntheticRowerStream(cfg);
    const drained = createSyntheticRowerStream(cfg);
    let maxCycles = 0;
    let last = undrained.nextImu();
    for (let i = 0; i < 100_000; i++) { // 4000 s ≈ 1470 strokes
      last = undrained.nextImu();
      drained.nextImu();
      drained.takeGps();
      drained.takeStrokes();
      if (i % 500 === 0) maxCycles = Math.max(maxCycles, undrained.bufferSizes().cycles, drained.bufferSizes().cycles);
    }
    expect(maxCycles).toBeLessThanOrEqual(8);
    expect(undrained.bufferSizes().pendingGps).toBeLessThanOrEqual(64);
    expect(undrained.bufferSizes().pendingStrokes).toBeLessThanOrEqual(64);
    expect(drained.bufferSizes()).toMatchObject({ pendingGps: 1, pendingStrokes: 0 });
    expect(Number.isFinite(last.sample.ax + last.sample.gz + last.truth.speed)).toBe(true);
    // Still rowing at the configured rate: the last strokes are one period apart.
    const strokes = undrained.takeStrokes();
    const lastStroke = strokes[strokes.length - 1];
    expect(lastStroke.index).toBeGreaterThan(1400);
    expect(lastStroke.periodMs).toBeGreaterThan((60000 / 22) * 0.9);
    expect(lastStroke.periodMs).toBeLessThan((60000 / 22) * 1.1);
  });
});
