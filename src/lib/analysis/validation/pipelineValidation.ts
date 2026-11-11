import { RowingPipeline } from '../RowingPipeline';
import type { SyntheticData, TruthStroke } from '../SyntheticRower';

/**
 * Measurement harness: runs a {@link RowingPipeline} over data with ground
 * truth and reports how far its outputs are from that truth. Pure functions
 * with no test-framework dependency, so they can also back a diagnostics view
 * or a script.
 *
 * Sign conventions are those of the truth (roll + = starboard down, pitch + =
 * bow up, surge + = toward the bow). Nothing here is sign-agnostic: an
 * estimator with a flipped axis shows up as a large error.
 */

/** Evaluation window in seconds from the first sample (defaults: whole record). */
export interface EvalWindow {
  fromS?: number;
  toS?: number;
}

/** The landmark times the harness reads from a detected stroke (IMU clock, ms). */
export interface DetectedStroke {
  catchTime: number;
  finishTime: number;
  checkTime?: number;
  firstPeakTime?: number;
}

export interface PipelineInput {
  imu: Array<{ t: number; ax: number; ay: number; az: number; gx: number; gy: number; gz: number }>;
  gps: Array<{ t: number; speed: number; accuracy: number }>;
}

export interface PipelineTrace {
  t: number[];
  roll: number[];
  pitch: number[];
  surge: number[];
  surgeLinear: number[];
  speed: number[];
  strokes: DetectedStroke[];
}

/** Feed a recording through the pipeline, delivering each GPS fix once the IMU clock reaches its time. */
export function runPipeline(input: PipelineInput, pipeline: RowingPipeline = new RowingPipeline()): PipelineTrace {
  const trace: PipelineTrace = { t: [], roll: [], pitch: [], surge: [], surgeLinear: [], speed: [], strokes: [] };
  let gpsIdx = 0;
  for (const s of input.imu) {
    while (gpsIdx < input.gps.length && input.gps[gpsIdx].t <= s.t) {
      pipeline.processGPS(input.gps[gpsIdx].speed, input.gps[gpsIdx].accuracy);
      gpsIdx++;
    }
    const out = pipeline.processIMU(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz);
    trace.t.push(s.t);
    trace.roll.push(out.roll);
    trace.pitch.push(out.pitch);
    trace.surge.push(out.surge);
    trace.surgeLinear.push(out.surgeLinear);
    trace.speed.push(out.speed);
    if (out.stroke) trace.strokes.push(out.stroke);
  }
  return trace;
}

function windowIndices(t: ArrayLike<number>, window: EvalWindow): { from: number; to: number } {
  const t0 = t.length > 0 ? t[0] : 0;
  const lo = t0 + (window.fromS ?? 0) * 1000;
  const hi = window.toS === undefined ? Infinity : t0 + window.toS * 1000;
  let from = 0;
  while (from < t.length && t[from] < lo) from++;
  let to = t.length;
  while (to > from && t[to - 1] > hi) to--;
  return { from, to };
}

export interface AngleErrorStats {
  n: number;
  /** RMS of estimate − (truth − mean(truth over the window)). */
  rms: number;
  /** Mean of that error: the constant offset of the estimate. */
  offset: number;
  /** RMS once the offset is removed: tracking error alone. */
  rmsNoOffset: number;
  peakToPeak: number;
}

/**
 * Error of an angle estimate against truth referenced to its own mean over the
 * window. Rationale: "level" is the boat's own long-term average attitude, so a
 * static lean or mount tilt is not an error, but a wrong zero or sign is.
 */
export function angleError(
  estimate: ArrayLike<number>,
  truth: ArrayLike<number>,
  t: ArrayLike<number>,
  window: EvalWindow = {},
): AngleErrorStats {
  const { from, to } = windowIndices(t, window);
  const n = to - from;
  if (n <= 0) return { n: 0, rms: NaN, offset: NaN, rmsNoOffset: NaN, peakToPeak: NaN };

  let truthMean = 0;
  for (let i = from; i < to; i++) truthMean += truth[i];
  truthMean /= n;

  let sum = 0;
  let sumSq = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = from; i < to; i++) {
    const e = estimate[i] - (truth[i] - truthMean);
    sum += e;
    sumSq += e * e;
    if (e < min) min = e;
    if (e > max) max = e;
  }
  const offset = sum / n;
  const meanSq = sumSq / n;
  return {
    n,
    rms: Math.sqrt(meanSq),
    offset,
    rmsNoOffset: Math.sqrt(Math.max(0, meanSq - offset * offset)),
    peakToPeak: max - min,
  };
}

export interface LandmarkStats {
  n: number;
  /** Median of detected − truth (ms); positive = detected late. */
  medianSigned: number;
  medianAbs: number;
  p90Abs: number;
}

export interface LandmarkReport {
  /** Truth strokes whose catch lies in the window. */
  truthStrokes: number;
  /** Of those, how many have a matching detected stroke. */
  detected: number;
  detectedFraction: number;
  /** Detected strokes with a catch in the window that match no truth stroke. */
  falseStrokes: number;
  /** falseStrokes over all detected strokes with a catch in the window. */
  falseFraction: number;
  catch: LandmarkStats | null;
  finish: LandmarkStats | null;
  /** null until the detector reports `checkTime` / `firstPeakTime`. */
  check: LandmarkStats | null;
  firstPeak: LandmarkStats | null;
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function landmarkStats(errors: number[]): LandmarkStats | null {
  if (errors.length === 0) return null;
  const signed = [...errors].sort((a, b) => a - b);
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  return {
    n: errors.length,
    medianSigned: quantileSorted(signed, 0.5),
    medianAbs: quantileSorted(abs, 0.5),
    p90Abs: quantileSorted(abs, 0.9),
  };
}

/**
 * Match detected strokes to truth strokes by nearest catch (a detected stroke
 * pairs with its nearest truth stroke if it is within half that stroke's
 * period; a truth stroke keeps only its closest candidate) and summarise the
 * timing error per landmark.
 *
 * @param window absolute IMU-clock bounds (ms) on the catch time.
 */
export function landmarkErrors(
  detected: DetectedStroke[],
  truth: TruthStroke[],
  window: { fromMs?: number; toMs?: number } = {},
): LandmarkReport {
  const fromMs = window.fromMs ?? -Infinity;
  const toMs = window.toMs ?? Infinity;
  const truthSorted = [...truth].sort((a, b) => a.catchTime - b.catchTime);

  const matchOfTruth: Array<DetectedStroke | null> = truthSorted.map(() => null);
  const matched = new Set<DetectedStroke>();
  for (const d of detected) {
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < truthSorted.length; j++) {
      const dist = Math.abs(d.catchTime - truthSorted[j].catchTime);
      if (dist < bestDist) {
        bestDist = dist;
        best = j;
      }
    }
    if (best < 0 || bestDist > 0.5 * truthSorted[best].periodMs) continue;
    const current = matchOfTruth[best];
    if (current === null || bestDist < Math.abs(current.catchTime - truthSorted[best].catchTime)) {
      if (current) matched.delete(current);
      matchOfTruth[best] = d;
      matched.add(d);
    }
  }

  const errs = { catch: [] as number[], finish: [] as number[], check: [] as number[], firstPeak: [] as number[] };
  let truthStrokes = 0;
  let found = 0;
  truthSorted.forEach((ts, j) => {
    if (ts.catchTime < fromMs || ts.catchTime > toMs) return;
    truthStrokes++;
    const d = matchOfTruth[j];
    if (!d) return;
    found++;
    errs.catch.push(d.catchTime - ts.catchTime);
    errs.finish.push(d.finishTime - ts.finishTime);
    if (typeof d.checkTime === 'number') errs.check.push(d.checkTime - ts.checkTime);
    if (typeof d.firstPeakTime === 'number') errs.firstPeak.push(d.firstPeakTime - ts.firstPeakTime);
  });

  let detectedInWindow = 0;
  let falseStrokes = 0;
  for (const d of detected) {
    if (d.catchTime < fromMs || d.catchTime > toMs) continue;
    detectedInWindow++;
    if (!matched.has(d)) falseStrokes++;
  }

  return {
    truthStrokes,
    detected: found,
    detectedFraction: truthStrokes > 0 ? found / truthStrokes : NaN,
    falseStrokes,
    falseFraction: detectedInWindow > 0 ? falseStrokes / detectedInWindow : 0,
    catch: landmarkStats(errs.catch),
    finish: landmarkStats(errs.finish),
    check: landmarkStats(errs.check),
    firstPeak: landmarkStats(errs.firstPeak),
  };
}

export interface BowSignReport {
  /** Pearson correlation of the estimated surge with the true surge over the whole window. */
  correlation: number;
  /** The same per consecutive block; the sign must hold in every one. */
  blockCorrelations: number[];
  minBlockCorrelation: number;
  /** True when every block correlates positively, i.e. + surge pointed at the bow throughout. */
  correct: boolean;
}

function correlation(a: ArrayLike<number>, b: ArrayLike<number>, from: number, to: number): number {
  const n = to - from;
  if (n < 2) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = from; i < to; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = from; i < to; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  const den = Math.sqrt(saa * sbb);
  return den > 0 ? sab / den : NaN;
}

/**
 * Does the pipeline's + surge point at the bow? The pipeline has no explicit
 * accessor, so this correlates its linear surge with the true surge, over the
 * window and over consecutive blocks (default 10 s) to catch a sign that flips
 * part-way through.
 */
export function bowSign(
  surgeEstimate: ArrayLike<number>,
  surgeTruth: ArrayLike<number>,
  t: ArrayLike<number>,
  window: EvalWindow & { blockS?: number } = {},
): BowSignReport {
  const { from, to } = windowIndices(t, window);
  const blockMs = (window.blockS ?? 10) * 1000;
  const blockCorrelations: number[] = [];
  let start = from;
  while (start < to) {
    let end = start;
    while (end < to && t[end] - t[start] < blockMs) end++;
    const full = end < to || t[end - 1] - t[start] >= 0.5 * blockMs || blockCorrelations.length === 0;
    if (full) blockCorrelations.push(correlation(surgeEstimate, surgeTruth, start, end));
    start = end;
  }
  const minBlockCorrelation = blockCorrelations.length > 0 ? Math.min(...blockCorrelations) : NaN;
  return {
    correlation: correlation(surgeEstimate, surgeTruth, from, to),
    blockCorrelations,
    minBlockCorrelation,
    correct: blockCorrelations.length > 0 && blockCorrelations.every((c) => c > 0),
  };
}

export interface ValidationOptions {
  /** Window for roll, pitch and bow sign. */
  window?: EvalWindow;
  /** Strokes with a catch before this many seconds are ignored (default: window.fromS). */
  settleS?: number;
  pipeline?: RowingPipeline;
}

export interface ValidationReport {
  roll: AngleErrorStats;
  pitch: AngleErrorStats;
  landmarks: LandmarkReport;
  bowSign: BowSignReport;
  trace: PipelineTrace;
}

/** Run the pipeline over a synthetic session and measure it against the truth. */
export function validatePipeline(data: SyntheticData, options: ValidationOptions = {}): ValidationReport {
  const window = options.window ?? {};
  const trace = runPipeline(data, options.pipeline);
  const t0 = data.imu.length > 0 ? data.imu[0].t : 0;
  const tEnd = data.imu.length > 0 ? data.imu[data.imu.length - 1].t : 0;

  // A stroke that begins too close to the end may not have been reported yet.
  const periods = data.truth.strokes.map((s) => s.periodMs).sort((a, b) => a - b);
  const tail = 1.5 * (periods.length > 0 ? quantileSorted(periods, 0.5) : 0);
  const windowEnd = window.toS === undefined ? Infinity : t0 + window.toS * 1000;

  return {
    roll: angleError(trace.roll, data.truth.rollDeg, trace.t, window),
    pitch: angleError(trace.pitch, data.truth.pitchDeg, trace.t, window),
    landmarks: landmarkErrors(trace.strokes, data.truth.strokes, {
      fromMs: t0 + (options.settleS ?? window.fromS ?? 0) * 1000,
      toMs: Math.min(windowEnd, tEnd - tail),
    }),
    bowSign: bowSign(trace.surgeLinear, data.truth.surge, trace.t, window),
    trace,
  };
}
