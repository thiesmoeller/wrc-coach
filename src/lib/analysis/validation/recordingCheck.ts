import type { DecodedData } from '../../data-storage/BinaryDataReader';
import type { RowingPipeline } from '../RowingPipeline';
import { runPipeline } from './pipelineValidation';

/**
 * Sanity check for a recorded `.wrcdata` session: there is no ground truth, so
 * this only measures what must hold for any real row (a plausible sample rate,
 * finite outputs, strokes at a human rate).
 */

export type GpsClock =
  /** GPS and IMU timestamps already share a clock. */
  | 'shared'
  /** GPS was in epoch ms; placed by its offset from the session-start header. */
  | 'session-start'
  /** GPS was in epoch ms and the header was unusable; first fix placed on the first IMU sample. */
  | 'first-sample'
  | 'no-gps';

export interface AlignedGps {
  gps: Array<{ t: number; speed: number; accuracy: number }>;
  clock: GpsClock;
}

/** Epoch milliseconds exceed any `performance.now()` value by far more than this. */
const CLOCK_MISMATCH_MS = 1e10;
const HEADER_SLACK_MS = 60_000;

/**
 * Recordings stamp IMU samples with `performance.now()` but GPS fixes with
 * epoch milliseconds. When the GPS times are far beyond the IMU times, move
 * them onto the IMU clock: the first IMU sample is taken as the session start,
 * and each fix keeps its offset from the `sessionStart` header.
 */
export function alignGpsClock(decoded: DecodedData): AlignedGps {
  const { imuSamples: imu, gpsSamples: gps } = decoded;
  if (gps.length === 0 || imu.length === 0) return { gps: [], clock: 'no-gps' };

  const imuStart = imu[0].t;
  if (gps[0].t - imuStart <= CLOCK_MISMATCH_MS) {
    return { gps: gps.map((g) => ({ t: g.t, speed: g.speed, accuracy: g.accuracy })), clock: 'shared' };
  }

  const durationMs = imu[imu.length - 1].t - imuStart;
  const firstOffset = gps[0].t - decoded.metadata.sessionStart;
  const headerUsable =
    Number.isFinite(firstOffset) && firstOffset >= -HEADER_SLACK_MS && firstOffset <= durationMs + HEADER_SLACK_MS;
  const origin = headerUsable ? decoded.metadata.sessionStart : gps[0].t;
  return {
    gps: gps.map((g) => ({ t: imuStart + (g.t - origin), speed: g.speed, accuracy: g.accuracy })),
    clock: headerUsable ? 'session-start' : 'first-sample',
  };
}

export interface RecordingSummary {
  imuCount: number;
  gpsCount: number;
  /** GPS fixes whose aligned time falls inside the IMU record (i.e. reached the pipeline). */
  gpsDelivered: number;
  gpsClock: GpsClock;
  durationS: number;
  /** From the median sample interval. */
  sampleRateHz: number;
  strokeCount: number;
  /** From the median catch-to-catch interval; NaN with fewer than two strokes. */
  medianStrokeRate: number;
  /** Every roll, pitch, surge and speed output is a finite number. */
  finiteOutputs: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

export function checkRecording(decoded: DecodedData, pipeline?: RowingPipeline): RecordingSummary {
  const imu = decoded.imuSamples;
  const aligned = alignGpsClock(decoded);
  const trace = runPipeline({ imu, gps: aligned.gps }, pipeline);

  const intervals: number[] = [];
  for (let i = 1; i < imu.length; i++) intervals.push(imu[i].t - imu[i - 1].t);
  const medianInterval = median(intervals);

  const periods: number[] = [];
  for (let i = 1; i < trace.strokes.length; i++) {
    periods.push(trace.strokes[i].catchTime - trace.strokes[i - 1].catchTime);
  }

  const lastT = imu.length > 0 ? imu[imu.length - 1].t : -Infinity;
  const channels = [trace.roll, trace.pitch, trace.surge, trace.surgeLinear, trace.speed];

  return {
    imuCount: imu.length,
    gpsCount: decoded.gpsSamples.length,
    gpsDelivered: aligned.gps.filter((g) => g.t <= lastT).length,
    gpsClock: aligned.clock,
    durationS: imu.length > 1 ? (lastT - imu[0].t) / 1000 : 0,
    sampleRateHz: medianInterval > 0 ? 1000 / medianInterval : NaN,
    strokeCount: trace.strokes.length,
    medianStrokeRate: periods.length > 0 ? 60000 / median(periods) : NaN,
    finiteOutputs: channels.every((c) => c.every(Number.isFinite)),
  };
}

export function formatRecordingSummary(name: string, s: RecordingSummary): string {
  const rate = Number.isNaN(s.medianStrokeRate) ? 'n/a' : `${s.medianStrokeRate.toFixed(1)} SPM`;
  return (
    `${name}: ${s.durationS.toFixed(1)} s, ${s.sampleRateHz.toFixed(1)} Hz, ${s.imuCount} IMU, ` +
    `${s.gpsDelivered}/${s.gpsCount} GPS fixes used (clock: ${s.gpsClock}), ` +
    `${s.strokeCount} strokes, median ${rate}, outputs ${s.finiteOutputs ? 'finite' : 'NOT finite'}`
  );
}
