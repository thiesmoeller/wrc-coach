/**
 * Orientation angles in degrees
 */
export interface Orientation {
  pitch: number; // Rotation around X axis (degrees)
  roll: number;  // Rotation around Y axis (degrees)
  yaw: number;   // Rotation around Z axis (degrees)
}

/**
 * Complementary Filter for orientation estimation (AHRS)
 * Fuses gyroscope and accelerometer data for accurate attitude tracking
 * 
 * The filter combines:
 * - Gyroscope: High frequency, accurate short-term (but drifts)
 * - Accelerometer: Low frequency, accurate long-term (but noisy)
 * 
 * Using a weighted average (complementary approach) gives us the best of both.
 */
export class ComplementaryFilter {
  private alpha: number;  // Trust gyro vs accel (0.98 = 98% gyro, 2% accel)
  private pitch: number;  // Pitch angle in radians
  private roll: number;   // Roll angle in radians
  private yaw: number;    // Yaw angle in radians

  constructor(alpha: number = 0.98) {
    this.alpha = alpha;
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
  }
  
  /**
   * Update orientation estimate with new sensor readings
   * 
   * @param ax - Accelerometer X (m/s²)
   * @param ay - Accelerometer Y (m/s²)
   * @param az - Accelerometer Z (m/s²)
   * @param gx - Gyroscope X (deg/s)
   * @param gy - Gyroscope Y (deg/s)
   * @param gz - Gyroscope Z (deg/s)
   * @param dt - Time step (seconds)
   * @returns Current orientation in degrees
   */
  update(
    ax: number,
    ay: number,
    az: number,
    gx: number,
    gy: number,
    gz: number,
    dt: number
  ): Orientation {
    // Convert gyro from deg/s to rad/s
    const gxRad = (gx * Math.PI) / 180;
    const gyRad = (gy * Math.PI) / 180;
    const gzRad = (gz * Math.PI) / 180;
    
    // Integrate gyroscope data (high frequency, accurate short-term)
    const gyroPitch = this.pitch + gyRad * dt;
    const gyroRoll = this.roll + gxRad * dt;
    const gyroYaw = this.yaw + gzRad * dt;
    
    // Calculate angles from accelerometer (low frequency, accurate long-term)
    const accelPitch = Math.atan2(ay, Math.sqrt(ax * ax + az * az));
    const accelRoll = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
    
    // Complementary filter: combine both sources
    this.pitch = this.alpha * gyroPitch + (1 - this.alpha) * accelPitch;
    this.roll = this.alpha * gyroRoll + (1 - this.alpha) * accelRoll;
    this.yaw = gyroYaw; // No magnetometer, so yaw drifts (OK for rowing)
    
    return {
      pitch: (this.pitch * 180) / Math.PI,
      roll: (this.roll * 180) / Math.PI,
      yaw: (this.yaw * 180) / Math.PI,
    };
  }
  
  /**
   * Reset filter to initial state
   */
  reset(): void {
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
  }
}

