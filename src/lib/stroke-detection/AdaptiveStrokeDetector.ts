/**
 * Adaptive Stroke Detector
 * 
 * Simplified approach focusing on catch detection and stroke cycle timing:
 * 1. Find positive peaks in acceleration (drive phase peaks)
 * 2. Find zero crossings before peaks (catch points)
 * 3. Define stroke cycles from catch to catch
 * 
 * Finish detection is deferred to a later stage to avoid issues with
 * external negative accelerations (water resistance, wind, etc.)
 */

export interface StrokeSegment {
  catchTime: number;
  catchIdx: number;
  finishTime: number; // Placeholder until finish detection is implemented
  finishIdx: number; // Placeholder until finish detection is implemented
  driveTime: number; // Estimated until finish detection is implemented
  recoveryTime: number; // Estimated until finish detection is implemented
  strokeRate: number;
  drivePercent: number; // Estimated until finish detection is implemented
  peakAcceleration: number;
  minAcceleration: number; // Placeholder until finish detection is implemented
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
    _timeVector: number[],
    filteredAcceleration: number[],
    timestamps: number[]
  ): StrokeSegment[] {
    if (filteredAcceleration.length < 100) {
      return []; // Not enough data
    }

    // Calculate signal statistics for adaptive threshold
    // Only use POSITIVE values for statistics (drive accelerations)
    const positiveValues = filteredAcceleration.filter(v => v > 0);
    const mean = filteredAcceleration.reduce((sum, v) => sum + v, 0) / filteredAcceleration.length;
    
    if (positiveValues.length < 10) {
      console.log('Not enough positive acceleration - no rowing detected');
      return [];
    }
    
    const positiveMean = positiveValues.reduce((sum, v) => sum + v, 0) / positiveValues.length;
    const variance = positiveValues.reduce((sum, v) => sum + Math.pow(v - positiveMean, 2), 0) / positiveValues.length;
    const std = Math.sqrt(variance);
    
    // Auto-detect peak threshold: Use 75th percentile of positive values
    // Detect the strongest 25% of accelerations as potential drive peaks
    const sortedPositive = [...positiveValues].sort((a, b) => a - b);
    const p50 = sortedPositive[Math.floor(sortedPositive.length * 0.50)];
    const p75 = sortedPositive[Math.floor(sortedPositive.length * 0.75)];
    const p90 = sortedPositive[Math.floor(sortedPositive.length * 0.90)];
    const p95 = sortedPositive[Math.floor(sortedPositive.length * 0.95)];
    const peakThreshold = p75; // Use 75th percentile - top 25% accelerations
    
    // Expected stroke rate: 18-35 SPM = 1.7-3.3 seconds per stroke
    // Min distance between peaks: 1.7 seconds at 50Hz = 85 samples
    const sampleRate = 50; // Assuming 50 Hz
    const minPeakDistance = Math.floor(1.7 * sampleRate); // 85 samples minimum
    
    console.log('Adaptive thresholds:', {
      mean: mean.toFixed(3),
      positiveMean: positiveMean.toFixed(3),
      std: std.toFixed(3),
      p50: p50.toFixed(3),
      p75: p75.toFixed(3),
      p90: p90.toFixed(3),
      p95: p95.toFixed(3),
      peakThreshold: peakThreshold.toFixed(3),
      minPeakDistance: `${minPeakDistance} samples (${(minPeakDistance / sampleRate).toFixed(1)}s)`,
      signalRange: `${Math.min(...filteredAcceleration).toFixed(2)} to ${Math.max(...filteredAcceleration).toFixed(2)}`,
      positiveCount: positiveValues.length,
      expectedPeaks: `~${Math.floor(positiveValues.length * 0.25 / minPeakDistance)} (top 25% / min distance)`
    });

    // Step 1: Find positive peaks in acceleration (peak drive acceleration)
    const peaks = this.findPeaks(filteredAcceleration, peakThreshold, minPeakDistance);
    
    if (peaks.length < 2) {
      console.log('Too few peaks detected:', peaks.length);
      return [];
    }

    console.log(`Detected ${peaks.length} acceleration peaks`);

    // Step 2: For each peak, go backwards to find the zero crossing (catch)
    const catches: number[] = [];
    const maxLookback = Math.floor(0.6 * sampleRate); // Look back max 600ms
    
    for (const peakIdx of peaks) {
      // Find the zero crossing before the peak
      let catchIdx = peakIdx;
      
      // Go backwards from peak until we find where acceleration crosses zero
      for (let i = peakIdx - 1; i >= Math.max(0, peakIdx - maxLookback); i--) {
        if (filteredAcceleration[i] <= 0 && filteredAcceleration[i + 1] > 0) {
          // Found zero crossing from negative to positive
          catchIdx = i + 1; // Use the first positive sample
          break;
        }
      }
      
      // Avoid duplicate catches
      if (catches.length === 0 || catchIdx - catches[catches.length - 1] >= minPeakDistance / 2) {
        catches.push(catchIdx);
      }
    }
    
    console.log(`Found ${catches.length} catch points from ${peaks.length} peaks`);

    // Build strokes from catch-to-catch pairs (simplified approach)
    // Focus on stroke cycle timing, defer finish detection to later stage
    const strokes: StrokeSegment[] = [];
    const rejectionReasons: { [key: string]: number } = {};
    
    for (let i = 0; i < catches.length - 1; i++) {
      const catchIdx = catches[i];
      const nextCatchIdx = catches[i + 1];
      const peakIdx = peaks[i];
      
      // Calculate stroke cycle timing (catch to catch)
      const strokeCycleTime = timestamps[nextCatchIdx] - timestamps[catchIdx];
      
      // Basic sanity checks for stroke cycle timing
      // Typical stroke rates: 15-40 SPM = 1500-4000ms per stroke
      let rejected = false;
      if (strokeCycleTime < 1500) {
        rejectionReasons['cycle_too_short'] = (rejectionReasons['cycle_too_short'] || 0) + 1;
        rejected = true;
      } else if (strokeCycleTime > 4000) {
        rejectionReasons['cycle_too_long'] = (rejectionReasons['cycle_too_long'] || 0) + 1;
        rejected = true;
      }
      
      // Debug first few rejections
      if (rejected && Object.values(rejectionReasons).reduce((a, b) => a + b, 0) <= 3) {
        console.log(`Stroke ${i} rejected: cycle=${strokeCycleTime.toFixed(0)}ms`);
      }
      
      if (rejected) continue;
      
      const strokeRate = Math.round(60000 / strokeCycleTime);
      
      // For now, use placeholder values for drive/recovery timing
      // These will be calculated properly in a later stage
      const estimatedDriveTime = strokeCycleTime * 0.3; // Assume 30% drive
      const estimatedRecoveryTime = strokeCycleTime * 0.7; // Assume 70% recovery
      
      strokes.push({
        catchTime: timestamps[catchIdx],
        catchIdx,
        finishTime: timestamps[nextCatchIdx], // Placeholder: next catch
        finishIdx: nextCatchIdx, // Placeholder: next catch
        driveTime: estimatedDriveTime,
        recoveryTime: estimatedRecoveryTime,
        strokeRate,
        drivePercent: 30, // Placeholder
        peakAcceleration: filteredAcceleration[peakIdx],
        minAcceleration: 0, // Placeholder - will be calculated later
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
      
      // Check prominence: peak must be at least 0.2 m/s² above surrounding minimum
      // Reduced from 0.3 to be more sensitive
      let minLeft = signal[i];
      let minRight = signal[i];
      for (let j = Math.max(0, i - prominenceWindow); j < i; j++) {
        minLeft = Math.min(minLeft, signal[j]);
      }
      for (let j = i + 1; j <= Math.min(signal.length - 1, i + prominenceWindow); j++) {
        minRight = Math.min(minRight, signal[j]);
      }
      const prominence = signal[i] - Math.max(minLeft, minRight);
      
      if (prominence < 0.2) continue; // Require at least 0.2 m/s² prominence
      
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
