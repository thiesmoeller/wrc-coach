import type { Vec3 } from './quaternion';

export interface GravityFilterOptions {
  /** Gyro white noise (rad/s per √Hz): how fast the integrated attitude wanders. */
  gyroNoiseDensity?: number;
  /** Gyro bias random walk (rad/s per √s): how fast the bias may drift. */
  biasWalkDensity?: number;
  /**
   * How poor a gravity reference the accelerometer is while the boat is rowed
   * (rad per √Hz). Larger = lower correction gain.
   */
  accelTiltNoiseDensity?: number;
  /** 1σ of the unknown tilt of the very first accelerometer sample (rad). */
  initialTiltSigma?: number;
  /** 1σ of the unknown gyro bias at start (rad/s). */
  initialBiasSigma?: number;
  /** Time constant of the gravity-magnitude tracker (s). */
  magnitudeTauS?: number;
}

const DEFAULTS: Required<GravityFilterOptions> = {
  // These settle at a gain of about 0.1 /s on tilt (gravity is averaged over
  // several strokes) and 0.0025 /s² on bias. The gyro noise is that of a poor
  // phone gyro (0.07°/s per √Hz); a quieter one would allow a lower gain.
  gyroNoiseDensity: 1.25e-3,
  biasWalkDensity: 4.4e-5,
  accelTiltNoiseDensity: 1.75e-2,
  initialTiltSigma: 0.3,
  initialBiasSigma: 0.0087,
  magnitudeTauS: 10,
};

/**
 * Tracks the direction of gravity ("up", the direction a resting accelerometer
 * reads) in the phone frame, together with the gyro bias.
 *
 * The gyro carries the estimate through the stroke; the accelerometer only
 * removes its drift. Under way the accelerometer is a poor inclinometer at
 * stroke frequency: surge tilts the reading fore-aft by ±10–20° and, with the
 * phone above the roll axis, roll acceleration tilts it sideways. Both are
 * zero-mean, so a slow *linear* correction averages them out without bias.
 * Nothing is gated sample by sample: rejecting the deep check more often than
 * the drive would shift the mean.
 *
 * The correction gains are those of a Kalman filter on (tilt error, gyro bias)
 * with the same variances on every axis, so one 2×2 covariance serves all of
 * them: a running mean of the accelerometer right after a cold start, settling
 * to a constant low gain. The accelerometer error is itself low-passed, four
 * times faster than the correction it feeds, before it is applied. That makes
 * the correction a critically damped second-order low-pass, which lets about
 * six times less stroke-frequency surge through than a first-order one of the
 * same drift rejection.
 *
 * Heading is neither needed nor estimated. All vectors are in the phone frame;
 * angles in rad, rates in rad/s.
 */
export class GravityFilter {
  /** Unit vector pointing up. Live view, updated in place. */
  readonly up: Vec3 = { x: 0, y: 0, z: 1 };
  /** Estimated gyro bias (rad/s). The component along `up` is not observable and stays near zero. */
  readonly bias: Vec3 = { x: 0, y: 0, z: 0 };

  private readonly opts: Required<GravityFilterOptions>;
  private gMag = 9.81;
  private elapsed = 0;
  private started = false;
  // Covariance of (tilt error, bias error); pTB is the magnitude of their coupling.
  private pTilt = 0;
  private pTB = 0;
  private pBias = 0;
  // Low-passed accelerometer error (rotation vector, rad).
  private mx = 0;
  private my = 0;
  private mz = 0;
  private tiltGain = 0;

  constructor(options: GravityFilterOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.reset();
  }

  /** Magnitude of gravity as this accelerometer measures it (m/s²). */
  getGravityMagnitude(): number {
    return this.gMag;
  }

  /** Current accelerometer correction gain (1/s); its inverse is the time constant of the correction. */
  getTiltGain(): number {
    return this.tiltGain;
  }

  /**
   * @param gx,gy,gz gyroscope (rad/s)
   * @param ax,ay,az accelerometer including gravity (m/s²)
   * @param dt       time since the previous sample (s); 0 for the first one
   */
  update(gx: number, gy: number, gz: number, ax: number, ay: number, az: number, dt: number): void {
    const u = this.up;
    const b = this.bias;
    const aNorm = Math.hypot(ax, ay, az);

    if (!this.started) {
      if (aNorm < 1e-6) return;
      u.x = ax / aNorm;
      u.y = ay / aNorm;
      u.z = az / aNorm;
      this.gMag = aNorm;
      this.started = true;
      return;
    }
    if (!(dt > 0)) return;
    this.elapsed += dt;
    const o = this.opts;

    // Gyro propagation: a direction fixed in the world moves by u × ω in the body.
    const wx = gx - b.x;
    const wy = gy - b.y;
    const wz = gz - b.z;
    let ux = u.x + (u.y * wz - u.z * wy) * dt;
    let uy = u.y + (u.z * wx - u.x * wz) * dt;
    let uz = u.z + (u.x * wy - u.y * wx) * dt;

    this.pTilt += dt * (2 * this.pTB + dt * this.pBias) + o.gyroNoiseDensity ** 2 * dt;
    this.pTB += dt * this.pBias;
    this.pBias += o.biasWalkDensity ** 2 * dt;

    if (aNorm > 1e-6) {
      // e = (a × u) / g: the rotation that separates the estimate from the
      // reading. Dividing by g rather than by |a| keeps it linear in the
      // horizontal acceleration, so a zero-mean stroke of any shape leaves
      // no net tilt.
      const inv = 1 / this.gMag;
      let ex = (ay * uz - az * uy) * inv;
      let ey = (az * ux - ax * uz) * inv;
      let ez = (ax * uy - ay * ux) * inv;

      const rTilt = o.accelTiltNoiseDensity ** 2 / dt;
      const s = this.pTilt + rTilt;
      const kTilt = this.pTilt / s;
      const kBias = this.pTB / s;
      this.pBias -= kBias * this.pTB;
      this.pTB -= kTilt * this.pTB;
      this.pTilt -= kTilt * this.pTilt;
      this.tiltGain = kTilt / dt;

      const smooth = Math.min(1, 4 * kTilt);
      this.mx += smooth * (ex - this.mx);
      this.my += smooth * (ey - this.my);
      this.mz += smooth * (ez - this.mz);
      ex = this.mx;
      ey = this.my;
      ez = this.mz;

      // u += k · (u × e) turns the estimate toward the reading by the fraction k.
      const cx = uy * ez - uz * ey;
      const cy = uz * ex - ux * ez;
      const cz = ux * ey - uy * ex;
      ux += kTilt * cx;
      uy += kTilt * cy;
      uz += kTilt * cz;

      b.x -= kBias * ex;
      b.y -= kBias * ey;
      b.z -= kBias * ez;
    }

    const n = Math.hypot(ux, uy, uz) || 1;
    u.x = ux / n;
    u.y = uy / n;
    u.z = uz / n;

    const vertical = ax * u.x + ay * u.y + az * u.z;
    this.gMag += (dt / Math.min(Math.max(this.elapsed, dt), o.magnitudeTauS)) * (vertical - this.gMag);
  }

  reset(): void {
    this.up.x = 0;
    this.up.y = 0;
    this.up.z = 1;
    this.bias.x = 0;
    this.bias.y = 0;
    this.bias.z = 0;
    this.gMag = 9.81;
    this.elapsed = 0;
    this.started = false;
    this.pTilt = this.opts.initialTiltSigma ** 2;
    this.pTB = 0;
    this.pBias = this.opts.initialBiasSigma ** 2;
    this.mx = 0;
    this.my = 0;
    this.mz = 0;
    this.tiltGain = 0;
  }
}
