/**
 * Kalman Filter for GPS/IMU sensor fusion
 * Provides optimal velocity and position estimates
 * 
 * This filter combines GPS velocity measurements with IMU acceleration
 * to produce a more accurate and stable velocity estimate.
 */
export class KalmanFilterGPS {
  private x: number;  // velocity estimate (m/s)
  private P: number;  // estimation error covariance
  
  private readonly Q: number;      // Process noise
  private readonly R_gps: number;  // GPS measurement noise
  private readonly R_imu: number;  // IMU measurement noise

  constructor() {
    // State: [velocity]
    this.x = 0; // velocity estimate (m/s)
    this.P = 1; // estimation error covariance
    
    // Process noise (how much we trust the model)
    this.Q = 0.01; // Small: rowing velocity changes smoothly
    
    // Measurement noise (how much we trust sensors)
    this.R_gps = 0.5; // GPS noise
    this.R_imu = 0.1; // IMU noise (after integration)
  }
  
  /**
   * Predict next state based on acceleration
   * @param acceleration - Acceleration in m/s²
   * @param dt - Time step in seconds
   */
  predict(acceleration: number, dt: number): void {
    // Predict next state: v(t+1) = v(t) + a*dt
    this.x = this.x + acceleration * dt;
    this.P = this.P + this.Q;
  }
  
  /**
   * Update estimate with GPS velocity measurement
   * @param gpsVelocity - GPS-measured velocity in m/s
   */
  updateGPS(gpsVelocity: number): void {
    // Kalman gain
    const K = this.P / (this.P + this.R_gps);
    
    // Update estimate with GPS measurement
    this.x = this.x + K * (gpsVelocity - this.x);
    this.P = (1 - K) * this.P;
  }
  
  /**
   * Update estimate with IMU-derived velocity
   * @param imuVelocity - IMU-derived velocity in m/s
   */
  updateIMU(imuVelocity: number): void {
    // Kalman gain
    const K = this.P / (this.P + this.R_imu);
    
    // Update estimate with IMU-derived velocity
    this.x = this.x + K * (imuVelocity - this.x);
    this.P = (1 - K) * this.P;
  }
  
  /**
   * Get current velocity estimate
   * @returns Velocity in m/s
   */
  getVelocity(): number {
    return this.x;
  }
  
  /**
   * Reset filter to initial state
   */
  reset(): void {
    this.x = 0;
    this.P = 1;
  }
}

