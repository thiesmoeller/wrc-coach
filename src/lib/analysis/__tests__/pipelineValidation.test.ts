import { describe, it, expect } from 'vitest';
import { RowingPipeline } from '../RowingPipeline';
import { generateSyntheticRow, type TruthStroke } from '../SyntheticRower';
import {
  angleError,
  bowSign,
  landmarkErrors,
  runPipeline,
  validatePipeline,
  type DetectedStroke,
} from '../validation/pipelineValidation';
import { alignGpsClock, checkRecording, formatRecordingSummary } from '../validation/recordingCheck';
import { BinaryDataWriter } from '../../data-storage/BinaryDataWriter';
import { BinaryDataReader } from '../../data-storage/BinaryDataReader';

const times = (n: number, dtMs = 20) => Array.from({ length: n }, (_, i) => 5000 + i * dtMs);

describe('angleError', () => {
  const t = times(3000);
  const truth = t.map((_, i) => 1.2 + 3 * Math.sin((2 * Math.PI * i) / 125)); // static lean + 1× roll

  it('is zero for an estimate that tracks the truth about its own mean', () => {
    const estimate = truth.map((v) => v - 1.2);
    const e = angleError(estimate, truth, t);
    expect(e.n).toBe(3000);
    expect(e.rms).toBeCloseTo(0, 9);
    expect(e.offset).toBeCloseTo(0, 9);
    expect(e.peakToPeak).toBeCloseTo(0, 9);
  });

  it('separates a constant offset from the tracking error', () => {
    const estimate = truth.map((v, i) => v - 1.2 + 2.5 + 0.1 * Math.sin(i));
    const e = angleError(estimate, truth, t);
    expect(e.offset).toBeCloseTo(2.5, 2);
    expect(e.rmsNoOffset).toBeCloseTo(0.1 / Math.SQRT2, 2);
    expect(e.rms).toBeCloseTo(Math.hypot(2.5, 0.1 / Math.SQRT2), 2);
  });

  it('is not sign-agnostic: a flipped axis is a large error', () => {
    const flipped = truth.map((v) => -(v - 1.2));
    const e = angleError(flipped, truth, t);
    expect(e.rms).toBeCloseTo((2 * 3) / Math.SQRT2, 2);
    expect(e.peakToPeak).toBeCloseTo(12, 1);
  });

  it('references the truth to its mean over the evaluation window only', () => {
    const step = t.map((_, i) => (i < 1500 ? 0 : 4)); // boat settles into a 4° lean
    const estimate = t.map(() => 0);
    expect(angleError(estimate, step, t).rms).toBeCloseTo(2, 6);
    const late = angleError(estimate, step, t, { fromS: 30 });
    expect(late.n).toBe(1500);
    expect(late.rms).toBeCloseTo(0, 9);
    expect(angleError(estimate, step, t, { fromS: 10, toS: 20 }).n).toBe(501);
    expect(angleError(estimate, step, t, { fromS: 100 }).n).toBe(0);
  });
});

describe('landmarkErrors', () => {
  const truth: TruthStroke[] = Array.from({ length: 20 }, (_, i) => ({
    index: i,
    checkTime: 10_000 + i * 2500 - 80,
    catchTime: 10_000 + i * 2500,
    firstPeakTime: 10_000 + i * 2500 + 50,
    finishTime: 10_000 + i * 2500 + 1000,
    periodMs: 2500,
  }));
  const detect = (s: TruthStroke, catchErr: number, finishErr: number): DetectedStroke => ({
    catchTime: s.catchTime + catchErr,
    finishTime: s.finishTime + finishErr,
  });

  it('reports signed and absolute timing errors per landmark', () => {
    const detected = truth.map((s, i) => detect(s, i % 2 === 0 ? 20 : 40, -10));
    const r = landmarkErrors(detected, truth);
    expect(r.truthStrokes).toBe(20);
    expect(r.detected).toBe(20);
    expect(r.detectedFraction).toBe(1);
    expect(r.falseStrokes).toBe(0);
    expect(r.catch).toMatchObject({ n: 20, medianSigned: 30, medianAbs: 30 });
    expect(r.catch!.p90Abs).toBeCloseTo(40, 6);
    expect(r.finish).toMatchObject({ n: 20, medianSigned: -10, medianAbs: 10, p90Abs: 10 });
  });

  it('check and first peak are null until the detector reports them', () => {
    const without = landmarkErrors(truth.map((s) => detect(s, 0, 0)), truth);
    expect(without.check).toBeNull();
    expect(without.firstPeak).toBeNull();

    const withFields = truth.map((s) => ({ ...detect(s, 0, 0), checkTime: s.checkTime + 12, firstPeakTime: s.firstPeakTime - 7 }));
    const r = landmarkErrors(withFields, truth);
    expect(r.check).toMatchObject({ n: 20, medianSigned: 12, medianAbs: 12 });
    expect(r.firstPeak).toMatchObject({ n: 20, medianSigned: -7, medianAbs: 7 });
  });

  it('counts missed strokes and false strokes', () => {
    const detected = truth
      .filter((_, i) => i !== 4 && i !== 9) // two missed
      .map((s) => detect(s, 15, 0));
    detected.push({ catchTime: truth[12].catchTime + 300, finishTime: truth[12].finishTime + 300 }); // double trigger
    detected.push({ catchTime: truth[4].catchTime + 1250.5, finishTime: truth[4].catchTime + 1500 }); // nearest to stroke 5, which is taken
    const r = landmarkErrors(detected, truth);
    expect(r.detected).toBe(18);
    expect(r.detectedFraction).toBeCloseTo(0.9, 9);
    expect(r.falseStrokes).toBe(2);
    expect(r.falseFraction).toBeCloseTo(2 / 20, 9);
    expect(r.catch).toMatchObject({ n: 18, medianSigned: 15 });
  });

  it('a stroke matches the nearest truth catch within half a period only', () => {
    const far = landmarkErrors([{ catchTime: truth[0].catchTime - 1300, finishTime: 0 }], truth);
    expect(far.detected).toBe(0);
    expect(far.falseStrokes).toBe(1);
    const near = landmarkErrors([{ catchTime: truth[0].catchTime - 1200, finishTime: truth[0].finishTime }], truth);
    expect(near.detected).toBe(1);
    expect(near.catch!.medianSigned).toBe(-1200);
  });

  it('applies the window to catch times', () => {
    const detected = truth.map((s) => detect(s, 5, 5));
    detected.push({ catchTime: truth[2].catchTime + 700, finishTime: 0 }); // false, before the window
    const r = landmarkErrors(detected, truth, { fromMs: truth[5].catchTime, toMs: truth[14].catchTime });
    expect(r.truthStrokes).toBe(10);
    expect(r.detected).toBe(10);
    expect(r.falseStrokes).toBe(0);
  });
});

describe('bowSign', () => {
  const t = times(3000);
  const truth = t.map((_, i) => Math.sin((2 * Math.PI * i) / 125) + 0.3 * Math.sin((2 * Math.PI * i) / 31));

  it('is correct for a surge that follows the truth, wrong for its mirror image', () => {
    const good = bowSign(truth.map((v) => 0.8 * v + 0.2), truth, t);
    expect(good.correlation).toBeCloseTo(1, 6);
    expect(good.blockCorrelations).toHaveLength(6);
    expect(good.correct).toBe(true);
    const bad = bowSign(truth.map((v) => -v), truth, t);
    expect(bad.correlation).toBeCloseTo(-1, 6);
    expect(bad.correct).toBe(false);
  });

  it('catches a sign that flips for part of the window', () => {
    const flipping = truth.map((v, i) => (i >= 2000 && i < 2500 ? -v : v));
    const r = bowSign(flipping, truth, t);
    expect(r.correlation).toBeGreaterThan(0.5);
    expect(r.minBlockCorrelation).toBeCloseTo(-1, 6);
    expect(r.correct).toBe(false);
    expect(bowSign(flipping, truth, t, { toS: 39 }).correct).toBe(true);
    expect(bowSign(flipping, truth, t, { fromS: 50 }).correct).toBe(true);
  });
});

describe('runPipeline / validatePipeline', () => {
  it('delivers each GPS fix when the IMU clock reaches its timestamp', () => {
    const events: string[] = [];
    class Spy extends RowingPipeline {
      override processIMU(...args: Parameters<RowingPipeline['processIMU']>) {
        events.push(`imu ${args[0]}`);
        return super.processIMU(...args);
      }
      override processGPS(speed: number, accuracy?: number) {
        events.push(`gps ${speed}`);
        return super.processGPS(speed, accuracy);
      }
    }
    const imu = [0, 20, 40, 60].map((t) => ({ t, ax: 0, ay: 0, az: 9.81, gx: 0, gy: 0, gz: 0 }));
    const gps = [
      { t: 20, speed: 1, accuracy: 5 },
      { t: 50, speed: 2, accuracy: 5 },
      { t: 999, speed: 3, accuracy: 5 },
    ];
    const trace = runPipeline({ imu, gps }, new Spy());
    expect(events).toEqual(['imu 0', 'gps 1', 'imu 20', 'imu 40', 'gps 2', 'imu 60']);
    expect(trace.t).toEqual([0, 20, 40, 60]);
    expect(trace.roll).toHaveLength(4);
  });

  it('measures a pipeline run against the synthetic truth', () => {
    const data = generateSyntheticRow({ durationS: 60 });
    const r = validatePipeline(data, { window: { fromS: 30 }, settleS: 15 });
    expect(r.trace.t).toHaveLength(data.imu.length);
    expect(r.roll.n).toBe(1500);
    expect(Number.isFinite(r.roll.rms)).toBe(true);
    expect(Number.isFinite(r.pitch.peakToPeak)).toBe(true);
    // Roll tracking and stroke counting are already sound on the legacy stroke.
    expect(r.roll.rmsNoOffset).toBeLessThan(0.3);
    expect(r.bowSign.correct).toBe(true);
    expect(r.landmarks.truthStrokes).toBeGreaterThan(12);
    expect(r.landmarks.detectedFraction).toBe(1);
    expect(r.landmarks.falseStrokes).toBe(0);
    expect(r.landmarks.check).toBeNull();
    // The last 1.5 periods are left out: those strokes may not be reported yet.
    const lastCatch = Math.max(...data.truth.strokes.map((s) => s.catchTime));
    const counted = data.truth.strokes.filter(
      (s) => s.catchTime >= data.imu[0].t + 15_000 && s.catchTime <= data.imu[data.imu.length - 1].t - 3750,
    );
    expect(r.landmarks.truthStrokes).toBe(counted.length);
    expect(lastCatch).toBeGreaterThan(data.imu[data.imu.length - 1].t - 3750);
  });
});

describe('recording check (the path real .wrcdata fixtures take)', () => {
  // A synthetic session pushed through the real file format, with the GPS
  // clock mismatch of real recordings reproduced: IMU in performance.now()
  // milliseconds, GPS in epoch milliseconds.
  const SESSION_START = 1_793_000_000_000;
  const data = generateSyntheticRow({ surgeProfile: 'realistic', strokeRate: 24, durationS: 90 });
  const imuStart = data.imu[0].t;
  const epochGps = data.gps.map((g) => ({ ...g, t: SESSION_START + (g.t - imuStart) }));
  const encode = (gps: typeof data.gps, sessionStart: number) =>
    new BinaryDataReader().decode(new BinaryDataWriter().encode(data.imu, gps, { sessionStart }));

  it('maps epoch GPS times onto the IMU clock through the session-start header', () => {
    const aligned = alignGpsClock(encode(epochGps, SESSION_START));
    expect(aligned.clock).toBe('session-start');
    aligned.gps.forEach((g, i) => expect(g.t).toBeCloseTo(data.gps[i].t, 6));
  });

  it('falls back to the first IMU sample when the header is unusable, and leaves a shared clock alone', () => {
    const lateFix = epochGps.map((g) => ({ ...g, t: g.t + 3000 }));
    const noHeader = alignGpsClock(encode(lateFix, SESSION_START + 86_400_000));
    expect(noHeader.clock).toBe('first-sample');
    expect(noHeader.gps[0].t).toBe(imuStart);
    expect(noHeader.gps[5].t - noHeader.gps[0].t).toBe(5000);

    const shared = alignGpsClock(encode(data.gps, SESSION_START));
    expect(shared.clock).toBe('shared');
    expect(shared.gps[7].t).toBe(data.gps[7].t);
    expect(alignGpsClock(encode([], SESSION_START)).clock).toBe('no-gps');
  });

  it('summarises a session and feeds the aligned GPS to the pipeline', () => {
    const s = checkRecording(encode(epochGps, SESSION_START));
    expect(s.imuCount).toBe(4500);
    expect(s.gpsCount).toBe(90);
    expect(s.gpsDelivered).toBe(90);
    expect(s.durationS).toBeCloseTo(89.98, 2);
    expect(s.sampleRateHz).toBeCloseTo(50, 6);
    expect(s.finiteOutputs).toBe(true);
    expect(s.strokeCount).toBeGreaterThan(25);
    expect(s.medianStrokeRate).toBeGreaterThan(22);
    expect(s.medianStrokeRate).toBeLessThan(26);
    expect(formatRecordingSummary('demo.wrcdata', s)).toMatch(
      /^demo\.wrcdata: 90\.0 s, 50\.0 Hz, 4500 IMU, 90\/90 GPS fixes used \(clock: session-start\), \d+ strokes, median 2\d\.\d SPM, outputs finite$/,
    );
  });
});
