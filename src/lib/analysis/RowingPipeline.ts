import { SampleRateEstimator } from '../dsp/SampleRateEstimator';
import { GravityFilter, type GravityFilterOptions } from '../dsp/GravityFilter';
import { BoatFrameEstimator, type BoatFrameOptions, type BowSignSource } from '../dsp/BoatFrameEstimator';
import { ButterworthBandpass } from '../dsp/Biquad';
import { AdaptiveStrokeDetector, type StrokeMetrics, type AdaptiveStrokeOptions } from '../stroke-detection/AdaptiveStrokeDetector';
import { SpeedEstimator } from './SpeedEstimator';
import type { Vec3 } from '../dsp/quaternion';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface RowingPipelineOptions {
  /** Band-pass cut-offs for the surge signal (Hz). */
  bandLowHz?: number;
  bandHighHz?: number;
  /** Fallback sample rate before enough timestamps are seen (Hz). */
  fallbackRateHz?: number;
  gravityOptions?: GravityFilterOptions;
  boatFrameOptions?: BoatFrameOptions;
  strokeOptions?: AdaptiveStrokeOptions;
}

/**
 * Boat frame: surge + = toward the bow, sway + = toward starboard, heave + =
 * up. Angles and rates follow the right-hand rule about bow / starboard / up
 * except where stated.
 */
export interface ProcessedSample {
  t: number;
  /** Band-passed surge acceleration (m/s²), zero-mean — drives stroke plots. */
  surge: number;
  /** Gravity-removed linear surge (m/s²), retains DC for velocity. */
  surgeLinear: number;
  sway: number;
  heave: number;
  /**
   * Boat lean about the fore–aft axis (deg, + = starboard side down) — the
   * "set". Zero is the boat's own average attitude over about the last minute
   * (over the recent half of the session while that is shorter).
   */
  roll: number;
  /** Boat trim about the lateral axis (deg, + = bow up), same zero. */
  pitch: number;
  /**
   * Gyro about the bow axis, bias removed (deg/s, + = starboard side going
   * down): the time derivative of `roll`, unfiltered.
   */
  rollRate: number;
  /** Gyro about the lateral axis, bias removed (deg/s, + = bow rising). */
  pitchRate: number;
  /**
   * Gyro about the up axis (deg/s, + = bow turning to port). Unlike the other
   * two it still carries the gyro's own bias about the vertical, which nothing
   * in an IMU can observe.
   */
  yawRate: number;
  /**
   * What decided which way is the bow, and with it which side is starboard:
   * 'gps' once speed changes have confirmed it, 'shape' while it is only
   * inferred from the stroke shape (treat as unconfirmed).
   */
  bowSignSource: BowSignSource;
  /** Confidence in that decision, 0..1. */
  bowConfidence: number;
  /**
   * True on the one sample where the bow direction reversed. From here on
   * surge, sway, roll, pitch and the roll / pitch rates have the opposite sign
   * to what was reported before, and stroke detection starts afresh. Expect
   * one a few seconds into a session, when the first decision replaces the
   * provisional direction, and one more if GPS later overrules the stroke
   * shape.
   */
  bowFlipped: boolean;
  inDrive: boolean;
  strokeAngle: number;
  speed: number;
  distance: number;
  rateHz: number;
  /** Present only on the sample that completes a stroke. */
  stroke: StrokeMetrics | null;
}

/**
 * RowingPipeline — the single, shared definition of how raw phone IMU + GPS
 * become rowing metrics, used by the live app and by the offline analysis.
 * Everything up to the boat-frame channels happens in the phone frame; no
 * heading is involved.
 *
 * Stages, in order:
 *   1. Measure the true sample rate from timestamps.
 *   2. Orientation filter → direction of gravity in the phone frame and gyro
 *      bias.
 *   3. Subtract gravity → linear acceleration.
 *   4. Boat frame → up (level reference), bow and starboard as fixed
 *      directions in the phone.
 *   5. Project: surge / sway / heave, roll / pitch against the level
 *      reference, and the gyro as roll / pitch / yaw rate.
 *   6. Sample-rate-correct Butterworth band-pass on surge.
 *   7. Adaptive, zero-crossing stroke detection with rich per-stroke metrics.
 *   8. Loosely-coupled INS/GPS Kalman filter → live speed & distance.
 */
export class RowingPipeline {
  readonly sampleRate = new SampleRateEstimator();
  readonly gravity: GravityFilter;
  readonly frame: BoatFrameEstimator;
  readonly bandpass: ButterworthBandpass;
  readonly detector: AdaptiveStrokeDetector;
  readonly speed = new SpeedEstimator();

  private opts: Required<Pick<RowingPipelineOptions, 'bandLowHz' | 'bandHighHz' | 'fallbackRateHz'>>;
  private redesigned = false;
  private readonly lin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly accel: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(options: RowingPipelineOptions = {}) {
    this.opts = {
      bandLowHz: options.bandLowHz ?? 0.2,
      bandHighHz: options.bandHighHz ?? 2.0,
      fallbackRateHz: options.fallbackRateHz ?? 50,
    };
    this.gravity = new GravityFilter(options.gravityOptions);
    this.frame = new BoatFrameEstimator(options.boatFrameOptions);
    this.bandpass = new ButterworthBandpass(
      this.opts.bandLowHz,
      this.opts.bandHighHz,
      this.opts.fallbackRateHz,
    );
    this.detector = new AdaptiveStrokeDetector(options.strokeOptions);
  }

  /**
   * Process one raw IMU sample.
   * @param ax,ay,az accelerometer INCLUDING gravity (m/s²)
   * @param gx,gy,gz gyroscope (deg/s)
   */
  processIMU(
    t: number,
    ax: number,
    ay: number,
    az: number,
    gx: number,
    gy: number,
    gz: number,
  ): ProcessedSample {
    const dt = this.sampleRate.update(t);
    const rateHz = this.sampleRate.getRate(this.opts.fallbackRateHz);

    const wx = gx * DEG2RAD;
    const wy = gy * DEG2RAD;
    const wz = gz * DEG2RAD;
    this.gravity.update(wx, wy, wz, ax, ay, az, dt);
    const g = this.gravity.up;
    const gMag = this.gravity.getGravityMagnitude();

    const lin = this.lin;
    lin.x = ax - gMag * g.x;
    lin.y = ay - gMag * g.y;
    lin.z = az - gMag * g.z;

    const accel = this.accel;
    accel.x = ax;
    accel.y = ay;
    accel.z = az;

    const bowFlipped = this.frame.update(g, lin, accel, dt);
    const bow = this.frame.bow;
    const stb = this.frame.starboard;
    const up = this.frame.up;

    const surgeLinear = lin.x * bow.x + lin.y * bow.y + lin.z * bow.z;
    const sway = lin.x * stb.x + lin.y * stb.y + lin.z * stb.z;
    // Along the true vertical, not the boat's up axis.
    const heave = ax * g.x + ay * g.y + az * g.z - gMag;

    // Gravity seen from the boat axes: a starboard-down roll tips it toward
    // port, a bow-up pitch tips it toward the bow.
    const gBow = g.x * bow.x + g.y * bow.y + g.z * bow.z;
    const gStb = g.x * stb.x + g.y * stb.y + g.z * stb.z;
    const gUp = g.x * up.x + g.y * up.y + g.z * up.z;
    const roll = Math.atan2(-gStb, gUp) * RAD2DEG;
    const pitch = Math.atan2(gBow, Math.hypot(gStb, gUp)) * RAD2DEG;

    const bias = this.gravity.bias;
    const rx = wx - bias.x;
    const ry = wy - bias.y;
    const rz = wz - bias.z;
    const rollRate = (rx * bow.x + ry * bow.y + rz * bow.z) * RAD2DEG;
    const pitchRate = (rx * stb.x + ry * stb.y + rz * stb.z) * RAD2DEG;
    const yawRate = (rx * up.x + ry * up.y + rz * up.z) * RAD2DEG;

    if (bowFlipped) {
      // The band-pass is linear, so negating its state continues it exactly as
      // if the sign had been right all along. The detector's half-tracked
      // stroke is meaningless with the polarity reversed.
      this.bandpass.invert();
      this.detector.restartTracking();
    }

    // Retune the band-pass to the measured rate once it stabilises.
    if (!this.redesigned && this.sampleRate.isReady(20)) {
      this.bandpass.redesign(rateHz);
      this.redesigned = true;
    }
    const surge = this.bandpass.process(surgeLinear);

    // Stroke detection on the clean band-passed surge.
    const stroke = this.detector.process(t, surge);
    const inDrive = this.detector.isInDrive();
    const strokeAngle = this.detector.getStrokeAngle(t);

    // Speed/distance via INS propagation (GPS corrects it in processGPS).
    this.speed.predict(surgeLinear, dt);

    return {
      t,
      surge,
      surgeLinear,
      sway,
      heave,
      roll,
      pitch,
      rollRate,
      pitchRate,
      yawRate,
      bowSignSource: this.frame.getBowSignSource(),
      bowConfidence: this.frame.getBowConfidence(),
      bowFlipped,
      inDrive,
      strokeAngle,
      speed: this.speed.getSpeed(),
      distance: this.speed.getDistance(),
      rateHz,
      stroke,
    };
  }

  /**
   * Fuse a GPS speed fix, taken to arrive now (at the latest IMU sample).
   * Returns the corrected speed.
   */
  processGPS(gpsSpeed: number, accuracy = 5): number {
    this.frame.updateGps(gpsSpeed);
    this.speed.updateGps(gpsSpeed, accuracy);
    return this.speed.getSpeed();
  }

  getStrokes(): StrokeMetrics[] {
    return this.detector.getAllStrokes();
  }

  reset(): void {
    this.sampleRate.reset();
    this.gravity.reset();
    this.frame.reset();
    this.bandpass.reset();
    this.detector.reset();
    this.speed.reset();
    this.redesigned = false;
  }
}
