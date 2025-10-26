import type { SessionData, AnalysisResults, CalibrationData } from '../types';
import { BandPassFilter } from '@wrc-coach/lib/filters/BandPassFilter';
import { StrokeDetector } from '@wrc-coach/lib/stroke-detection/StrokeDetector';
import { ComplementaryFilter } from '@wrc-coach/lib/filters/ComplementaryFilter';
import { transformToBoatFrame } from '@wrc-coach/lib/transforms/BoatTransform';

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
 * Apply calibration to raw sensor data
 */
function applyCalibration(
  ax: number, 
  ay: number, 
  az: number, 
  calibration: CalibrationData
): { ax: number; ay: number; az: number } {
  const { pitchOffset, rollOffset } = calibration;
  
  // Convert offsets to radians (negative to undo the rotation)
  const pitch = -pitchOffset * Math.PI / 180;
  const roll = -rollOffset * Math.PI / 180;
  
  // Apply inverse rotation to undo mounting offset
  // Undo pitch first (opposite order of application)
  let ax1 = ax;
  let ay1 = ay * Math.cos(pitch) + az * Math.sin(pitch);
  let az1 = -ay * Math.sin(pitch) + az * Math.cos(pitch);
  
  // Then undo roll
  const ax2 = ax1 * Math.cos(roll) - az1 * Math.sin(roll);
  const ay2 = ay1;
  const az2 = ax1 * Math.sin(roll) + az1 * Math.cos(roll);
  
  return { ax: ax2, ay: ay2, az: az2 };
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
    const { imuSamples, metadata, calibration } = data;
    
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

    // Extract time
    const t0 = imuSamples[0].t;
    const timeVector = imuSamples.map(s => (s.t - t0) / 1000); // Convert to seconds

    // Process IMU data with proper transformations
    const orientationFilter = new ComplementaryFilter();
    const surgeAccelerations: number[] = [];
    const rawSurgeAccelerations: number[] = [];
    
    // Debug: Sample middle of recording
    const debugIdx = Math.floor(imuSamples.length / 2);
    
    for (let i = 0; i < imuSamples.length; i++) {
      const sample = imuSamples[i];
      
      // Apply calibration if available
      const corrected = calibration 
        ? applyCalibration(sample.ax, sample.ay, sample.az, calibration)
        : { ax: sample.ax, ay: sample.ay, az: sample.az };
      
      // Calculate time delta
      const dt = i > 0 ? (sample.t - imuSamples[i - 1].t) / 1000 : 0.02;
      
      // Update orientation filter to estimate pitch/roll
      const orientation = orientationFilter.update(
        corrected.ax,
        corrected.ay,
        corrected.az,
        sample.gx,
        sample.gy,
        sample.gz,
        dt
      );
      
      // Transform to boat frame (removes gravity and maps to boat axes)
      const boatAccel = transformToBoatFrame(
        corrected.ax,
        corrected.ay,
        corrected.az,
        orientation,
        metadata.phoneOrientation
      );
      
      // Debug sample at middle of recording
      if (i === debugIdx) {
        console.log('Debug at t=' + ((sample.t - imuSamples[0].t) / 1000).toFixed(1) + 's:', {
          raw_ay: sample.ay.toFixed(3),
          calibrated_ay: corrected.ay.toFixed(3),
          orientation_pitch: orientation.pitch.toFixed(1) + '°',
          orientation_roll: orientation.roll.toFixed(1) + '°',
          surge: boatAccel.surge.toFixed(3),
        });
      }
      
      // Store surge (fore-aft) acceleration
      surgeAccelerations.push(boatAccel.surge);
      rawSurgeAccelerations.push(boatAccel.surge);
    }

    // Apply band-pass filter to surge acceleration
    const filter = new BandPassFilter(
      params.lowCutFreq,
      params.highCutFreq,
      params.sampleRate
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
      catchThreshold: params.catchThreshold,
      finishThreshold: params.finishThreshold,
      phoneOrientation: metadata.phoneOrientation,
      hasCalibration: !!calibration
    });

    // Detect strokes
    const detector = new StrokeDetector({ 
      catchThreshold: params.catchThreshold, 
      finishThreshold: params.finishThreshold 
    });
    const catches: number[] = [];
    const finishes: number[] = [];

    for (let i = 0; i < imuSamples.length; i++) {
      const stroke = detector.process(imuSamples[i].t, filteredAcceleration[i]);
      if (stroke) {
        catches.push((stroke.catchTime - t0) / 1000);
        finishes.push((stroke.finishTime - t0) / 1000);
      }
    }

    const rawStrokes = detector.getAllStrokes();
    
    // Ensure strokeRate and drivePercent are defined
    const strokes = rawStrokes.map(s => ({
      catchTime: s.catchTime,
      finishTime: s.finishTime,
      driveTime: s.driveTime,
      recoveryTime: s.recoveryTime,
      strokeRate: s.strokeRate ?? 0,
      drivePercent: s.drivePercent ?? 0,
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
      catches,
      finishes,
      strokes,
      avgStrokeRate,
      avgDrivePercent,
      totalStrokes: strokes.length,
    };
  }
}

