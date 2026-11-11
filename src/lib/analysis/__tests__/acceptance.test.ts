import { describe, it, expect } from 'vitest';
import { generateSyntheticRow, SCENARIOS, type SyntheticConfig } from '../SyntheticRower';
import { validatePipeline, type ValidationReport } from '../validation/pipelineValidation';

/**
 * Acceptance targets for the signal-processing rebuild, measured against
 * synthetic ground truth.
 *
 * The thresholds were fixed before the implementation existed and are not to
 * be changed, loosened, skipped or special-cased. A target the pipeline does
 * not meet yet is declared with `notYet` (vitest's `it.fails`): the suite stays
 * green while it fails, and it turns red the moment the target is reached —
 * replace `notYet` by `it` at that point so the target is held from then on.
 *
 * Each test prints its measured value, so the baseline and the progress are
 * visible in the test output.
 */
const notYet = it.fails;

const ROLL_RMS_MAX_DEG = 0.3;
const TURNING_ROLL_RMS_MAX_DEG = 0.5;
const PITCH_RMS_MAX_DEG = 1.0;
const LANDMARK_MEDIAN_ABS_MAX_MS = 30;
const MIN_DETECTED_FRACTION = 0.95;
const MAX_FALSE_FRACTION = 0.02;

const SESSION_S = 120;
/** Roll and pitch are judged from 45 s to the end of the session. */
const ATTITUDE_WINDOW = { fromS: 45 };
const LANDMARK_SETTLE_S = 15;
const BOW_SIGN_FROM_S = 30;

const fmt = (v: number | undefined, digits = 2) =>
  v === undefined || Number.isNaN(v) ? 'n/a' : v.toFixed(digits);

function rollLine(label: string, r: ValidationReport, limit: number): void {
  console.info(
    `[${label}] roll error RMS ${fmt(r.roll.rms)}° (offset ${fmt(r.roll.offset)}°, ` +
      `${fmt(r.roll.rmsNoOffset)}° without it; bow-sign correlation ${fmt(r.bowSign.correlation)}) — limit ${limit}°`,
  );
}

describe('A1 roll: error RMS < 0.3° from 45 s to the end of a 120 s session', () => {
  // 3° once-per-stroke roll, tilted phone mount, 0.2°/s gyro bias on every
  // axis; the recording starts at four different points of the stroke, i.e.
  // with the boat leaning four different ways when "Start" is pressed.
  for (const startPhase of [0, 0.25, 0.5, 0.75]) {
    it(`recording starts at stroke phase ${startPhase}`, () => {
      const data = generateSyntheticRow({
        durationS: SESSION_S,
        startPhase,
        rollAmpDeg: 3,
        mountPitchDeg: 18,
        mountRollDeg: -6,
        gyroBiasDegS: [0.2, 0.2, 0.2],
        gpsSpeedModel: 'consistent',
      });
      const r = validatePipeline(data, { window: ATTITUDE_WINDOW });
      rollLine(`A1 start phase ${startPhase}`, r, ROLL_RMS_MAX_DEG);
      expect(r.roll.rms).toBeLessThan(ROLL_RMS_MAX_DEG);
    });
  }

  for (const preset of ['skiffApproachDrift', 'skiffApproachWobble'] as const) {
    it(`${preset} preset`, () => {
      const data = generateSyntheticRow({ ...SCENARIOS[preset], durationS: SESSION_S });
      const r = validatePipeline(data, { window: ATTITUDE_WINDOW });
      rollLine(`A1 ${preset}`, r, ROLL_RMS_MAX_DEG);
      expect(r.roll.rms).toBeLessThan(ROLL_RMS_MAX_DEG);
    });
  }
});

describe('A2 pitch: error RMS < 1.0° at 24 SPM, same window', () => {
  // A small real pitch (0.3°, bow highest at the catch) so the estimate is
  // judged against truth rather than against zero.
  for (const surgeProfile of ['legacy', 'realistic'] as const) {
    it(`${surgeProfile} surge profile`, () => {
      const data = generateSyntheticRow({
        surgeProfile,
        strokeRate: 24,
        durationS: SESSION_S,
        pitchAmpDeg: 0.3,
        gpsSpeedModel: 'consistent',
      });
      const r = validatePipeline(data, { window: ATTITUDE_WINDOW });
      console.info(
        `[A2 ${surgeProfile}] pitch error RMS ${fmt(r.pitch.rms)}°, peak-to-peak ${fmt(r.pitch.peakToPeak)}° ` +
          `(offset ${fmt(r.pitch.offset)}°, ${fmt(r.pitch.rmsNoOffset)}° without it) — limit ${PITCH_RMS_MAX_DEG}° RMS`,
      );
      expect(r.pitch.rms).toBeLessThan(PITCH_RMS_MAX_DEG);
    });
  }
});

describe('A3 landmarks: realistic profile, default noise, 16–40 SPM, after a 15 s settle', () => {
  const reports = new Map<number, ValidationReport>();
  const reportFor = (strokeRate: number): ValidationReport => {
    let r = reports.get(strokeRate);
    if (!r) {
      const data = generateSyntheticRow({ surgeProfile: 'realistic', strokeRate, durationS: SESSION_S });
      r = validatePipeline(data, { window: { fromS: LANDMARK_SETTLE_S }, settleS: LANDMARK_SETTLE_S });
      reports.set(strokeRate, r);
    }
    return r;
  };
  const stat = (s: { medianAbs: number; medianSigned: number; p90Abs: number } | null) =>
    s ? `${fmt(s.medianAbs, 0)} ms (signed ${fmt(s.medianSigned, 0)}, p90 ${fmt(s.p90Abs, 0)})` : 'not reported';

  for (const strokeRate of [16, 20, 24, 28, 32, 36, 40]) {
    notYet(`${strokeRate} SPM: catch and finish within 30 ms (median abs), ≥ 95 % detected, ≤ 2 % false`, () => {
      const { landmarks: lm, bowSign } = reportFor(strokeRate);
      console.info(
        `[A3 ${strokeRate} SPM] catch ${stat(lm.catch)}, finish ${stat(lm.finish)}, ` +
          `detected ${lm.detected}/${lm.truthStrokes} (${fmt(lm.detectedFraction * 100, 1)} %), ` +
          `false ${lm.falseStrokes} (${fmt(lm.falseFraction * 100, 1)} %), bow-sign correlation ${fmt(bowSign.correlation)} ` +
          `— limits ${LANDMARK_MEDIAN_ABS_MAX_MS} ms, ${MIN_DETECTED_FRACTION * 100} %, ${MAX_FALSE_FRACTION * 100} %`,
      );
      expect(lm.truthStrokes).toBeGreaterThan(20);
      expect(lm.catch).not.toBeNull();
      expect(lm.finish).not.toBeNull();
      expect(lm.catch!.medianAbs).toBeLessThan(LANDMARK_MEDIAN_ABS_MAX_MS);
      expect(lm.finish!.medianAbs).toBeLessThan(LANDMARK_MEDIAN_ABS_MAX_MS);
      expect(lm.detectedFraction).toBeGreaterThanOrEqual(MIN_DETECTED_FRACTION);
      expect(lm.falseFraction).toBeLessThanOrEqual(MAX_FALSE_FRACTION);
    });

    // Needs `checkTime` / `firstPeakTime` on StrokeMetrics, which do not exist yet.
    notYet(`${strokeRate} SPM: check and first drive peak within 30 ms (median abs)`, () => {
      const { landmarks: lm } = reportFor(strokeRate);
      console.info(
        `[A3 ${strokeRate} SPM] check ${stat(lm.check)}, first peak ${stat(lm.firstPeak)} ` +
          `— limit ${LANDMARK_MEDIAN_ABS_MAX_MS} ms`,
      );
      expect(lm.check).not.toBeNull();
      expect(lm.firstPeak).not.toBeNull();
      expect(lm.check!.n).toBeGreaterThanOrEqual(MIN_DETECTED_FRACTION * lm.truthStrokes);
      expect(lm.firstPeak!.n).toBeGreaterThanOrEqual(MIN_DETECTED_FRACTION * lm.truthStrokes);
      expect(lm.check!.medianAbs).toBeLessThan(LANDMARK_MEDIAN_ABS_MAX_MS);
      expect(lm.firstPeak!.medianAbs).toBeLessThan(LANDMARK_MEDIAN_ABS_MAX_MS);
    });
  }
});

/** Start from rest on the realistic profile, GPS noise 0.3 m/s, latency 1000 ms, speed consistent with surge. */
const fromRest = (overrides: SyntheticConfig): SyntheticConfig => ({
  ...SCENARIOS.startFromRest,
  surgeProfile: 'realistic',
  gpsSpeedModel: 'consistent',
  gpsNoise: 0.3,
  gpsLatencyMs: 1000,
  durationS: SESSION_S,
  ...overrides,
});

function bowSignCase(label: string, config: SyntheticConfig): void {
  const data = generateSyntheticRow(config);
  const r = validatePipeline(data, { window: { fromS: BOW_SIGN_FROM_S } });
  console.info(
    `[${label}] surge correlation with truth from ${BOW_SIGN_FROM_S} s: ${fmt(r.bowSign.correlation)} ` +
      `(worst 10 s block ${fmt(r.bowSign.minBlockCorrelation)}) — must be positive throughout`,
  );
  expect(r.bowSign.correct).toBe(true);
}

describe('A4 bow sign with GPS: + surge points at the bow from 30 s onward (startFromRest)', () => {
  for (const mountYawDeg of [0, 180]) {
    for (const seed of [1, 2, 3, 4, 5]) {
      it(`phone yaw ${mountYawDeg}°, seed ${seed}`, () => {
        bowSignCase(`A4 yaw ${mountYawDeg}° seed ${seed}`, fromRest({ mountYawDeg, seed }));
      });
    }
  }
});

describe('A5 turning: roll error RMS < 0.5° on a steady 2°/s turn', () => {
  it('turning preset', () => {
    const data = generateSyntheticRow({ ...SCENARIOS.turning, turnRateDegS: 2, durationS: SESSION_S });
    const r = validatePipeline(data, { window: ATTITUDE_WINDOW });
    rollLine('A5 turning', r, TURNING_ROLL_RMS_MAX_DEG);
    expect(r.roll.rms).toBeLessThan(TURNING_ROLL_RMS_MAX_DEG);
  });
});

/**
 * Not part of the original brief. Two defects that the validation base
 * surfaced and that A1–A5 as specified do not pin down. Same rules: no new
 * numeric thresholds, only signs.
 */
describe('Additional findings (added with the validation base)', () => {
  // Bow sign on a start from rest, including racing rates where surge skewness
  // used to lock onto the stern. GPS speed changes confirm the sign; the
  // stroke-shape fallback is the surge-jerk rule.
  for (const mountYawDeg of [0, 180]) {
    for (const seed of [1, 2, 3]) {
      it(`X1 bow sign from rest at 36 SPM: phone yaw ${mountYawDeg}°, seed ${seed}`, () => {
        bowSignCase(`X1 36 SPM yaw ${mountYawDeg}° seed ${seed}`, fromRest({ strokeRate: 36, mountYawDeg, seed }));
      });
    }
  }

  // Pitch is positive when the bow is up. A 5° bow-up attitude under a light
  // stroke checks that sign on its own, apart from the surge leak A2 measures.
  it('X2 pitch sign: a bow-up attitude reads as positive pitch', () => {
    const data = generateSyntheticRow(
      fromRest({ strokeRate: 20, driveAccelPeak: 0.6, rollAmpDeg: 0, rollOffsetDeg: 0, pitchAmpDeg: 5 }),
    );
    const r = validatePipeline(data, { window: ATTITUDE_WINDOW });
    const from = Math.round(ATTITUDE_WINDOW.fromS * data.config.rateHz);
    const est = r.trace.pitch.slice(from);
    const truth = data.truth.pitchDeg.slice(from);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const me = mean(est);
    const mt = mean(truth);
    let cov = 0;
    let ve = 0;
    let vt = 0;
    for (let i = 0; i < est.length; i++) {
      cov += (est[i] - me) * (truth[i] - mt);
      ve += (est[i] - me) ** 2;
      vt += (truth[i] - mt) ** 2;
    }
    const correlation = cov / Math.sqrt(ve * vt);
    console.info(
      `[X2 pitch sign] pitch correlation with truth ${fmt(correlation)} ` +
        `(bow-sign correlation ${fmt(r.bowSign.correlation)}) — both must be positive`,
    );
    expect(r.bowSign.correct).toBe(true);
    expect(correlation).toBeGreaterThan(0);
  });
});
