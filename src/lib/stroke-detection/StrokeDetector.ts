/**
 * Stroke detection thresholds
 */
export interface StrokeThresholds {
  catchThreshold: number;   // Acceleration threshold for catch (m/s²)
  finishThreshold: number;  // Acceleration threshold for finish (m/s²)
}

/**
 * Stroke information
 */
export interface StrokeInfo {
  catchTime: number;
  finishTime: number;
  driveTime: number;
  recoveryTime: number;
  strokeRate?: number;
  drivePercent?: number;
}

/**
 * Stroke sample with metadata
 */
export interface StrokeSample {
  t: number;
  surgeHP: number;
  inDrive: boolean;
  angle: number;
}

/**
 * Stroke Detector
 * 
 * Detects catch and finish points in rowing strokes based on
 * acceleration thresholds.
 */
export class StrokeDetector {
  private thresholds: StrokeThresholds;
  private inDrive: boolean;
  private catchTime: number | null;
  private finishTime: number | null;
  private strokeCount: number;
  private lastStrokeRate: number;
  private lastDrivePercent: number;
  private strokeData: StrokeInfo[];

  constructor(thresholds: StrokeThresholds = { catchThreshold: 0.6, finishThreshold: -0.3 }) {
    this.thresholds = thresholds;
    this.inDrive = false;
    this.catchTime = null;
    this.finishTime = null;
    this.strokeCount = 0;
    this.lastStrokeRate = 0;
    this.lastDrivePercent = 0;
    this.strokeData = [];
  }

  /**
   * Update detection thresholds
   */
  setThresholds(thresholds: Partial<StrokeThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Process a sample for stroke detection
   * @param t - Timestamp (ms)
   * @param acceleration - Filtered acceleration (m/s²)
   * @returns Stroke info if a stroke was just completed, null otherwise
   */
  process(t: number, acceleration: number): StrokeInfo | null {
    let completedStroke: StrokeInfo | null = null;

    // Detect catch (start of drive)
    if (!this.inDrive && acceleration > this.thresholds.catchThreshold) {
      this.inDrive = true;
      this.catchTime = t;
      this.strokeCount++;
    }
    // Detect finish (end of drive)
    else if (this.inDrive && acceleration < this.thresholds.finishThreshold) {
      this.inDrive = false;
      this.finishTime = t;
      
      // Calculate stroke metrics
      if (this.catchTime !== null) {
        const driveTime = this.finishTime - this.catchTime;
        const lastStrokeData = this.strokeData[this.strokeData.length - 1];
        const recoveryTime = lastStrokeData ? (this.catchTime - lastStrokeData.finishTime) : 0;
        const totalTime = driveTime + recoveryTime;
        
        let strokeRate = 0;
        let drivePercent = 0;
        
        if (totalTime > 0) {
          strokeRate = Math.round(60000 / totalTime);
          drivePercent = Math.round((driveTime / totalTime) * 100);
          this.lastStrokeRate = strokeRate;
          this.lastDrivePercent = drivePercent;
        }
        
        const strokeInfo: StrokeInfo = {
          catchTime: this.catchTime,
          finishTime: this.finishTime,
          driveTime,
          recoveryTime,
          strokeRate,
          drivePercent,
        };
        
        this.strokeData.push(strokeInfo);
        completedStroke = strokeInfo;
      }
    }

    return completedStroke;
  }

  /**
   * Get current stroke phase
   */
  isInDrive(): boolean {
    return this.inDrive;
  }

  /**
   * Get stroke count
   */
  getStrokeCount(): number {
    return this.strokeCount;
  }

  /**
   * Get last stroke rate (SPM)
   */
  getLastStrokeRate(): number {
    return this.lastStrokeRate;
  }

  /**
   * Get last drive percentage
   */
  getLastDrivePercent(): number {
    return this.lastDrivePercent;
  }

  /**
   * Get all completed strokes
   */
  getAllStrokes(): StrokeInfo[] {
    return [...this.strokeData];
  }

  /**
   * Reset detector to initial state
   */
  reset(): void {
    this.inDrive = false;
    this.catchTime = null;
    this.finishTime = null;
    this.strokeCount = 0;
    this.lastStrokeRate = 0;
    this.lastDrivePercent = 0;
    this.strokeData = [];
  }

  /**
   * Calculate stroke angle (0-360°) based on drive ratio
   * @param t - Current timestamp
   * @returns Angle in degrees (0-360)
   */
  getStrokeAngle(t: number): number {
    if (this.catchTime === null) return 0;
    
    // Use measured drive% or default to 35% (1:1.86 ratio - good technique)
    const drivePercent = this.lastDrivePercent > 0 ? this.lastDrivePercent / 100 : 0.35;
    const driveAngle = 360 * drivePercent;
    const recoveryAngle = 360 * (1 - drivePercent);
    
    if (this.inDrive) {
      // Drive phase: 0° to driveAngle (e.g., 126° for 35%)
      const driveTime = t - this.catchTime;
      const estimatedDriveTime = 700; // ms, adjust based on stroke rate
      const phase = Math.min(driveTime / estimatedDriveTime, 1);
      return phase * driveAngle;
    } else {
      // Recovery phase: driveAngle to 360°
      if (this.finishTime === null) return driveAngle;
      const recoveryTime = t - this.finishTime;
      const estimatedRecoveryTime = 1400; // ms
      const phase = Math.min(recoveryTime / estimatedRecoveryTime, 1);
      return driveAngle + phase * recoveryAngle;
    }
  }
}

