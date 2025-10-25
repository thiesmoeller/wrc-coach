import type { SessionData, AnalysisResults } from '../types';
import { BandPassFilter } from '@wrc-coach/lib/filters/BandPassFilter';
import { StrokeDetector } from '@wrc-coach/lib/stroke-detection/StrokeDetector';

/**
 * Parameters for analysis
 */
export interface AnalysisParams {
  lowCutFreq: number;
  highCutFreq: number;
  sampleRate: number;
  catchThreshold: number;
  finishThreshold: number;
}

/**
 * Data Analyzer
 * Processes session data and applies filters and stroke detection
 */
export class DataAnalyzer {
  /**
   * Analyze session data with given parameters
   */
  static analyze(data: SessionData, params: AnalysisParams): AnalysisResults {
    const { imuSamples } = data;
    
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

    // Extract time and acceleration
    const t0 = imuSamples[0].t;
    const timeVector = imuSamples.map(s => (s.t - t0) / 1000); // Convert to seconds
    const rawAcceleration = imuSamples.map(s => s.ay);

    // Apply band-pass filter
    const filter = new BandPassFilter(
      params.lowCutFreq,
      params.highCutFreq,
      params.sampleRate
    );
    const filteredAcceleration = rawAcceleration.map(a => filter.process(a));

    // Detect strokes
    const detector = new StrokeDetector(params.catchThreshold, params.finishThreshold);
    const catches: number[] = [];
    const finishes: number[] = [];

    for (let i = 0; i < imuSamples.length; i++) {
      const stroke = detector.process(imuSamples[i].t, filteredAcceleration[i]);
      if (stroke) {
        catches.push((stroke.catchTime - t0) / 1000);
        finishes.push((stroke.finishTime - t0) / 1000);
      }
    }

    const strokes = detector.getAllStrokes();
    
    // Calculate averages
    const avgStrokeRate = strokes.length > 0
      ? strokes.reduce((sum, s) => sum + s.strokeRate, 0) / strokes.length
      : 0;
    
    const avgDrivePercent = strokes.length > 0
      ? strokes.reduce((sum, s) => sum + s.drivePercent, 0) / strokes.length
      : 0;

    return {
      timeVector,
      rawAcceleration,
      filteredAcceleration,
      catches,
      finishes,
      strokes,
      avgStrokeRate,
      avgDrivePercent,
      totalStrokes: strokes.length,
    };
  }
}

