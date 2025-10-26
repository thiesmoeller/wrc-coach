/**
 * Adaptive Stroke Detector
 * Uses peak detection and automatic threshold adjustment
 * More robust than fixed thresholds
 */

export interface StrokeSegment {
  catchTime: number;
  catchIdx: number;
  finishTime: number;
  finishIdx: number;
  driveTime: number;
  recoveryTime: number;
  strokeRate: number;
  drivePercent: number;
  peakAcceleration: number;
  minAcceleration: number;
}

export class AdaptiveStrokeDetector {
  /**
   * Detect strokes using adaptive peak detection
   * 
   * @param timeVector - Time in seconds
   * @param filteredAcceleration - Filtered surge acceleration
   * @param timestamps - Original timestamps in ms
   * @returns Array of detected strokes
   */
  static detectStrokes(
    timeVector: number[],
    filteredAcceleration: number[],
    timestamps: number[]
  ): StrokeSegment[] {
    if (filteredAcceleration.length < 100) {
      return []; // Not enough data
    }

    // Calculate signal statistics for adaptive threshold
    // Only use POSITIVE values for statistics (catches, not finishes)
    const positiveValues = filteredAcceleration.filter(v => v > 0);
    const mean = filteredAcceleration.reduce((sum, v) => sum + v, 0) / filteredAcceleration.length;
    
    if (positiveValues.length < 10) {
      console.log('Not enough positive acceleration - no rowing detected');
      return [];
    }
    
    const positiveMean = positiveValues.reduce((sum, v) => sum + v, 0) / positiveValues.length;
    const variance = positiveValues.reduce((sum, v) => sum + Math.pow(v - positiveMean, 2), 0) / positiveValues.length;
    const std = Math.sqrt(variance);
    
    // Auto-detect catch threshold: Use 90th percentile of positive values
    // Only detect the strongest 10% of accelerations as potential catches
    const sortedPositive = [...positiveValues].sort((a, b) => a - b);
    const p50 = sortedPositive[Math.floor(sortedPositive.length * 0.50)];
    const p75 = sortedPositive[Math.floor(sortedPositive.length * 0.75)];
    const p90 = sortedPositive[Math.floor(sortedPositive.length * 0.90)];
    const p95 = sortedPositive[Math.floor(sortedPositive.length * 0.95)];
    const catchThreshold = p90; // Use 90th percentile - only top 10% accelerations
    
    // Expected stroke rate: 18-35 SPM = 1.7-3.3 seconds per stroke
    // Min distance between catches: 1.7 seconds at 50Hz = 85 samples
    const minPeakDistance = Math.floor(1.7 * 50); // 85 samples minimum
    
    console.log('Adaptive thresholds:', {
      mean: mean.toFixed(3),
      positiveMean: positiveMean.toFixed(3),
      std: std.toFixed(3),
      p50: p50.toFixed(3),
      p75: p75.toFixed(3),
      p90: p90.toFixed(3),
      p95: p95.toFixed(3),
      catchThreshold: catchThreshold.toFixed(3),
      minPeakDistance: `${minPeakDistance} samples (${(minPeakDistance / 50).toFixed(1)}s)`,
      signalRange: `${Math.min(...filteredAcceleration).toFixed(2)} to ${Math.max(...filteredAcceleration).toFixed(2)}`,
      positiveCount: positiveValues.length,
      expectedPeaks: `~${Math.floor(positiveValues.length * 0.10 / minPeakDistance)} (top 10% / min distance)`
    });

    // Find catch peaks (local maxima above threshold)
    const catches = this.findPeaks(filteredAcceleration, catchThreshold, minPeakDistance);
    
    if (catches.length < 2) {
      console.log('Too few catches detected:', catches.length);
      return [];
    }

    console.log(`Detected ${catches.length} catch peaks`);

    // For each catch-to-catch segment, find the finish (minimum acceleration)
    const strokes: StrokeSegment[] = [];
    const rejectionReasons: { [key: string]: number } = {};
    
    for (let i = 0; i < catches.length - 1; i++) {
      const catchIdx = catches[i];
      const nextCatchIdx = catches[i + 1];
      
      // Find finish as minimum acceleration in this segment
      let finishIdx = catchIdx;
      let minAccel = filteredAcceleration[catchIdx];
      
      for (let j = catchIdx; j < nextCatchIdx; j++) {
        if (filteredAcceleration[j] < minAccel) {
          minAccel = filteredAcceleration[j];
          finishIdx = j;
        }
      }
      
      // Use actual timestamps for accurate timing
      const driveTime = timestamps[finishIdx] - timestamps[catchIdx];
      const recoveryTime = timestamps[nextCatchIdx] - timestamps[finishIdx];
      const totalTime = driveTime + recoveryTime;
      
      // Relaxed sanity checks for varying speeds
      // Drive: 300-1200ms (was 200-1500ms)
      // Recovery: 500-3500ms (was 400-3000ms)
      // Total stroke: 1000-4500ms (15-60 SPM range)
      let rejected = false;
      if (driveTime < 300) {
        rejectionReasons['drive_too_short'] = (rejectionReasons['drive_too_short'] || 0) + 1;
        rejected = true;
      } else if (driveTime > 1200) {
        rejectionReasons['drive_too_long'] = (rejectionReasons['drive_too_long'] || 0) + 1;
        rejected = true;
      } else if (recoveryTime < 500) {
        rejectionReasons['recovery_too_short'] = (rejectionReasons['recovery_too_short'] || 0) + 1;
        rejected = true;
      } else if (recoveryTime > 3500) {
        rejectionReasons['recovery_too_long'] = (rejectionReasons['recovery_too_long'] || 0) + 1;
        rejected = true;
      } else if (totalTime < 1000 || totalTime > 4500) {
        rejectionReasons['total_time_invalid'] = (rejectionReasons['total_time_invalid'] || 0) + 1;
        rejected = true;
      }
      
      // Debug first few rejections
      if (rejected && Object.values(rejectionReasons).reduce((a, b) => a + b, 0) <= 3) {
        console.log(`Stroke ${i} rejected: drive=${driveTime.toFixed(0)}ms, recovery=${recoveryTime.toFixed(0)}ms, total=${totalTime.toFixed(0)}ms`);
      }
      
      if (rejected) continue;
      
      const strokeRate = Math.round(60000 / totalTime);
      const drivePercent = Math.round((driveTime / totalTime) * 100);
      
      strokes.push({
        catchTime: timestamps[catchIdx],
        catchIdx,
        finishTime: timestamps[finishIdx],
        finishIdx,
        driveTime,
        recoveryTime,
        strokeRate,
        drivePercent,
        peakAcceleration: filteredAcceleration[catchIdx],
        minAcceleration: filteredAcceleration[finishIdx],
      });
    }
    
    console.log(`Valid strokes after filtering: ${strokes.length}`);
    if (strokes.length === 0 && catches.length > 0) {
      console.log('Rejection reasons:', rejectionReasons);
    }
    
    return strokes;
  }

  /**
   * Find peaks (local maxima) in signal with prominence requirement
   * 
   * @param signal - Input signal
   * @param threshold - Minimum value to be considered a peak
   * @param minDistance - Minimum samples between peaks
   * @returns Indices of detected peaks
   */
  private static findPeaks(signal: number[], threshold: number, minDistance: number): number[] {
    const peaks: number[] = [];
    const prominenceWindow = 10; // Check 10 samples on each side
    
    for (let i = prominenceWindow; i < signal.length - prominenceWindow; i++) {
      // Check if this is above threshold
      if (signal[i] <= threshold) continue;
      
      // Check if this is a local maximum (at least 5 samples on each side)
      let isLocalMax = true;
      for (let j = Math.max(0, i - 5); j <= Math.min(signal.length - 1, i + 5); j++) {
        if (j !== i && signal[j] >= signal[i]) {
          isLocalMax = false;
          break;
        }
      }
      
      if (!isLocalMax) continue;
      
      // Check prominence: peak must be at least 0.3 m/s² above surrounding minimum
      let minLeft = signal[i];
      let minRight = signal[i];
      for (let j = Math.max(0, i - prominenceWindow); j < i; j++) {
        minLeft = Math.min(minLeft, signal[j]);
      }
      for (let j = i + 1; j <= Math.min(signal.length - 1, i + prominenceWindow); j++) {
        minRight = Math.min(minRight, signal[j]);
      }
      const prominence = signal[i] - Math.max(minLeft, minRight);
      
      if (prominence < 0.3) continue; // Require at least 0.3 m/s² prominence
      
      // Check minimum distance from last peak
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
        peaks.push(i);
      } else {
        // If too close, keep the higher peak
        const lastPeak = peaks[peaks.length - 1];
        if (signal[i] > signal[lastPeak]) {
          peaks[peaks.length - 1] = i;
        }
      }
    }
    
    return peaks;
  }
}

