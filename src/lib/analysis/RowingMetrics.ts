import type { StrokeMetrics } from '../stroke-detection/AdaptiveStrokeDetector';

/**
 * Session-level aggregation of stroke metrics. These are the numbers a coach
 * actually cares about across a piece: not just the average stroke rate, but how
 * *consistent* it is (rate/length variability), how clean the catches are, and
 * how much boat "check" is bleeding off run each stroke.
 *
 * Kept as pure functions so the exact same definitions can be mirrored in the
 * offline Python analysis and unit-tested against synthetic input.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Coefficient of variation (%) — a scale-free consistency score. */
export function coeffVar(xs: number[]): number {
  const m = mean(xs);
  if (m === 0) return 0;
  return (std(xs) / Math.abs(m)) * 100;
}

/** Root-mean-square, e.g. of roll about the level line = boat "set" quality. */
export function rms(xs: number[]): number {
  if (xs.length === 0) return 0;
  return Math.sqrt(xs.reduce((a, b) => a + b * b, 0) / xs.length);
}

export interface SessionSummary {
  strokeCount: number;
  avgStrokeRate: number;
  strokeRateCv: number;      // % — lower is more metronomic
  avgDrivePercent: number;
  drivePercentCv: number;
  avgPeakDriveAccel: number;
  avgCatchSharpness: number;
  avgCheck: number;          // mean of the most-negative recovery accel (m/s²)
  distanceMeters: number;
  distancePerStroke: number; // meters of run per stroke
  avgSpeed: number;
  maxSpeed: number;
  bestSplitSeconds: number;  // seconds / 500 m at max speed
  rollRms: number;           // degrees — boat set consistency
}

export function summarizeSession(
  strokes: StrokeMetrics[],
  opts: {
    distanceMeters?: number;
    speeds?: number[];
    rollSamples?: number[];
  } = {},
): SessionSummary {
  // Strokes with a real cadence (skip the first, which has no recovery).
  const rated = strokes.filter((s) => s.strokeRate > 0);
  const rates = rated.map((s) => s.strokeRate);
  const drives = rated.map((s) => s.drivePercent);
  const peaks = strokes.map((s) => s.peakDriveAccel);
  const sharp = strokes.map((s) => s.catchSharpness);
  const checks = strokes.map((s) => s.minRecoveryAccel);

  const speeds = opts.speeds ?? [];
  const maxSpeed = speeds.length ? Math.max(...speeds) : 0;
  const avgSpeed = mean(speeds);
  const distance = opts.distanceMeters ?? 0;
  const strokeCount = strokes.length;

  return {
    strokeCount,
    avgStrokeRate: mean(rates),
    strokeRateCv: coeffVar(rates),
    avgDrivePercent: mean(drives),
    drivePercentCv: coeffVar(drives),
    avgPeakDriveAccel: mean(peaks),
    avgCatchSharpness: mean(sharp),
    avgCheck: mean(checks),
    distanceMeters: distance,
    distancePerStroke: strokeCount > 0 ? distance / strokeCount : 0,
    avgSpeed,
    maxSpeed,
    bestSplitSeconds: maxSpeed > 0 ? 500 / maxSpeed : 0,
    rollRms: rms(opts.rollSamples ?? []),
  };
}
