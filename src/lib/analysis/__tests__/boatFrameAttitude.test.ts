import { describe, it, expect } from 'vitest';
import { RowingPipeline, type ProcessedSample } from '../RowingPipeline';
import { generateSyntheticRow, SCENARIOS, type SyntheticConfig, type SyntheticData } from '../SyntheticRower';
import { validatePipeline } from '../validation/pipelineValidation';

/**
 * Attitude, gyro channels and bow direction of the pipeline against the
 * synthetic truth. Measured values are printed so that the margins can be read
 * from the test log.
 */

const fmt = (v: number, digits = 2) => v.toFixed(digits);

interface RunOptions {
  /** Deliver the GPS fixes (default true). */
  gps?: boolean;
  /** Replace the GPS speed of a fix. */
  gpsSpeed?: (speed: number, index: number) => number;
  /** Constant offset added to the accelerometer (m/s², phone frame). */
  accelOffset?: [number, number, number];
  onSample?: (out: ProcessedSample, index: number, pipeline: RowingPipeline) => void;
}

function run(data: SyntheticData, options: RunOptions = {}): RowingPipeline {
  const pipeline = new RowingPipeline();
  const [ox, oy, oz] = options.accelOffset ?? [0, 0, 0];
  let g = 0;
  data.imu.forEach((s, i) => {
    if (options.gps !== false) {
      while (g < data.gps.length && data.gps[g].t <= s.t) {
        const speed = data.gps[g].speed;
        pipeline.processGPS(options.gpsSpeed ? options.gpsSpeed(speed, g) : speed, data.gps[g].accuracy);
        g++;
      }
    }
    const out = pipeline.processIMU(s.t, s.ax + ox, s.ay + oy, s.az + oz, s.gx, s.gy, s.gz);
    options.onSample?.(out, i, pipeline);
  });
  return pipeline;
}

/** Does the pipeline's bow point at the true bow? */
const bowIsRight = (pipeline: RowingPipeline, data: SyntheticData): boolean => {
  const b = pipeline.frame.bow;
  const t = data.truth.bowPhone;
  return b.x * t.x + b.y * t.y + b.z * t.z > 0;
};

/** Least-squares gain and correlation of an estimate against the truth, both with their means removed. */
function compare(est: number[], truth: number[]): { correlation: number; gain: number; meanEst: number; meanTruth: number } {
  const n = est.length;
  const meanEst = est.reduce((s, v) => s + v, 0) / n;
  const meanTruth = truth.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let ve = 0;
  let vt = 0;
  for (let i = 0; i < n; i++) {
    cov += (est[i] - meanEst) * (truth[i] - meanTruth);
    ve += (est[i] - meanEst) ** 2;
    vt += (truth[i] - meanTruth) ** 2;
  }
  return { correlation: cov / Math.sqrt(ve * vt), gain: cov / vt, meanEst, meanTruth };
}

const fromRest = (overrides: SyntheticConfig = {}): SyntheticConfig => ({
  ...SCENARIOS.startFromRest,
  durationS: 90,
  ...overrides,
});

describe('level reference', () => {
  it('reads roll within 0.5° a few seconds after a cold start with the boat leaning', () => {
    // ±3° of roll at stroke rate; the recording starts at the extremes, i.e.
    // with the boat 3° down to one side or the other.
    for (const startPhase of [0.25, 0.75]) {
      const data = generateSyntheticRow({ durationS: 120, startPhase, rollAmpDeg: 3, mountPitchDeg: 18, mountRollDeg: -6 });
      const fs = data.config.rateHz;
      const n = data.imu.length;
      const truthMean = data.truth.rollDeg.slice(n >> 1).reduce((s, v) => s + v, 0) / (n - (n >> 1));
      const error: number[] = [];
      run(data, {
        onSample: (out, i, p) => error.push((bowIsRight(p, data) ? out.roll : -out.roll) - (data.truth.rollDeg[i] - truthMean)),
      });
      // Last time the error, averaged over one second, is 0.5° or more.
      let settledS = 0;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += error[i];
        if (i >= fs) sum -= error[i - fs];
        if (i >= fs - 1 && Math.abs(sum / fs) >= 0.5) settledS = (i + 1) / fs;
      }
      console.info(
        `[level reference] cold start at roll ${fmt(data.truth.rollDeg[0], 1)}°: ` +
          `1 s mean roll error below 0.5° for good after ${fmt(settledS, 1)} s`,
      );
      expect(Math.abs(data.truth.rollDeg[0])).toBeGreaterThan(2.9);
      expect(settledS).toBeLessThan(8);
    }
  });

  it('reads a boat that always carries the same lean as level', () => {
    const data = generateSyntheticRow({ ...SCENARIOS.skiffSteady, rollOffsetDeg: 3, durationS: 60 });
    const roll: number[] = [];
    run(data, { onSample: (out, i) => i >= 20 * data.config.rateHz && roll.push(out.roll) });
    const mean = roll.reduce((s, v) => s + v, 0) / roll.length;
    expect(Math.abs(mean)).toBeLessThan(0.2);
  });
});

describe('bow sign from GPS (startFromRest: 20 s build, GPS noise 0.3 m/s, latency 1 s)', () => {
  it('confirms the true bow for 12 seeds and both ways of mounting the phone, never the stern', () => {
    const lockTimes: number[] = [];
    for (const mountYawDeg of [0, 180]) {
      for (let seed = 1; seed <= 12; seed++) {
        const data = generateSyntheticRow(fromRest({ mountYawDeg, seed }));
        let lockedAt = Infinity;
        let wrongWhileConfirmed = 0;
        const p = run(data, {
          onSample: (out, i, pipeline) => {
            if (out.bowSignSource !== 'gps') return;
            if (lockedAt === Infinity) lockedAt = i / data.config.rateHz;
            if (!bowIsRight(pipeline, data)) wrongWhileConfirmed++;
          },
        });
        expect(lockedAt).toBeLessThan(45);
        expect(wrongWhileConfirmed).toBe(0);
        expect(p.frame.getBowConfidence()).toBe(1);
        lockTimes.push(lockedAt);
      }
    }
    lockTimes.sort((a, b) => a - b);
    console.info(
      `[bow sign, GPS] startFromRest, 24 runs: confirmed after ${fmt(lockTimes[0], 1)}–${fmt(lockTimes[23], 1)} s ` +
        `(median ${fmt(lockTimes[12], 1)} s), wrong confirmations 0`,
    );
  });

  it('does so for a GPS latency of 0 to 1.5 s, at 18 to 36 SPM, and with an accelerometer offset', () => {
    for (const gpsLatencyMs of [0, 1500]) {
      for (const strokeRate of [18, 36]) {
        for (const mountYawDeg of [0, 180]) {
          const data = generateSyntheticRow(fromRest({ gpsLatencyMs, strokeRate, mountYawDeg, seed: 7 }));
          let wrongWhileConfirmed = 0;
          const p = run(data, {
            accelOffset: [0.4, -0.3, 0.2],
            onSample: (out, _i, pipeline) => {
              if (out.bowSignSource === 'gps' && !bowIsRight(pipeline, data)) wrongWhileConfirmed++;
            },
          });
          expect(p.frame.getBowSignSource()).toBe('gps');
          expect(wrongWhileConfirmed).toBe(0);
        }
      }
    }
  });

  it('confirms the bow even where the stroke shape picks the stern', () => {
    // At 40 SPM the legacy profile gives the shape rule nothing to go on (see
    // the next describe), so before the GPS speaks the bow is right for one
    // way of mounting the phone and wrong for the other.
    let reversals = 0;
    for (const mountYawDeg of [0, 180]) {
      const data = generateSyntheticRow(
        fromRest({ surgeProfile: 'legacy', gpsSpeedModel: 'consistent', strokeRate: 40, mountYawDeg, durationS: 120 }),
      );
      const p = run(data);
      expect(p.frame.getBowSignSource()).toBe('gps');
      expect(bowIsRight(p, data)).toBe(true);
      reversals += p.frame.getFlipCount();
    }
    expect(reversals).toBeGreaterThanOrEqual(1);
  });

  it('is not confirmed by GPS noise at steady speed', () => {
    // Five minutes each; 0.6 m/s is twice the noise of the start-from-rest preset.
    let worst = 0;
    for (const surgeProfile of ['realistic', 'legacy'] as const) {
      for (const strokeRate of [20, 32]) {
        for (const seed of [1, 2]) {
          const data = generateSyntheticRow({
            surgeProfile,
            strokeRate,
            seed,
            durationS: 300,
            startPhase: 0.3 * seed,
            gpsNoise: 0.6,
            gpsLatencyMs: 1000,
            mountYawDeg: 35,
            mountPitchDeg: 18,
          });
          let confirmed = 0;
          const p = run(data, {
            onSample: (out, _i, pipeline) => {
              if (out.bowSignSource === 'gps') confirmed++;
              worst = Math.max(worst, Math.abs(pipeline.frame.getGpsEvidence()));
            },
          });
          expect(confirmed).toBe(0);
          expect(p.frame.getBowSignSource()).toBe('shape');
        }
      }
    }
    console.info(`[bow sign, GPS] steady speed, GPS noise 0.6 m/s, 8 × 5 min: largest evidence ${fmt(worst, 4)} of the 0.04 needed`);
    expect(worst).toBeLessThan(0.02);
  });
});

describe('bow sign without GPS', () => {
  it('finds the bow from the stroke shape on the realistic profile at 16–40 SPM, and says how sure it is', () => {
    for (const strokeRate of [16, 24, 32, 40]) {
      for (const mountYawDeg of [0, 180]) {
        const data = generateSyntheticRow({ surgeProfile: 'realistic', strokeRate, mountYawDeg, durationS: 60 });
        let wrongAfter30 = 0;
        const p = run(data, {
          gps: false,
          onSample: (out, i, pipeline) => {
            if (i >= 30 * data.config.rateHz && !bowIsRight(pipeline, data)) wrongAfter30++;
            expect(out.bowSignSource).toBe('shape');
          },
        });
        expect(wrongAfter30).toBe(0);
        expect(p.frame.getBowConfidence()).toBeGreaterThan(0.9);
      }
    }
  });

  it('reports low confidence where the shape rule has nothing to go on (legacy profile, 40 SPM)', () => {
    const data = generateSyntheticRow({ surgeProfile: 'legacy', strokeRate: 40, durationS: 60 });
    const p = run(data, { gps: false });
    console.info(
      `[bow sign, shape] legacy profile at 40 SPM: jerk skewness ${fmt(p.frame.getJerkSkewness())}, ` +
        `confidence ${fmt(p.frame.getBowConfidence())}`,
    );
    expect(p.frame.getBowSignSource()).toBe('shape');
    expect(p.frame.getBowConfidence()).toBeLessThan(0.3);
  });
});

describe('a reversal of the bow', () => {
  // The IMU of a start from rest, but with GPS speeds that fall where the boat
  // gains speed: the stroke shape picks the true bow, the GPS then insists on
  // the opposite. What matters here is how the reversal is handled.
  const data = generateSyntheticRow(fromRest({ durationS: 120 }));
  const top = Math.max(...data.gps.map((f) => f.speed));
  const reference: ProcessedSample[] = [];
  run(data, { gps: false, onSample: (out) => reference.push(out) });

  const outputs: ProcessedSample[] = [];
  const pipeline = run(data, { gpsSpeed: (speed) => top - speed, onSample: (out) => outputs.push(out) });
  // The shape rule's own first choice, a few seconds in, may count as a
  // reversal too; it is the same with and without GPS.
  const shapeFlips = reference.filter((o) => o.bowFlipped).length;
  const flipIndex = outputs.map((o) => o.bowFlipped).lastIndexOf(true);

  it('is reported on exactly one sample, with the source that caused it', () => {
    expect(shapeFlips).toBeLessThanOrEqual(1);
    expect(reference.findIndex((o) => o.bowFlipped)).toBeLessThan(flipIndex);
    expect(outputs.filter((o) => o.bowFlipped)).toHaveLength(shapeFlips + 1);
    expect(pipeline.frame.getFlipCount()).toBe(shapeFlips + 1);
    expect(outputs[flipIndex - 1].bowSignSource).toBe('shape');
    expect(outputs[flipIndex].bowSignSource).toBe('gps');
  });

  it('negates surge, sway, roll, pitch and their rates from that sample on, and nothing else', () => {
    for (const i of [flipIndex - 1, flipIndex, flipIndex + 1, flipIndex + 500, outputs.length - 1]) {
      const sign = i < flipIndex ? 1 : -1;
      const o = outputs[i];
      const r = reference[i];
      expect(o.surgeLinear).toBeCloseTo(sign * r.surgeLinear, 9);
      expect(o.sway).toBeCloseTo(sign * r.sway, 9);
      expect(o.roll).toBeCloseTo(sign * r.roll, 9);
      expect(o.pitch).toBeCloseTo(sign * r.pitch, 9);
      expect(o.rollRate).toBeCloseTo(sign * r.rollRate, 9);
      expect(o.pitchRate).toBeCloseTo(sign * r.pitchRate, 9);
      expect(o.yawRate).toBeCloseTo(r.yawRate, 9);
      expect(o.heave).toBeCloseTo(r.heave, 9);
    }
  });

  it('continues the band-passed surge without a transient', () => {
    let worst = 0;
    for (let i = flipIndex; i < outputs.length; i++) worst = Math.max(worst, Math.abs(outputs[i].surge + reference[i].surge));
    expect(worst).toBeLessThan(1e-9);
  });

  it('restarts stroke tracking: no stroke spans the reversal, and strokes keep coming', () => {
    const tFlip = outputs[flipIndex].t;
    const strokes = pipeline.getStrokes();
    const after = strokes.filter((s) => s.catchTime >= tFlip);
    expect(strokes.filter((s) => s.catchTime < tFlip && s.finishTime > tFlip)).toHaveLength(0);
    // 22 SPM for the remaining time, less the strokes needed to start again.
    const remainingS = (outputs[outputs.length - 1].t - tFlip) / 1000;
    expect(after.length).toBeGreaterThan((remainingS / 60) * 22 - 4);
  });
});

describe('gyro channels', () => {
  const settleS = 30;
  const channels = (data: SyntheticData) => {
    const from = settleS * data.config.rateHz;
    const est = { roll: [] as number[], pitch: [] as number[], yaw: [] as number[] };
    const p = run(data, {
      onSample: (out, i) => {
        if (i < from) return;
        est.roll.push(out.rollRate);
        est.pitch.push(out.pitchRate);
        est.yaw.push(out.yawRate);
      },
    });
    expect(bowIsRight(p, data)).toBe(true);
    return {
      roll: compare(est.roll, data.truth.rollRateDegS.slice(from)),
      pitch: compare(est.pitch, data.truth.pitchRateDegS.slice(from)),
      yaw: compare(est.yaw, data.truth.yawRateDegS.slice(from)),
    };
  };
  const expectMatch = (label: string, c: { correlation: number; gain: number }) => {
    console.info(`[gyro channels] ${label}: correlation ${fmt(c.correlation, 3)}, gain ${fmt(c.gain, 3)}`);
    expect(c.correlation).toBeGreaterThan(0.95);
    expect(c.gain).toBeGreaterThan(0.95);
    expect(c.gain).toBeLessThan(1.05);
  };

  it('rollRate is d(roll)/dt, + starboard side going down, whichever way the phone faces', () => {
    for (const mountYawDeg of [35, 215]) {
      const data = generateSyntheticRow({
        surgeProfile: 'realistic',
        durationS: 90,
        rollAmpDeg: 3,
        mountYawDeg,
        mountPitchDeg: 18,
        mountRollDeg: -6,
        gyroBiasDegS: [0.2, 0.2, 0.2],
      });
      expectMatch(`rollRate, ±3° roll, phone yaw ${mountYawDeg}°`, channels(data).roll);
    }
  });

  it('pitchRate is + bow rising', () => {
    const data = generateSyntheticRow({ ...SCENARIOS.skiffSteady, pitchAmpDeg: 5, mountYawDeg: 180, durationS: 90 });
    expectMatch('pitchRate, ±5° pitch', channels(data).pitch);
  });

  it('yawRate is + bow turning to port: the kick at an uneven catch', () => {
    // Gyro noise of a real phone (0.05°/s) instead of the generator's 0.5°/s,
    // which is as large as the kick itself and would only test the noise.
    const data = generateSyntheticRow({
      ...SCENARIOS.skiffUnevenCatch,
      gyroNoise: 0.05,
      mountYawDeg: 200,
      mountPitchDeg: 10,
      durationS: 90,
    });
    const c = channels(data);
    expectMatch('yawRate, 4°/s catch kick', c.yaw);
    expectMatch('rollRate, 1.5° catch kick', c.roll);
  });

  it('yawRate reads a steady 2°/s turn to port as +2°/s, up to the gyro bias about the vertical', () => {
    const data = generateSyntheticRow({ ...SCENARIOS.turning, durationS: 90 });
    const c = channels(data);
    console.info(`[gyro channels] steady turn: yawRate mean ${fmt(c.yaw.meanEst)}°/s, truth ${fmt(c.yaw.meanTruth)}°/s`);
    // The preset's gyro bias about the vertical is 0.1°/s; nothing in an IMU can observe it.
    expect(Math.abs(c.yaw.meanEst - c.yaw.meanTruth)).toBeLessThan(0.15);
  });

  it('roll and pitch rates are free of a 1°/s gyro bias, and the attitude holds', () => {
    const data = generateSyntheticRow({
      surgeProfile: 'realistic',
      durationS: 120,
      startPhase: 0.5,
      rollAmpDeg: 3,
      pitchAmpDeg: 0.3,
      mountPitchDeg: 18,
      mountRollDeg: -6,
      gyroBiasDegS: [1, -1, 1],
    });
    const c = channels(data);
    expectMatch('rollRate under 1°/s gyro bias', c.roll);
    expect(Math.abs(c.roll.meanEst - c.roll.meanTruth)).toBeLessThan(0.05);
    expect(Math.abs(c.pitch.meanEst - c.pitch.meanTruth)).toBeLessThan(0.05);

    const r = validatePipeline(data, { window: { fromS: 45 } });
    console.info(
      `[gyro bias 1°/s] roll error RMS ${fmt(r.roll.rms)}°, pitch error RMS ${fmt(r.pitch.rms)}° ` +
        `(peak-to-peak ${fmt(r.pitch.peakToPeak)}°) from 45 s`,
    );
    expect(r.roll.rms).toBeLessThan(0.3);
    expect(r.pitch.rms).toBeLessThan(0.5);
  });
});

describe('boat axes', () => {
  it('starboard is bow × up: + sway points to starboard', () => {
    const data = generateSyntheticRow({ ...SCENARIOS.skiffSteady, mountYawDeg: 200, mountPitchDeg: 10, durationS: 60 });
    const p = run(data);
    const b = data.truth.bowPhone;
    const u = data.truth.upPhone;
    const starboard = { x: b.y * u.z - b.z * u.y, y: b.z * u.x - b.x * u.z, z: b.x * u.y - b.y * u.x };
    const s = p.frame.starboard;
    expect(s.x * starboard.x + s.y * starboard.y + s.z * starboard.z).toBeGreaterThan(0.999);
  });
});
