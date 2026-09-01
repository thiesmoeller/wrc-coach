import { SampleRateEstimator } from '../dsp/SampleRateEstimator';
import { MadgwickAHRS } from '../dsp/MadgwickAHRS';
import { ButterworthBandpass } from '../dsp/Biquad';
import { HorizontalAxisEstimator } from '../dsp/HorizontalAxisEstimator';
import { AdaptiveStrokeDetector, type StrokeMetrics, type AdaptiveStrokeOptions } from '../stroke-detection/AdaptiveStrokeDetector';
import { SpeedEstimator } from './SpeedEstimator';
import type { Vec3 } from '../dsp/quaternion';

const DEG2RAD = Math.PI / 180;

export interface RowingPipelineOptions {
  /** Band-pass cut-offs for the surge signal (Hz). */
  bandLowHz?: number;
  bandHighHz?: number;
  /** Madgwick gain once warmed up. */
  madgwickBeta?: number;
  /** Fallback sample rate before enough timestamps are seen (Hz). */
  fallbackRateHz?: number;
  strokeOptions?: AdaptiveStrokeOptions;
}

export interface ProcessedSample {
  t: number;
  /** Band-passed surge acceleration (m/s²), zero-mean — drives stroke plots. */
  surge: number;
  /** Gravity-removed linear surge (m/s²), retains DC for velocity. */
  surgeLinear: number;
  sway: number;
  heave: number;
  /** Boat lean about the fore–aft axis (deg, +starboard) — the "set". */
  roll: number;
  /** Boat trim about the lateral axis (deg, +bow up). */
  pitch: number;
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
 * become rowing metrics. Both the live app and the offline Python analysis
 * follow this exact sequence, so what you see on the water matches what you
 * analyse afterwards (the legacy code had two divergent pipelines: the app used
 * boat-frame surge while the offline/analysis code filtered raw phone `ay`).
 *
 * Stages, in order:
 *   1. Measure the true sample rate from timestamps.
 *   2. Madgwick AHRS → drift-free orientation quaternion.
 *   3. Rotate accel into the earth frame and subtract the tracked gravity →
 *      linear acceleration.
 *   4. PCA of the horizontal linear accel → data-driven fore–aft (surge) and
 *      lateral (sway) axes (independent of how the phone is mounted).
 *   5. Sample-rate-correct Butterworth band-pass on surge.
 *   6. Adaptive, zero-crossing stroke detection with rich per-stroke metrics.
 *   7. Loosely-coupled INS/GPS Kalman filter → live speed & distance.
 *   8. Boat set (roll) and trim (pitch) from a reference deck normal.
 */
export class RowingPipeline {
  readonly sampleRate = new SampleRateEstimator();
  readonly ahrs: MadgwickAHRS;
  readonly bandpass: ButterworthBandpass;
  readonly axis = new HorizontalAxisEstimator();
  readonly detector: AdaptiveStrokeDetector;
  readonly speed = new SpeedEstimator();

  private opts: Required<Omit<RowingPipelineOptions, 'strokeOptions'>>;
  private gravityMag = 9.81;
  private sampleIdx = 0;
  private deckNormal: Vec3 | null = null;
  private redesigned = false;

  constructor(options: RowingPipelineOptions = {}) {
    this.opts = {
      bandLowHz: options.bandLowHz ?? 0.2,
      bandHighHz: options.bandHighHz ?? 2.0,
      madgwickBeta: options.madgwickBeta ?? 0.08,
      fallbackRateHz: options.fallbackRateHz ?? 50,
    };
    // Warm up the AHRS with a high gain so it locks onto gravity quickly.
    this.ahrs = new MadgwickAHRS(0.5);
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
    this.sampleIdx++;

    // Seed orientation from the very first accel sample so we don't swing in
    // from the identity quaternion.
    if (this.sampleIdx === 1) {
      this.ahrs.initFromAccel(ax, ay, az);
    }

    // Drop the warm-up gain once settled (≈1 s) for low-noise tracking.
    if (this.sampleIdx === 60) this.ahrs.setBeta(this.opts.madgwickBeta);

    const q = this.ahrs.update(
      gx * DEG2RAD, gy * DEG2RAD, gz * DEG2RAD,
      ax, ay, az,
      dt || 1 / rateHz,
    );
    void q;

    // Earth-frame acceleration (gravity still present, along +Z at rest).
    const aE = this.ahrs.toEarth({ x: ax, y: ay, z: az });

    // Track gravity magnitude as the slow component of the vertical channel.
    const gAlpha = dt > 0 ? 1 - Math.exp(-dt / 5) : 0.01;
    this.gravityMag += gAlpha * (aE.z - this.gravityMag);

    const linX = aE.x;
    const linY = aE.y;
    const heave = aE.z - this.gravityMag;

    // Data-driven boat frame.
    this.axis.update(linX, linY, dt || 1 / rateHz);
    const f = this.axis.getForward();
    const s = this.axis.getStarboard();
    const surgeLinear = linX * f.x + linY * f.y;
    const sway = linX * s.x + linY * s.y;

    // Capture the reference deck normal once orientation has settled.
    if (this.deckNormal === null && this.sampleIdx >= 30) {
      this.deckNormal = this.ahrs.getGravitySensor();
    }

    // Boat set (roll) & trim (pitch) from the deck normal.
    let roll = 0;
    let pitch = 0;
    if (this.deckNormal) {
      const up = this.ahrs.toEarth(this.deckNormal); // boat up in earth frame
      const bf = up.x * f.x + up.y * f.y; // component along fore–aft
      const bs = up.x * s.x + up.y * s.y; // component along starboard
      roll = Math.atan2(bs, up.z) / DEG2RAD;
      pitch = Math.atan2(bf, up.z) / DEG2RAD;
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
      inDrive,
      strokeAngle,
      speed: this.speed.getSpeed(),
      distance: this.speed.getDistance(),
      rateHz,
      stroke,
    };
  }

  /** Fuse a GPS speed fix. Returns the corrected speed. */
  processGPS(gpsSpeed: number, accuracy = 5): number {
    this.speed.updateGps(gpsSpeed, accuracy);
    return this.speed.getSpeed();
  }

  getStrokes(): StrokeMetrics[] {
    return this.detector.getAllStrokes();
  }

  reset(): void {
    this.sampleRate.reset();
    this.ahrs.reset();
    this.ahrs.setBeta(0.5);
    this.bandpass.reset();
    this.axis.reset();
    this.detector.reset();
    this.speed.reset();
    this.gravityMag = 9.81;
    this.sampleIdx = 0;
    this.deckNormal = null;
    this.redesigned = false;
  }
}
