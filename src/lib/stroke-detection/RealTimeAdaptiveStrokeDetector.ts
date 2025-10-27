/**
 * Real-time Adaptive Stroke Detector
 * 
 * Wraps the batch AdaptiveStrokeDetector to work with streaming data.
 * Maintains a rolling buffer and periodically runs batch detection.
 */

import { AdaptiveStrokeDetector } from './AdaptiveStrokeDetector';

export interface RealTimeStrokeInfo {
  catchTime: number;
  finishTime: number;
  driveTime: number;
  recoveryTime: number;
  strokeRate: number;
  drivePercent: number;
}

export class RealTimeAdaptiveStrokeDetector {
  private buffer: Array<{ t: number; acceleration: number }> = [];
  private bufferSize = 2000; // Keep 40 seconds at 50Hz
  private lastDetectionTime = 0;
  private detectionInterval = 2000; // Run detection every 2 seconds
  private lastStrokeInfo: RealTimeStrokeInfo | null = null;
  private strokeCount = 0;
  private inDrive = false;
  private catchTime: number | null = null;

  constructor() {
    // Initialize with empty state
  }

  /**
   * Process a single sample for real-time stroke detection
   * @param t - Timestamp (ms)
   * @param acceleration - Filtered acceleration (m/s²)
   * @returns Stroke info if a stroke was just completed, null otherwise
   */
  process(t: number, acceleration: number): RealTimeStrokeInfo | null {
    // Add sample to buffer
    this.buffer.push({ t, acceleration });
    
    // Keep buffer size manageable
    if (this.buffer.length > this.bufferSize) {
      this.buffer = this.buffer.slice(-this.bufferSize);
    }

    // Simple real-time catch detection for immediate feedback
    const completedStroke = this.detectRealTimeStroke(t, acceleration);
    
    // Run batch detection periodically for more accurate results
    if (t - this.lastDetectionTime > this.detectionInterval) {
      this.runBatchDetection();
      this.lastDetectionTime = t;
    }

    return completedStroke;
  }

  /**
   * Simple real-time stroke detection using thresholds
   * Provides immediate feedback while batch detection runs in background
   */
  private detectRealTimeStroke(t: number, acceleration: number): RealTimeStrokeInfo | null {
    // Use recent slope and zero-crossing for robust real-time detection
    const len = this.buffer.length;
    const prev = len >= 2 ? this.buffer[len - 2] : null;

    // Detect catch (start of drive)
    if (!this.inDrive) {
      const posThreshold = 0.05; // m/s², tuned for filtered signal
      let crossedUp = false;
      let refinedCatchTime = t;
      if (prev) {
        crossedUp = prev.acceleration <= 0 && acceleration > 0;
        if (crossedUp) {
          // Refine to zero-crossing by linear interpolation
          const dv = acceleration - prev.acceleration;
          const dt = t - prev.t;
          if (dv !== 0 && dt !== 0) {
            const alpha = -prev.acceleration / dv;
            refinedCatchTime = prev.t + alpha * dt;
          }
        }
      }
      const rising = prev ? (acceleration - prev.acceleration) > 0 : true;
      const above = acceleration > posThreshold;
      const minIntervalOk = this.catchTime === null || (t - this.catchTime) > 300; // debounce

      if (minIntervalOk && (crossedUp || (above && rising))) {
        this.inDrive = true;
        this.catchTime = refinedCatchTime;
        this.strokeCount++;
        return null;
      }
    }

    // Detect finish (end of drive)
    if (this.inDrive) {
      const negThreshold = -0.03; // m/s²
      const falling = prev ? (acceleration - prev.acceleration) < 0 : false;
      const crossedDown = prev ? (prev.acceleration >= 0 && acceleration < 0) : false;
      const below = acceleration < negThreshold;

      if (crossedDown || (below && falling)) {
        this.inDrive = false;
        
        if (this.catchTime !== null) {
          const driveTime = t - this.catchTime;
          const recoveryTime = this.lastStrokeInfo ? (this.catchTime - this.lastStrokeInfo.finishTime) : 0;
          const totalTime = driveTime + recoveryTime;
          
          let strokeRate = 0;
          let drivePercent = 0;
          
          if (totalTime > 0) {
            strokeRate = Math.round(60000 / totalTime);
            drivePercent = Math.round((driveTime / totalTime) * 100);
          }
          
          const strokeInfo: RealTimeStrokeInfo = {
            catchTime: this.catchTime,
            finishTime: t,
            driveTime,
            recoveryTime,
            strokeRate,
            drivePercent,
          };
          
          this.lastStrokeInfo = strokeInfo;
          return strokeInfo;
        }
      }
    }
    
    return null;
  }

  /**
   * Run batch detection on the current buffer
   * Updates stroke metrics with more accurate results
   */
  private runBatchDetection(): void {
    if (this.buffer.length < 100) return;

    try {
      // Extract data for batch processing
      const timestamps = this.buffer.map(s => s.t);
      const accelerations = this.buffer.map(s => s.acceleration);
      const timeVector = timestamps.map(t => (t - timestamps[0]) / 1000);

      // Run adaptive detection
      const strokes = AdaptiveStrokeDetector.detectStrokes(
        timeVector,
        accelerations,
        timestamps
      );

      // Update metrics with most recent stroke
      if (strokes.length > 0) {
        const latestStroke = strokes[strokes.length - 1];
        this.lastStrokeInfo = {
          catchTime: latestStroke.catchTime,
          finishTime: latestStroke.finishTime,
          driveTime: latestStroke.driveTime,
          recoveryTime: latestStroke.recoveryTime,
          strokeRate: latestStroke.strokeRate,
          drivePercent: latestStroke.drivePercent,
        };
      }
    } catch (error) {
      console.warn('Batch stroke detection failed:', error);
    }
  }

  /**
   * Get current stroke phase
   */
  isInDrive(): boolean {
    return this.inDrive;
  }

  /**
   * Get stroke angle for visualization
   * Simplified version - returns angle based on time since catch
   */
  getStrokeAngle(t: number): number {
    if (!this.catchTime) return 0;
    
    const timeSinceCatch = t - this.catchTime;
    const strokeDuration = this.lastStrokeInfo ? 
      (this.lastStrokeInfo.driveTime + this.lastStrokeInfo.recoveryTime) : 3000;
    
    // Convert time to angle (0-360 degrees)
    const angle = (timeSinceCatch / strokeDuration) * 360;
    return angle % 360;
  }

  /**
   * Get current stroke metrics
   */
  getCurrentMetrics(): RealTimeStrokeInfo | null {
    return this.lastStrokeInfo;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.buffer = [];
    this.lastDetectionTime = 0;
    this.lastStrokeInfo = null;
    this.strokeCount = 0;
    this.inDrive = false;
    this.catchTime = null;
  }
}
