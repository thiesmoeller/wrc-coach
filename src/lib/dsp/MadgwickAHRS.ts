import type { Quat, Vec3 } from './quaternion';
import { quatNormalize, earthToSensor, sensorToEarth } from './quaternion';

/**
 * Madgwick AHRS (IMU variant: gyroscope + accelerometer).
 *
 * Estimates a drift-free orientation quaternion by fusing high-rate gyro
 * integration with a gravity-referenced gradient-descent correction from the
 * accelerometer. This replaces the legacy `ComplementaryFilter`, which only
 * tracked pitch/roll as decoupled Euler angles and — critically — computed the
 * accelerometer tilt reference from data that may already have had gravity
 * removed by the OS, making its "gravity direction" unreliable during motion.
 *
 * With a full quaternion we can (a) remove gravity correctly regardless of how
 * the device reports acceleration, and (b) resolve linear acceleration into a
 * stable earth frame for stroke analysis.
 *
 * The accelerometer input MUST include gravity (specific force). The device
 * motion hook is configured to prefer `accelerationIncludingGravity`.
 *
 * Reference: S. Madgwick, "An efficient orientation filter for inertial and
 * inertial/magnetic sensor arrays" (2010).
 */
export class MadgwickAHRS {
  private q: Quat = { w: 1, x: 0, y: 0, z: 0 };
  private beta: number;

  /**
   * @param beta Filter gain. Higher = trusts the accelerometer more (faster
   *             convergence, more noise). ~0.08 is a good default for MEMS
   *             phone IMUs; the pipeline raises it briefly during warm-up.
   */
  constructor(beta = 0.08) {
    this.beta = beta;
  }

  setBeta(beta: number): void {
    this.beta = beta;
  }

  getQuaternion(): Quat {
    return { ...this.q };
  }

  /**
   * Update with a gyro (rad/s) + accel (any unit, gravity included) sample.
   *
   * @param gx gyro X (rad/s)
   * @param gy gyro Y (rad/s)
   * @param gz gyro Z (rad/s)
   * @param ax accel X (incl. gravity)
   * @param ay accel Y
   * @param az accel Z
   * @param dt time step (seconds)
   */
  update(
    gx: number,
    gy: number,
    gz: number,
    ax: number,
    ay: number,
    az: number,
    dt: number,
  ): Quat {
    let { w: q0, x: q1, y: q2, z: q3 } = this.q;

    // Rate of change of quaternion from gyroscope.
    let qDot0 = 0.5 * (-q1 * gx - q2 * gy - q3 * gz);
    let qDot1 = 0.5 * (q0 * gx + q2 * gz - q3 * gy);
    let qDot2 = 0.5 * (q0 * gy - q1 * gz + q3 * gx);
    let qDot3 = 0.5 * (q0 * gz + q1 * gy - q2 * gx);

    // Only apply the accelerometer correction when the reading is usable
    // (avoids feeding NaN/degenerate gradients from a zero vector).
    const aNorm = Math.hypot(ax, ay, az);
    if (aNorm > 1e-6) {
      ax /= aNorm;
      ay /= aNorm;
      az /= aNorm;

      // Gradient of the objective f = (predicted gravity in sensor frame) - a.
      const _2q0 = 2 * q0;
      const _2q1 = 2 * q1;
      const _2q2 = 2 * q2;
      const _2q3 = 2 * q3;
      const _4q0 = 4 * q0;
      const _4q1 = 4 * q1;
      const _4q2 = 4 * q2;
      const _8q1 = 8 * q1;
      const _8q2 = 8 * q2;
      const q0q0 = q0 * q0;
      const q1q1 = q1 * q1;
      const q2q2 = q2 * q2;
      const q3q3 = q3 * q3;

      let s0 = _4q0 * q2q2 + _2q2 * ax + _4q0 * q1q1 - _2q1 * ay;
      let s1 =
        _4q1 * q3q3 - _2q3 * ax + 4 * q0q0 * q1 - _2q0 * ay - _4q1 +
        _8q1 * q1q1 + _8q1 * q2q2 + _4q1 * az;
      let s2 =
        4 * q0q0 * q2 + _2q0 * ax + _4q2 * q3q3 - _2q3 * ay - _4q2 +
        _8q2 * q1q1 + _8q2 * q2q2 + _4q2 * az;
      let s3 = 4 * q1q1 * q3 - _2q1 * ax + 4 * q2q2 * q3 - _2q2 * ay;

      const sNorm = Math.hypot(s0, s1, s2, s3);
      if (sNorm > 1e-9) {
        s0 /= sNorm;
        s1 /= sNorm;
        s2 /= sNorm;
        s3 /= sNorm;

        qDot0 -= this.beta * s0;
        qDot1 -= this.beta * s1;
        qDot2 -= this.beta * s2;
        qDot3 -= this.beta * s3;
      }
    }

    q0 += qDot0 * dt;
    q1 += qDot1 * dt;
    q2 += qDot2 * dt;
    q3 += qDot3 * dt;

    this.q = quatNormalize({ w: q0, x: q1, y: q2, z: q3 });
    return this.getQuaternion();
  }

  /**
   * Seed the orientation directly from a gravity reading (unit or raw). Used to
   * initialise the filter from the first still sample so it converges instantly
   * instead of swinging from the identity quaternion.
   */
  initFromAccel(ax: number, ay: number, az: number): void {
    const n = Math.hypot(ax, ay, az);
    if (n < 1e-6) return;
    ax /= n;
    ay /= n;
    az /= n;
    // Shortest-arc quaternion rotating sensor gravity (ax,ay,az) onto earth
    // up (0,0,1), expressed as a sensor->earth rotation.
    const dot = az; // (ax,ay,az)·(0,0,1)
    if (dot > 0.999999) {
      this.q = { w: 1, x: 0, y: 0, z: 0 };
      return;
    }
    if (dot < -0.999999) {
      this.q = { w: 0, x: 1, y: 0, z: 0 };
      return;
    }
    // cross(gravity, up)
    const cx = ay * 1 - az * 0;
    const cy = az * 0 - ax * 1;
    const cz = ax * 0 - ay * 0;
    const s = Math.sqrt((1 + dot) * 2);
    this.q = quatNormalize({ w: s / 2, x: cx / s, y: cy / s, z: cz / s });
  }

  /** Direction of gravity (earth up) expressed in the sensor frame (unit). */
  getGravitySensor(): Vec3 {
    return earthToSensor(this.q, { x: 0, y: 0, z: 1 });
  }

  /** Rotate a sensor-frame vector into the earth frame. */
  toEarth(v: Vec3): Vec3 {
    return sensorToEarth(this.q, v);
  }

  reset(): void {
    this.q = { w: 1, x: 0, y: 0, z: 0 };
  }
}
