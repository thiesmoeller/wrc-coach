/**
 * Phone mounting calibration system
 * Compensates for phone orientation and position offsets
 */

export interface CalibrationData {
  // Mounting orientation offsets (degrees)
  pitchOffset: number;  // Tilt forward/backward from horizontal
  rollOffset: number;   // Tilt port/starboard from horizontal
  yawOffset: number;    // Rotation around vertical axis
  
  // Position offsets (meters)
  lateralOffset: number;  // Distance from boat centerline (+ = starboard)
  
  // Gravity reference
  gravityMagnitude: number;  // Measured gravity when at rest
  
  // Calibration quality metrics
  samples: number;
  variance: number;  // Sample variance (lower = more stable)
  timestamp: number;
}

export interface CalibrationSample {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

/**
 * Phone calibration manager
 */
export class PhoneCalibration {
  private calibrationData: CalibrationData | null = null;
  private calibrationSamples: CalibrationSample[] = [];
  private isCalibrating: boolean = false;
  
  /**
   * Start calibration - collect samples when boat is at rest or steady state
   */
  startCalibration(): void {
    this.calibrationSamples = [];
    this.isCalibrating = true;
    console.log('📍 Calibration started - keep boat steady...');
  }
  
  /**
   * Add a sample during calibration
   */
  addCalibrationSample(ax: number, ay: number, az: number, gx: number, gy: number, gz: number): void {
    if (!this.isCalibrating) return;
    
    this.calibrationSamples.push({ ax, ay, az, gx, gy, gz });
  }
  
  /**
   * Complete calibration and calculate offsets
   * @param minSamples Minimum samples required (default: 100)
   * @returns Calibration data or null if insufficient samples
   */
  completeCalibration(minSamples: number = 100): CalibrationData | null {
    this.isCalibrating = false;
    
    if (this.calibrationSamples.length < minSamples) {
      console.error(`Not enough calibration samples: ${this.calibrationSamples.length} < ${minSamples}`);
      return null;
    }
    
    // Calculate average accelerometer readings (should be gravity only when at rest)
    const avgAx = this.calibrationSamples.reduce((sum, s) => sum + s.ax, 0) / this.calibrationSamples.length;
    const avgAy = this.calibrationSamples.reduce((sum, s) => sum + s.ay, 0) / this.calibrationSamples.length;
    const avgAz = this.calibrationSamples.reduce((sum, s) => sum + s.az, 0) / this.calibrationSamples.length;
    
    // Calculate variance for quality metric
    const varianceAx = this.calibrationSamples.reduce((sum, s) => sum + Math.pow(s.ax - avgAx, 2), 0) / this.calibrationSamples.length;
    const varianceAy = this.calibrationSamples.reduce((sum, s) => sum + Math.pow(s.ay - avgAy, 2), 0) / this.calibrationSamples.length;
    const varianceAz = this.calibrationSamples.reduce((sum, s) => sum + Math.pow(s.az - avgAz, 2), 0) / this.calibrationSamples.length;
    const variance = Math.sqrt(varianceAx + varianceAy + varianceAz);
    
    // Calculate gravity magnitude
    const gravityMagnitude = Math.sqrt(avgAx * avgAx + avgAy * avgAy + avgAz * avgAz);
    
    // Validate gravity magnitude (should be close to 9.8 m/s²)
    if (Math.abs(gravityMagnitude - 9.8) > 2.0) {
      console.warn(`Unusual gravity magnitude: ${gravityMagnitude.toFixed(2)} m/s² (expected ~9.8)`);
    }
    
    // Calculate mounting orientation from gravity vector
    // The measured angle is OPPOSITE to the mounting rotation angle
    
    // Pitch offset: rotation around X-axis (boat sway axis)  
    // When phone is tilted forward (+pitch), gravity appears in +Y
    const pitchOffset = -Math.atan2(avgAy, Math.sqrt(avgAx * avgAx + avgAz * avgAz)) * 180 / Math.PI;
    
    // Roll offset: rotation around Y-axis (boat surge axis)
    // When phone is tilted to starboard (+roll), gravity appears in +X  
    const rollOffset = -Math.atan2(avgAx, Math.sqrt(avgAy * avgAy + avgAz * avgAz)) * 180 / Math.PI;
    
    // Yaw offset: cannot be determined from gravity alone
    // Would need magnetic compass or known heading
    const yawOffset = 0;
    
    // Lateral offset: cannot be determined from static calibration
    // Would need dynamic calibration (analyze roll during rowing)
    const lateralOffset = 0;
    
    this.calibrationData = {
      pitchOffset,
      rollOffset,
      yawOffset,
      lateralOffset,
      gravityMagnitude,
      samples: this.calibrationSamples.length,
      variance,
      timestamp: Date.now(),
    };
    
    console.log('✅ Calibration complete:');
    console.log(`   Pitch: ${pitchOffset.toFixed(1)}°, Roll: ${rollOffset.toFixed(1)}°`);
    console.log(`   Gravity: ${gravityMagnitude.toFixed(2)} m/s², Variance: ${variance.toFixed(3)}`);
    console.log(`   Samples: ${this.calibrationData.samples}, Quality: ${this.getQualityString()}`);
    
    return this.calibrationData;
  }
  
  /**
   * Cancel ongoing calibration
   */
  cancelCalibration(): void {
    this.isCalibrating = false;
    this.calibrationSamples = [];
  }
  
  /**
   * Apply calibration to raw sensor data
   */
  applyCalibration(ax: number, ay: number, az: number): { ax: number; ay: number; az: number } {
    if (!this.calibrationData) {
      return { ax, ay, az }; // No calibration, return raw
    }
    
    const { pitchOffset, rollOffset } = this.calibrationData;
    
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
   * Get calibration quality string
   */
  getQualityString(): string {
    if (!this.calibrationData) return 'Not calibrated';
    
    const variance = this.calibrationData.variance;
    if (variance < 0.05) return 'Excellent';
    if (variance < 0.1) return 'Good';
    if (variance < 0.2) return 'Fair';
    return 'Poor';
  }
  
  /**
   * Check if calibration is active
   */
  isCalibrationActive(): boolean {
    return this.isCalibrating;
  }
  
  /**
   * Get current sample count during calibration
   */
  getSampleCount(): number {
    return this.calibrationSamples.length;
  }
  
  /**
   * Check if calibrated
   */
  isCalibrated(): boolean {
    return this.calibrationData !== null;
  }
  
  /**
   * Get current calibration data
   */
  getCalibrationData(): CalibrationData | null {
    return this.calibrationData;
  }
  
  /**
   * Load calibration from stored data
   */
  loadCalibration(data: CalibrationData): void {
    this.calibrationData = data;
    console.log('📍 Loaded calibration:', new Date(data.timestamp).toLocaleString());
    console.log(`   Pitch: ${data.pitchOffset.toFixed(1)}°, Roll: ${data.rollOffset.toFixed(1)}°`);
  }
  
  /**
   * Clear calibration
   */
  clearCalibration(): void {
    this.calibrationData = null;
    console.log('🗑️ Calibration cleared');
  }
  
  /**
   * Export calibration data as JSON string
   */
  exportCalibration(): string | null {
    if (!this.calibrationData) return null;
    return JSON.stringify(this.calibrationData);
  }
  
  /**
   * Import calibration data from JSON string
   */
  importCalibration(json: string): boolean {
    try {
      const data = JSON.parse(json) as CalibrationData;
      
      // Validate required fields
      if (
        typeof data.pitchOffset !== 'number' ||
        typeof data.rollOffset !== 'number' ||
        typeof data.gravityMagnitude !== 'number'
      ) {
        console.error('Invalid calibration data format');
        return false;
      }
      
      this.loadCalibration(data);
      return true;
    } catch (error) {
      console.error('Failed to import calibration:', error);
      return false;
    }
  }
  
  /**
   * Get raw calibration samples for export/reprocessing
   */
  getCalibrationSamples(): CalibrationSample[] {
    return [...this.calibrationSamples];
  }
}

