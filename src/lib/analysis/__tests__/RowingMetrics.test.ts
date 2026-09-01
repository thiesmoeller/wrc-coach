import { describe, it, expect } from 'vitest';
import { mean, std, median, coeffVar, rms, summarizeSession } from '../RowingMetrics';
import type { StrokeMetrics } from '../../stroke-detection/AdaptiveStrokeDetector';

function makeStroke(i: number, sr: number, drive: number): StrokeMetrics {
  return {
    index: i,
    catchTime: i * 2000,
    finishTime: i * 2000 + 700,
    driveTime: 700,
    recoveryTime: 1400,
    strokeRate: sr,
    drivePercent: drive,
    peakDriveAccel: 3,
    catchSharpness: 20,
    minRecoveryAccel: -0.4,
  };
}

describe('RowingMetrics helpers', () => {
  it('computes basic statistics', () => {
    expect(mean([1, 2, 3])).toBeCloseTo(2);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(std([2, 2, 2])).toBe(0);
    expect(rms([3, 4])).toBeCloseTo(Math.sqrt((9 + 16) / 2));
  });

  it('coefficient of variation reflects consistency', () => {
    const steady = coeffVar([20, 20.1, 19.9, 20]);
    const ragged = coeffVar([18, 24, 16, 26]);
    expect(steady).toBeLessThan(2);
    expect(ragged).toBeGreaterThan(steady);
  });
});

describe('summarizeSession', () => {
  it('aggregates a steady piece', () => {
    const strokes = [
      makeStroke(1, 0, 0), // first stroke has no cadence
      ...Array.from({ length: 20 }, (_, i) => makeStroke(i + 2, 24, 33)),
    ];
    const summary = summarizeSession(strokes, {
      distanceMeters: 500,
      speeds: [4.0, 4.2, 4.4, 4.1],
      rollSamples: [1, -1, 2, -2, 1.5, -1.5],
    });

    expect(summary.strokeCount).toBe(21);
    expect(summary.avgStrokeRate).toBeCloseTo(24, 1);
    expect(summary.strokeRateCv).toBeLessThan(1);
    expect(summary.avgDrivePercent).toBeCloseTo(33, 1);
    expect(summary.distancePerStroke).toBeCloseTo(500 / 21, 3);
    expect(summary.maxSpeed).toBe(4.4);
    expect(summary.bestSplitSeconds).toBeCloseTo(500 / 4.4, 1);
    expect(summary.rollRms).toBeGreaterThan(0);
  });

  it('handles an empty session without throwing', () => {
    const s = summarizeSession([]);
    expect(s.strokeCount).toBe(0);
    expect(s.avgStrokeRate).toBe(0);
    expect(s.bestSplitSeconds).toBe(0);
  });
});
