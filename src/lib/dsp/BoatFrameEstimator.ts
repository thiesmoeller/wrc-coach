import type { Vec3 } from './quaternion';

/** What decided which end of the fore-aft axis is the bow. */
export type BowSignSource = 'gps' | 'shape';

export interface BoatFrameOptions {
  /** Time constant of the level reference once settled (s). */
  levelTauS?: number;
  /** Memory of the fore-aft axis and of the stroke-shape statistic, in seconds of rowing. */
  axisTauS?: number;
  /**
   * Horizontal linear acceleration (m/s² RMS over about 2 s) below which the
   * boat counts as not being rowed; axis and shape learning pause there, so a
   * long stop cannot erode what was learned.
   */
  activityFloor?: number;
  /** Centre of the band in which the surge jerk is taken for the shape rule (Hz). */
  jerkBandHz?: number;
  /** Seconds of rowing the axis must have been learned from before either rule decides the bow. */
  minLearnTimeS?: number;
  /** The shape rule only reverses its choice once the jerk skewness is this far on the other side. */
  shapeHysteresis?: number;
  /** Jerk skewness at which the shape rule reports full confidence. */
  shapeFullConfidence?: number;
  /**
   * Smoothing applied (three times in a row) to the GPS acceleration and to
   * the accelerometer before they are compared (s). Long enough to remove the
   * stroke and to make a GPS latency of a second or two irrelevant.
   */
  gpsSmoothTauS?: number;
  /**
   * No GPS evidence is taken for this long after the start (s): the smoothed
   * accelerometer still remembers the part-stroke the recording began with.
   */
  gpsSettleS?: number;
  /** Memory of the GPS evidence (s). */
  gpsEvidenceTauS?: number;
  /**
   * Evidence ((m/s²)²·s) at which the GPS confirms the bow, and which contrary
   * evidence must reach to overturn a confirmed bow. A speed change of 1.5 m/s
   * within ten seconds, or 2 m/s within twenty, supplies it; in simulation,
   * steady rowing with 0.6 m/s of GPS speed noise stays below half of it.
   */
  gpsLockEvidence?: number;
}

const DEFAULTS: Required<BoatFrameOptions> = {
  levelTauS: 60,
  axisTauS: 60,
  activityFloor: 0.2,
  jerkBandHz: 9,
  minLearnTimeS: 8,
  shapeHysteresis: 0.1,
  shapeFullConfidence: 1,
  gpsSmoothTauS: 3,
  gpsSettleS: 15,
  gpsEvidenceTauS: 120,
  gpsLockEvidence: 0.04,
};

const ACTIVITY_TAU_S = 2;
const GPS_MIN_INTERVAL_S = 0.2;
const GPS_MAX_INTERVAL_S = 5;

/**
 * Boat axes in the phone frame.
 *
 * The phone is rigid on the hull, so bow, starboard and up are fixed
 * directions in the phone; they are estimated there, which makes them
 * independent of heading, of turning and of any yaw drift.
 *
 *   up        slow average of the gravity direction: "level" is the boat's own
 *             long-term average attitude, whatever the mount and whatever the
 *             lean when recording started. A mean weighted toward the recent
 *             past at first, exponential forgetting over `levelTauS` after
 *             two such periods.
 *   bow axis  principal axis of the linear acceleration, perpendicular to up.
 *   bow sign  confirmed by GPS when the boat's speed changes: over the last
 *             minutes, the smoothed accelerometer reading must co-vary with
 *             the smoothed GPS acceleration, and the direction in which it
 *             does is the bow. The raw accelerometer is used for this, not
 *             the gravity-removed one: in the phone frame gravity is a
 *             constant, which a covariance ignores, so the evidence owes
 *             nothing to the orientation filter, the gyro bias or the axis
 *             estimate. Until then, from the shape of the stroke: the fastest
 *             change of hull acceleration is the blades locking on at the
 *             catch, and it points to the bow (positive skewness of the surge
 *             jerk in a band around `jerkBandHz`).
 *   starboard bow × up.
 */
export class BoatFrameEstimator {
  /** Unit vectors in the phone frame. Live views, updated in place. */
  readonly up: Vec3 = { x: 0, y: 0, z: 1 };
  readonly bow: Vec3 = { x: 1, y: 0, z: 0 };
  readonly starboard: Vec3 = { x: 0, y: -1, z: 0 };

  private readonly opts: Required<BoatFrameOptions>;

  private elapsed = 0;
  private started = false;

  // Level reference: mean gravity direction (not normalised).
  private mx = 0;
  private my = 0;
  private mz = 1;

  // Fore-aft axis with an arbitrary but continuous orientation; bow = sign · axis.
  private axX = 1;
  private axY = 0;
  private axZ = 0;
  private cxx = 0;
  private cyy = 0;
  private czz = 0;
  private cxy = 0;
  private cxz = 0;
  private cyz = 0;
  private power = 0;
  private activeTime = 0;

  // Shape rule: moments of the band-limited jerk along the axis.
  private lp1 = 0;
  private lp2 = 0;
  private jerk2 = 0;
  private jerk3 = 0;
  private shapeSign: 1 | -1 = 1;

  // GPS rule. Accelerometer (x, y, z) after one, two and three smoothing stages.
  private readonly accS = new Float64Array(9);
  private gpsPrevT: number | null = null;
  private gpsPrevSpeed = 0;
  private g1 = 0;
  private g2 = 0;
  private g3 = 0;
  // Exponentially forgotten sums over the fixes: time, GPS acceleration,
  // accelerometer, and their product. Their covariance is the evidence vector.
  private evT = 0;
  private evG = 0;
  private readonly evA = new Float64Array(3);
  private readonly evGA = new Float64Array(3);
  private gpsSign: 1 | -1 | 0 = 0;

  private sign: 1 | -1 = 1;
  private flips = 0;

  constructor(options: BoatFrameOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /**
   * @param gravity unit vector pointing up, phone frame (from the orientation filter)
   * @param lin     gravity-removed linear acceleration, phone frame (m/s²)
   * @param accel   accelerometer reading including gravity, phone frame (m/s²)
   * @param dt      time since the previous sample (s); 0 for the first one
   * @returns true when the bow direction reversed on this sample
   */
  update(gravity: Vec3, lin: Vec3, accel: Vec3, dt: number): boolean {
    const accS = this.accS;
    if (!this.started) {
      this.started = true;
      this.mx = gravity.x;
      this.my = gravity.y;
      this.mz = gravity.z;
      for (let stage = 0; stage < 9; stage += 3) {
        accS[stage] = accel.x;
        accS[stage + 1] = accel.y;
        accS[stage + 2] = accel.z;
      }
      this.setUp();
      this.initAxis();
      this.setBow();
      return false;
    }
    if (!(dt > 0)) return false;
    this.elapsed += dt;
    const o = this.opts;

    // Averages over the most recent half of the recording until that is
    // levelTauS long: whatever the boat did while the recording was started is
    // forgotten quadratically rather than carried for a minute.
    const aLevel = dt / Math.min(Math.max(this.elapsed / 2, dt), o.levelTauS);
    this.mx += aLevel * (gravity.x - this.mx);
    this.my += aLevel * (gravity.y - this.my);
    this.mz += aLevel * (gravity.z - this.mz);
    this.setUp();
    const up = this.up;

    const vertical = lin.x * up.x + lin.y * up.y + lin.z * up.z;
    const horizontalSq = lin.x * lin.x + lin.y * lin.y + lin.z * lin.z - vertical * vertical;
    this.power += (1 - Math.exp(-dt / ACTIVITY_TAU_S)) * (horizontalSq - this.power);
    const active = this.power > o.activityFloor * o.activityFloor;

    let aLearn = 0;
    if (active) {
      this.activeTime += dt;
      aLearn = dt / Math.min(Math.max(this.activeTime, dt), o.axisTauS);
      this.cxx += aLearn * (lin.x * lin.x - this.cxx);
      this.cyy += aLearn * (lin.y * lin.y - this.cyy);
      this.czz += aLearn * (lin.z * lin.z - this.czz);
      this.cxy += aLearn * (lin.x * lin.y - this.cxy);
      this.cxz += aLearn * (lin.x * lin.z - this.cxz);
      this.cyz += aLearn * (lin.y * lin.z - this.cyz);
    }
    this.solveAxis();

    const surge = lin.x * this.axX + lin.y * this.axY + lin.z * this.axZ;

    // A running mean at first, like the level reference, so the part-stroke
    // the recording began with is averaged away as fast as possible.
    const aSmooth = dt / Math.min(Math.max(this.elapsed, dt), o.gpsSmoothTauS);
    let inX = accel.x;
    let inY = accel.y;
    let inZ = accel.z;
    for (let stage = 0; stage < 9; stage += 3) {
      inX = accS[stage] += aSmooth * (inX - accS[stage]);
      inY = accS[stage + 1] += aSmooth * (inY - accS[stage + 1]);
      inZ = accS[stage + 2] += aSmooth * (inZ - accS[stage + 2]);
    }

    // Two cascaded one-pole low-passes; the step of the second is the jerk of
    // the smoothed surge, band-limited around jerkBandHz and valid for uneven dt.
    const aBand = 1 - Math.exp(-dt * 2 * Math.PI * o.jerkBandHz);
    this.lp1 += aBand * (surge - this.lp1);
    const step = aBand * (this.lp1 - this.lp2);
    this.lp2 += step;
    if (active) {
      const jerk = step / dt;
      this.jerk2 += aLearn * (jerk * jerk - this.jerk2);
      this.jerk3 += aLearn * (jerk * jerk * jerk - this.jerk3);
    }

    return this.decide();
  }

  /**
   * A GPS speed fix (m/s) arriving now, i.e. after the latest IMU sample. It
   * may describe the boat a second or two earlier.
   */
  updateGps(speed: number): void {
    if (!Number.isFinite(speed) || speed < 0 || !this.started) return;
    const o = this.opts;
    const t = this.elapsed;
    if (this.gpsPrevT !== null) {
      const dt = t - this.gpsPrevT;
      if (dt < GPS_MIN_INTERVAL_S) return;
      if (dt > GPS_MAX_INTERVAL_S) {
        this.g1 = this.g2 = this.g3 = 0;
      } else {
        const a = 1 - Math.exp(-dt / o.gpsSmoothTauS);
        this.g1 += a * ((speed - this.gpsPrevSpeed) / dt - this.g1);
        this.g2 += a * (this.g1 - this.g2);
        this.g3 += a * (this.g2 - this.g3);
        if (t >= o.gpsSettleS) {
          const keep = Math.exp(-dt / o.gpsEvidenceTauS);
          const g = this.g3;
          this.evT = this.evT * keep + dt;
          this.evG = this.evG * keep + g * dt;
          for (let i = 0; i < 3; i++) {
            const acc = this.accS[6 + i];
            this.evA[i] = this.evA[i] * keep + acc * dt;
            this.evGA[i] = this.evGA[i] * keep + g * acc * dt;
          }
        }
      }
    }
    this.gpsPrevT = t;
    this.gpsPrevSpeed = speed;
  }

  getBowSignSource(): BowSignSource {
    return this.gpsSign !== 0 ? 'gps' : 'shape';
  }

  /**
   * 0..1. With GPS: 1 at or beyond the confirmation margin, 0.5 once that
   * evidence has faded, 0 just before contrary evidence overturns it. Without:
   * how clearly the stroke shape points one way.
   */
  getBowConfidence(): number {
    if (this.gpsSign !== 0) {
      return Math.min(1, Math.max(0, 0.5 + (0.5 * this.getGpsEvidence()) / this.opts.gpsLockEvidence));
    }
    return Math.min(1, Math.abs(this.getJerkSkewness()) / this.opts.shapeFullConfidence);
  }

  /** Number of times the bow direction has reversed since the start. */
  getFlipCount(): number {
    return this.flips;
  }

  /**
   * GPS evidence for the current bow direction ((m/s²)²·s); negative = against
   * it. This is the covariance of GPS acceleration and accelerometer along the
   * bow, times the span it was gathered over.
   */
  getGpsEvidence(): number {
    return this.sign * this.axisEvidence();
  }

  /** Skewness of the band-limited surge jerk, signed for the current bow direction. */
  getJerkSkewness(): number {
    if (this.jerk2 <= 0) return 0;
    return (this.sign * this.jerk3) / Math.pow(this.jerk2, 1.5);
  }

  /** Seconds of rowing the fore-aft axis has been learned from. */
  getActiveTime(): number {
    return this.activeTime;
  }

  reset(): void {
    this.elapsed = 0;
    this.started = false;
    this.mx = this.my = 0;
    this.mz = 1;
    this.axX = 1;
    this.axY = this.axZ = 0;
    this.cxx = this.cyy = this.czz = this.cxy = this.cxz = this.cyz = 0;
    this.power = 0;
    this.activeTime = 0;
    this.lp1 = this.lp2 = this.jerk2 = this.jerk3 = 0;
    this.shapeSign = 1;
    this.accS.fill(0);
    this.gpsPrevT = null;
    this.gpsPrevSpeed = 0;
    this.g1 = this.g2 = this.g3 = 0;
    this.evT = this.evG = 0;
    this.evA.fill(0);
    this.evGA.fill(0);
    this.gpsSign = 0;
    this.sign = 1;
    this.flips = 0;
    this.up.x = this.up.y = 0;
    this.up.z = 1;
    this.setBow();
  }

  /** GPS evidence along the axis in its internal orientation. */
  private axisEvidence(): number {
    if (this.evT <= 0) return 0;
    const m = this.evG / this.evT;
    return (
      (this.evGA[0] - m * this.evA[0]) * this.axX +
      (this.evGA[1] - m * this.evA[1]) * this.axY +
      (this.evGA[2] - m * this.evA[2]) * this.axZ
    );
  }

  private decide(): boolean {
    const o = this.opts;
    if (this.activeTime < o.minLearnTimeS) {
      this.setBow();
      return false;
    }

    const evidence = this.axisEvidence();
    if (this.gpsSign === 0) {
      if (Math.abs(evidence) >= o.gpsLockEvidence) this.gpsSign = evidence > 0 ? 1 : -1;
    } else if (this.gpsSign * evidence <= -o.gpsLockEvidence) {
      this.gpsSign = this.gpsSign === 1 ? -1 : 1;
    }

    if (this.jerk2 > 0) {
      const skew = this.jerk3 / Math.pow(this.jerk2, 1.5);
      if (this.shapeSign * skew < -o.shapeHysteresis) this.shapeSign = this.shapeSign === 1 ? -1 : 1;
    }

    const sign = this.gpsSign !== 0 ? this.gpsSign : this.shapeSign;
    const flipped = sign !== this.sign;
    if (flipped) this.flips++;
    this.sign = sign;
    this.setBow();
    return flipped;
  }

  private setUp(): void {
    const n = Math.hypot(this.mx, this.my, this.mz) || 1;
    this.up.x = this.mx / n;
    this.up.y = this.my / n;
    this.up.z = this.mz / n;
  }

  /** Any direction perpendicular to up, until the acceleration says more. */
  private initAxis(): void {
    const u = this.up;
    // Cross with the phone axis least aligned with up.
    const ax = Math.abs(u.x);
    const ay = Math.abs(u.y);
    const az = Math.abs(u.z);
    let x: number;
    let y: number;
    let z: number;
    if (ax <= ay && ax <= az) {
      x = 0;
      y = u.z;
      z = -u.y;
    } else if (ay <= az) {
      x = -u.z;
      y = 0;
      z = u.x;
    } else {
      x = u.y;
      y = -u.x;
      z = 0;
    }
    const n = Math.hypot(x, y, z) || 1;
    this.axX = x / n;
    this.axY = y / n;
    this.axZ = z / n;
  }

  /** Direction of largest acceleration variance in the plane perpendicular to up. */
  private solveAxis(): void {
    const u = this.up;
    // e1 = previous axis made perpendicular to the current up, e2 = up × e1.
    const d = this.axX * u.x + this.axY * u.y + this.axZ * u.z;
    let e1x = this.axX - d * u.x;
    let e1y = this.axY - d * u.y;
    let e1z = this.axZ - d * u.z;
    const n1 = Math.hypot(e1x, e1y, e1z);
    if (n1 < 1e-6) {
      this.initAxis();
      return;
    }
    e1x /= n1;
    e1y /= n1;
    e1z /= n1;
    const e2x = u.y * e1z - u.z * e1y;
    const e2y = u.z * e1x - u.x * e1z;
    const e2z = u.x * e1y - u.y * e1x;

    // C·e1 and C·e2, then the 2×2 covariance in that basis.
    const c1x = this.cxx * e1x + this.cxy * e1y + this.cxz * e1z;
    const c1y = this.cxy * e1x + this.cyy * e1y + this.cyz * e1z;
    const c1z = this.cxz * e1x + this.cyz * e1y + this.czz * e1z;
    const c2x = this.cxx * e2x + this.cxy * e2y + this.cxz * e2z;
    const c2y = this.cxy * e2x + this.cyy * e2y + this.cyz * e2z;
    const c2z = this.cxz * e2x + this.cyz * e2y + this.czz * e2z;
    const m11 = e1x * c1x + e1y * c1y + e1z * c1z;
    const m22 = e2x * c2x + e2y * c2y + e2z * c2z;
    const m12 = e1x * c2x + e1y * c2y + e1z * c2z;

    // Principal direction at angle θ from e1, with |θ| ≤ 90° so the
    // orientation stays continuous with the previous axis.
    const theta = 0.5 * Math.atan2(2 * m12, m11 - m22);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    this.axX = c * e1x + s * e2x;
    this.axY = c * e1y + s * e2y;
    this.axZ = c * e1z + s * e2z;
  }

  private setBow(): void {
    const b = this.bow;
    const u = this.up;
    b.x = this.sign * this.axX;
    b.y = this.sign * this.axY;
    b.z = this.sign * this.axZ;
    const s = this.starboard;
    s.x = b.y * u.z - b.z * u.y;
    s.y = b.z * u.x - b.x * u.z;
    s.z = b.x * u.y - b.y * u.x;
  }
}
