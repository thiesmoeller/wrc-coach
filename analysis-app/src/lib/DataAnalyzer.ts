import type { SessionData, AnalysisResults } from '../types';
import { BandPassFilter } from '@wrc-coach/lib/filters/BandPassFilter';
import { AdaptiveStrokeDetector } from '@wrc-coach/lib/stroke-detection/AdaptiveStrokeDetector';
import { PCAAxisDetector } from './PCAAxisDetector';

/**
 * Parameters for analysis
 */
export interface AnalysisParams {
  lowCutFreq: number;
  highCutFreq: number;
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
        boatAccelerations: {
          surge: [],
          sway: [],
          heave: [],
        },
        catches: [],
        finishes: [],
        strokes: [],
        avgStrokeRate: 0,
        avgDrivePercent: 0,
        totalStrokes: 0,
      };
    }

    console.log('=== PCA-Based Axis Detection ===');
    
    // Step 1: Detect boat axes using PCA
    const axes = PCAAxisDetector.detectAxes(imuSamples, 1.0);
    
    if (!axes) {
      console.error('Failed to detect boat axes - not enough motion in data');
      return {
        timeVector: [],
        rawAcceleration: [],
        filteredAcceleration: [],
        boatAccelerations: {
          surge: [],
          sway: [],
          heave: [],
        },
        catches: [],
        finishes: [],
        strokes: [],
        avgStrokeRate: 0,
        avgDrivePercent: 0,
        totalStrokes: 0,
      };
    }
    
    console.log('✅ Boat axes detected:');
    console.log('  Bow-stern:', axes.bowSternAxis.map(v => v.toFixed(3)));
    console.log('  Port-starboard:', axes.portStarboardAxis.map(v => v.toFixed(3)));
    console.log('  Vertical:', axes.verticalAxis.map(v => v.toFixed(3)));
    console.log('  Confidence:', (axes.confidence * 100).toFixed(1) + '%');
    console.log('  Explained variance:', axes.explainedVariance.map(v => (v * 100).toFixed(1) + '%').join(', '));
    
    if (axes.confidence < 0.6) {
      console.warn('⚠️  Low confidence in axis detection - rowing motion may not be dominant');
    }
    
    // Step 2: Estimate gravity for transformation
    const gravity = this.estimateGravity(imuSamples);
    console.log('Estimated gravity:', gravity.map(v => v.toFixed(3)));

    // Extract time
    const t0 = imuSamples[0].t;
    const timeVector = imuSamples.map(s => (s.t - t0) / 1000); // Convert to seconds

    // Calculate actual sample rate from timestamps
    const sampleIntervals: number[] = [];
    for (let i = 1; i < imuSamples.length; i++) {
      sampleIntervals.push(imuSamples[i].t - imuSamples[i-1].t);
    }
    const avgInterval = sampleIntervals.reduce((a, b) => a + b, 0) / sampleIntervals.length;
    const sampleRate = 1000 / avgInterval; // Convert ms to Hz
    console.log(`Calculated sample rate: ${sampleRate.toFixed(1)} Hz (avg interval: ${avgInterval.toFixed(1)} ms)`);

    // Step 3: Transform all samples to boat frame using detected axes
    const surgeAccelerations: number[] = [];
    const swayAccelerations: number[] = [];
    const heaveAccelerations: number[] = [];
    const rawSurgeAccelerations: number[] = [];
    
    // Debug: Sample middle of recording
    const debugIdx = Math.floor(imuSamples.length / 2);
    
    for (let i = 0; i < imuSamples.length; i++) {
      const sample = imuSamples[i];
      
      // Transform to boat frame using PCA-detected axes
      const boatAccel = PCAAxisDetector.transformToBoatFrame(sample, axes, gravity);
      
      // Debug sample at middle of recording
      if (i === debugIdx) {
        console.log('Debug at t=' + ((sample.t - imuSamples[0].t) / 1000).toFixed(1) + 's:', {
          raw_ax: sample.ax.toFixed(3),
          raw_ay: sample.ay.toFixed(3),
          raw_az: sample.az.toFixed(3),
          surge: boatAccel.surge.toFixed(3),
          sway: boatAccel.sway.toFixed(3),
          heave: boatAccel.heave.toFixed(3),
        });
      }
      
      // Store all boat coordinate accelerations
      surgeAccelerations.push(boatAccel.surge);
      swayAccelerations.push(boatAccel.sway);
      heaveAccelerations.push(boatAccel.heave);
      rawSurgeAccelerations.push(boatAccel.surge);
    }

    // Apply band-pass filter to surge acceleration
    const filter = new BandPassFilter(
      params.lowCutFreq,
      params.highCutFreq,
      sampleRate
    );
    const filteredAcceleration = surgeAccelerations.map(a => filter.process(a));

    // Debug: Log signal statistics
    const maxFiltered = Math.max(...filteredAcceleration);
    const minFiltered = Math.min(...filteredAcceleration);
    const avgSurge = surgeAccelerations.reduce((a, b) => a + b, 0) / surgeAccelerations.length;
    console.log('Signal Analysis:', {
      surgeMin: Math.min(...surgeAccelerations).toFixed(3),
      surgeMax: Math.max(...surgeAccelerations).toFixed(3),
      surgeAvg: avgSurge.toFixed(3),
      filteredMin: minFiltered.toFixed(3),
      filteredMax: maxFiltered.toFixed(3),
      axisConfidence: (axes.confidence * 100).toFixed(1) + '%'
    });

    // Detect strokes using adaptive peak-based detector
    const detectedStrokes = AdaptiveStrokeDetector.detectStrokes(
      timeVector,
      filteredAcceleration,
      imuSamples.map(s => s.t)
    );

    // Extract catch and finish times for plotting
    const catches = detectedStrokes.map(s => (s.catchTime - t0) / 1000);
    const finishes = detectedStrokes.map(s => (s.finishTime - t0) / 1000);

    // Convert to analysis format
    const strokes = detectedStrokes.map(s => ({
      catchTime: s.catchTime,
      finishTime: s.finishTime,
      driveTime: s.driveTime,
      recoveryTime: s.recoveryTime,
      strokeRate: s.strokeRate,
      drivePercent: s.drivePercent,
    }));
    
    // Calculate averages
    const avgStrokeRate = strokes.length > 0
      ? strokes.reduce((sum, s) => sum + s.strokeRate, 0) / strokes.length
      : 0;
    
    const avgDrivePercent = strokes.length > 0
      ? strokes.reduce((sum, s) => sum + s.drivePercent, 0) / strokes.length
      : 0;

    return {
      timeVector,
      rawAcceleration: rawSurgeAccelerations,
      filteredAcceleration,
      boatAccelerations: {
        surge: surgeAccelerations,
        sway: swayAccelerations,
        heave: heaveAccelerations,
      },
      catches,
      finishes,
      strokes,
      avgStrokeRate,
      avgDrivePercent,
      totalStrokes: strokes.length,
    };
  }

  /**
   * Estimate gravity vector from IMU samples
   * Uses median to be robust to motion outliers
   */
  private static estimateGravity(samples: { ax: number; ay: number; az: number }[]): [number, number, number] {
    const ax = samples.map(s => s.ax).sort((a, b) => a - b);
    const ay = samples.map(s => s.ay).sort((a, b) => a - b);
    const az = samples.map(s => s.az).sort((a, b) => a - b);
    
    const mid = Math.floor(samples.length / 2);
    return [ax[mid], ay[mid], az[mid]];
  }
}

