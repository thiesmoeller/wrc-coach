/**
 * SpeedEstimator — loosely-coupled INS/GPS fusion for boat speed & distance.
 *
 * The legacy `KalmanFilterGPS` only ever called `updateGPS()`; its `predict()`
 * and `updateIMU()` were dead code, so it was really just an exponential smoother
 * on the ~1 Hz GPS speed — laggy, and blank whenever GPS dropped out.
 *
 * This estimator does the fusion properly. It runs a 2-state Kalman filter on
 * [speed, accel-bias]: the high-rate surge acceleration propagates the speed
 * between fixes (so split and distance stay live at IMU rate), while each GPS
 * fix both corrects the speed and observes the slowly-varying accelerometer
 * bias — the thing that otherwise makes dead-reckoned velocity drift. Distance
 * is the trapezoidal integral of the fused speed, giving a far better total than
 * summing noisy ~1 Hz GPS positions.
 */
export interface SpeedEstimatorOptions {
  /** Process noise on speed (m²/s³): how quickly true speed can change. */
  qSpeed?: number;
  /** Process noise on the accel bias (m²/s⁵): how quickly bias drifts. */
  qBias?: number;
  /** Base GPS speed measurement noise (m²/s²) at good accuracy. */
  rGpsBase?: number;
  /** Innovation gate (in σ) for rejecting GPS outliers. */
  gateSigma?: number;
}

const DEFAULTS: Required<SpeedEstimatorOptions> = {
  qSpeed: 0.25,
  qBias: 1e-4,
  rGpsBase: 0.4,
  gateSigma: 4,
};

export class SpeedEstimator {
  private opts: Required<SpeedEstimatorOptions>;

  private v = 0; // speed (m/s)
  private b = 0; // accel bias (m/s²)
  // Covariance matrix P = [[p00,p01],[p10,p11]].
  private p00 = 1;
  private p01 = 0;
  private p10 = 0;
  private p11 = 1;

  private distance = 0;
  private hasGps = false;

  constructor(options: SpeedEstimatorOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /**
   * Propagate with a surge (fore–aft, earth/boat-frame) acceleration sample.
   * @param accel surge linear acceleration (m/s²)
   * @param dt    time step (seconds)
   */
  predict(accel: number, dt: number): void {
    if (dt <= 0) return;
    const vPrev = this.v;

    // State: v' = v + (accel - b)·dt ; b' = b.
    this.v = this.v + (accel - this.b) * dt;
    if (this.v < 0) this.v = 0; // a shell never travels backward

    // Jacobian F = [[1, -dt], [0, 1]].
    // P = F P Fᵀ + Q
    const { qSpeed, qBias } = this.opts;
    const p00 = this.p00 - dt * (this.p10 + this.p01) + dt * dt * this.p11 + qSpeed * dt;
    const p01 = this.p01 - dt * this.p11;
    const p10 = this.p10 - dt * this.p11;
    const p11 = this.p11 + qBias * dt;
    this.p00 = p00;
    this.p01 = p01;
    this.p10 = p10;
    this.p11 = p11;

    // Integrate distance (trapezoidal).
    this.distance += 0.5 * (vPrev + this.v) * dt;
  }

  /**
   * Correct with a GPS speed measurement.
   * @param gpsSpeed measured speed over ground (m/s)
   * @param accuracy horizontal accuracy (m); scales measurement noise.
   * @returns true if the measurement was accepted (passed the outlier gate).
   */
  updateGps(gpsSpeed: number, accuracy = 5): boolean {
    if (gpsSpeed < 0 || !Number.isFinite(gpsSpeed)) return false;

    // Measurement noise grows with poor accuracy.
    const r = this.opts.rGpsBase * (1 + Math.max(0, accuracy - 3) / 5);

    // Innovation y = z - Hx, H = [1, 0].
    const y = gpsSpeed - this.v;
    const s = this.p00 + r;

    // Outlier gate.
    if (this.hasGps && y * y > this.opts.gateSigma * this.opts.gateSigma * s) {
      return false;
    }
    this.hasGps = true;

    // Kalman gain K = P Hᵀ / S = [p00, p10] / s.
    const k0 = this.p00 / s;
    const k1 = this.p10 / s;

    this.v += k0 * y;
    this.b += k1 * y;
    if (this.v < 0) this.v = 0;

    // P = (I - K H) P.
    const p00 = (1 - k0) * this.p00;
    const p01 = (1 - k0) * this.p01;
    const p10 = this.p10 - k1 * this.p00;
    const p11 = this.p11 - k1 * this.p01;
    this.p00 = p00;
    this.p01 = p01;
    this.p10 = p10;
    this.p11 = p11;

    return true;
  }

  getSpeed(): number {
    return this.v;
  }

  getBias(): number {
    return this.b;
  }

  getDistance(): number {
    return this.distance;
  }

  reset(): void {
    this.v = 0;
    this.b = 0;
    this.p00 = 1;
    this.p01 = 0;
    this.p10 = 0;
    this.p11 = 1;
    this.distance = 0;
    this.hasGps = false;
  }
}
