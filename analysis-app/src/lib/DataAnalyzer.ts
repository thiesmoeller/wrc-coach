import type { SessionData, AnalysisResults } from '../types';
import { RowingPipeline } from '@wrc-coach/lib/analysis/RowingPipeline';

/**
 * Offline analysis of a recorded session.
 *
 * Uses the same RowingPipeline as the live PWA: Madgwick AHRS gravity removal,
 * PCA-derived boat frame (no phone-orientation setting), adaptive zero-crossing
 * stroke detection (no catch/finish thresholds), and INS/GPS speed fusion.
 */
export class DataAnalyzer {
  static analyze(data: SessionData): AnalysisResults {
    const imuSamples = data.imuSamples.filter(
      (s) =>
        Number.isFinite(s.ax) &&
        Number.isFinite(s.ay) &&
        Number.isFinite(s.az) &&
        Number.isFinite(s.gx) &&
        Number.isFinite(s.gy) &&
        Number.isFinite(s.gz),
    );

    if (imuSamples.length === 0) {
      return {
        timeVector: [],
        rawAcceleration: [],
        filteredAcceleration: [],
        catches: [],
        finishes: [],
        strokes: [],
        avgStrokeRate: 0,
        avgDrivePercent: 0,
        totalStrokes: 0,
      };
    }

    const t0 = imuSamples[0].t;
    const pipe = new RowingPipeline();
    const timeVector: number[] = [];
    const rawAcceleration: number[] = [];
    const filteredAcceleration: number[] = [];

    let gpsIdx = 0;
    const gps = data.gpsSamples;

    for (const s of imuSamples) {
      while (gpsIdx < gps.length && gps[gpsIdx].t <= s.t) {
        const g = gps[gpsIdx];
        if (Number.isFinite(g.speed)) {
          pipe.processGPS(g.speed, g.accuracy ?? 5);
        }
        gpsIdx++;
      }

      const out = pipe.processIMU(s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz);
      timeVector.push((s.t - t0) / 1000);
      rawAcceleration.push(out.surgeLinear);
      filteredAcceleration.push(out.surge);
    }

    const strokes = pipe.getStrokes();
    const catches = strokes.map((st) => (st.catchTime - t0) / 1000);
    const finishes = strokes.map((st) => (st.finishTime - t0) / 1000);

    const rated = strokes.filter((st) => st.strokeRate > 0);
    const avgStrokeRate =
      rated.length > 0
        ? rated.reduce((sum, st) => sum + st.strokeRate, 0) / rated.length
        : 0;
    const avgDrivePercent =
      rated.length > 0
        ? rated.reduce((sum, st) => sum + st.drivePercent, 0) / rated.length
        : 0;

    return {
      timeVector,
      rawAcceleration,
      filteredAcceleration,
      catches,
      finishes,
      strokes: strokes.map((st) => ({
        catchTime: st.catchTime,
        finishTime: st.finishTime,
        driveTime: st.driveTime,
        recoveryTime: st.recoveryTime,
        strokeRate: st.strokeRate,
        drivePercent: st.drivePercent,
      })),
      avgStrokeRate,
      avgDrivePercent,
      totalStrokes: strokes.length,
    };
  }
}
