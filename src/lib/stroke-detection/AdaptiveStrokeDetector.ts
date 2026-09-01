/**
 * AdaptiveStrokeDetector
 *
 * A robust replacement for the fixed-threshold `StrokeDetector`. The legacy
 * detector fired a "catch" the instant the filtered surge crossed a constant
 * +0.6 m/s² and a "finish" when it crossed −0.3 m/s². That has three problems:
 *
 *   1. Fixed thresholds don't travel: light paddling never reaches +0.6, racing
 *      pressure double-triggers on the twin (legs/back) drive peaks.
 *   2. No refractory period, so noise around the threshold spawns phantom
 *      strokes.
 *   3. Catch/finish are reported at the threshold-crossing instant, not the
 *      physically meaningful zero crossing of acceleration.
 *
 * This detector instead:
 *   - tracks a running robust amplitude scale and derives catch/finish levels
 *     from it (adapts to intensity),
 *   - locates the catch and finish at the *zero crossings* of surge
 *     acceleration (catch = accel turns positive, finish = accel turns
 *     negative), which is where the boat actually reverses,
 *   - gates each candidate stroke on a minimum drive-peak, a minimum drive
 *     duration and a refractory period (rejecting the intra-drive dip and
 *     noise),
 *   - reports rich per-stroke metrics (measured drive ratio, peak drive
 *     acceleration, catch sharpness, and the recovery "check").
 */

export interface StrokeMetrics {
  index: number;
  catchTime: number;
  finishTime: number;
  driveTime: number;     // ms
  recoveryTime: number;  // ms (0 for the first stroke)
  strokeRate: number;    // SPM (0 for the first stroke)
  drivePercent: number;  // % of the cycle spent on the drive (0 for first)
  peakDriveAccel: number;   // max surge accel during the drive (m/s²)
  catchSharpness: number;   // max positive jerk near the catch (m/s³)
  minRecoveryAccel: number; // most negative accel during recovery (m/s²) = "check"
}

export interface AdaptiveStrokeOptions {
  /** Catch level as a fraction of the running amplitude scale. */
  catchScale?: number;
  /** Finish level as a fraction of the running amplitude scale. */
  finishScale?: number;
  /** Absolute floor for the catch/finish levels (m/s²), rejects noise. */
  minLevel?: number;
  /** Minimum accepted drive duration (ms). */
  minDriveMs?: number;
  /** Minimum accepted full-stroke period (ms) — refractory. */
  minPeriodMs?: number;
  /** Maximum plausible full-stroke period (ms). */
  maxPeriodMs?: number;
  /** Time constant of the amplitude tracker (s). */
  ampTau?: number;
}

const DEFAULTS: Required<AdaptiveStrokeOptions> = {
  catchScale: 0.35,
  finishScale: 0.25,
  minLevel: 0.15,
  minDriveMs: 200,
  minPeriodMs: 600, // 100 SPM ceiling
  maxPeriodMs: 6000, // 10 SPM floor
  ampTau: 3,
};

type Phase = 'recovery' | 'drive';

export class AdaptiveStrokeDetector {
  private opts: Required<AdaptiveStrokeOptions>;

  private phase: Phase = 'recovery';
  private prevT: number | null = null;
  private prevA = 0;

  private emaSq = 0; // EMA of a² → amplitude scale
  private lastUpZero: number | null = null;
  private lastDownZero: number | null = null;

  private pendingCatch: number | null = null;
  private drivePeak = 0;
  private driveJerk = 0;
  private recoveryMin = 0;

  private lastCatch: number | null = null;
  private lastFinish: number | null = null;

  private strokeCount = 0;
  private lastDriveTime = 700;
  private lastRecoveryTime = 1400;
  private lastDrivePercent = 33;
  private strokes: StrokeMetrics[] = [];

  constructor(options: AdaptiveStrokeOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Current robust amplitude scale (√ of the EMA of a²). */
  getAmplitude(): number {
    return Math.sqrt(this.emaSq);
  }

  private levels(): { catch: number; finish: number; peak: number } {
    const scale = this.getAmplitude();
    const catchLvl = Math.max(this.opts.minLevel, this.opts.catchScale * scale);
    const finishLvl = Math.max(this.opts.minLevel, this.opts.finishScale * scale);
    const peakLvl = Math.max(this.opts.minLevel * 1.5, 0.5 * scale);
    return { catch: catchLvl, finish: finishLvl, peak: peakLvl };
  }

  /**
   * Process one filtered surge-acceleration sample.
   * @returns a completed stroke's metrics on the sample that finishes it, else null.
   */
  process(t: number, a: number): StrokeMetrics | null {
    const dt = this.prevT === null ? 0.02 : Math.max(1e-3, (t - this.prevT) / 1000);

    // Update amplitude tracker.
    const alpha = 1 - Math.exp(-dt / this.opts.ampTau);
    this.emaSq += alpha * (a * a - this.emaSq);

    // Track zero crossings with linear interpolation for sub-sample timing.
    if (this.prevT !== null) {
      if (this.prevA <= 0 && a > 0) {
        const frac = (0 - this.prevA) / (a - this.prevA);
        this.lastUpZero = this.prevT + frac * (t - this.prevT);
      } else if (this.prevA >= 0 && a < 0) {
        const frac = (0 - this.prevA) / (a - this.prevA);
        this.lastDownZero = this.prevT + frac * (t - this.prevT);
      }
    }

    const lvl = this.levels();
    let completed: StrokeMetrics | null = null;

    if (this.phase === 'recovery') {
      // Track the deepest deceleration during recovery ("check"/run quality).
      if (a < this.recoveryMin) this.recoveryMin = a;

      // Confirm a catch when the surge clearly turns positive.
      if (a > lvl.catch && this.lastUpZero !== null) {
        // Refractory: reject if too soon after the previous catch.
        if (this.lastCatch === null || this.lastUpZero - this.lastCatch >= this.opts.minPeriodMs) {
          this.phase = 'drive';
          this.pendingCatch = this.lastUpZero;
          this.drivePeak = a;
          this.driveJerk = 0;
        }
      }
    } else {
      // In the drive: track peak accel and catch sharpness (jerk).
      if (a > this.drivePeak) this.drivePeak = a;
      if (this.prevT !== null) {
        const jerk = (a - this.prevA) / dt;
        if (jerk > this.driveJerk) this.driveJerk = jerk;
      }

      // Confirm a finish when the surge clearly turns negative.
      if (a < -lvl.finish && this.lastDownZero !== null && this.pendingCatch !== null) {
        const catchTime = this.pendingCatch;
        const finishTime = this.lastDownZero;
        const driveTime = finishTime - catchTime;

        const validDrive = driveTime >= this.opts.minDriveMs && this.drivePeak >= lvl.peak;
        if (validDrive) {
          const recoveryTime = this.lastFinish !== null ? catchTime - this.lastFinish : 0;
          const totalTime = driveTime + recoveryTime;
          const withinPeriod =
            recoveryTime === 0 ||
            (totalTime >= this.opts.minPeriodMs && totalTime <= this.opts.maxPeriodMs);

          if (withinPeriod) {
            let strokeRate = 0;
            let drivePercent = 0;
            if (totalTime > 0 && recoveryTime > 0) {
              strokeRate = Math.round(60000 / totalTime);
              drivePercent = Math.round((driveTime / totalTime) * 100);
              this.lastDriveTime = driveTime;
              this.lastRecoveryTime = recoveryTime;
              this.lastDrivePercent = drivePercent;
            }

            this.strokeCount++;
            completed = {
              index: this.strokeCount,
              catchTime,
              finishTime,
              driveTime,
              recoveryTime,
              strokeRate,
              drivePercent,
              peakDriveAccel: this.drivePeak,
              catchSharpness: this.driveJerk,
              minRecoveryAccel: this.recoveryMin,
            };
            this.strokes.push(completed);

            this.lastCatch = catchTime;
            this.lastFinish = finishTime;
          }
        }

        // Return to recovery regardless (avoids getting stuck mid-drive).
        this.phase = 'recovery';
        this.pendingCatch = null;
        this.recoveryMin = 0;
      }
    }

    this.prevT = t;
    this.prevA = a;
    return completed;
  }

  isInDrive(): boolean {
    return this.phase === 'drive';
  }

  getStrokeCount(): number {
    return this.strokeCount;
  }

  getAllStrokes(): StrokeMetrics[] {
    return [...this.strokes];
  }

  getLastStrokeRate(): number {
    const last = this.strokes[this.strokes.length - 1];
    return last?.strokeRate ?? 0;
  }

  getLastDrivePercent(): number {
    return this.lastDrivePercent;
  }

  /**
   * Stroke-cycle angle (0–360°) using the *measured* drive and recovery
   * durations, so the catch, finish and next catch land at their true fraction
   * of the cycle (the legacy detector hard-coded 700 ms / 1400 ms).
   */
  getStrokeAngle(t: number): number {
    const driveAngle = 3.6 * this.lastDrivePercent; // 360 * drivePercent/100
    const recoveryAngle = 360 - driveAngle;

    if (this.phase === 'drive' && this.pendingCatch !== null) {
      const phase = Math.min(Math.max((t - this.pendingCatch) / this.lastDriveTime, 0), 1);
      return phase * driveAngle;
    }
    if (this.lastFinish !== null) {
      const phase = Math.min(Math.max((t - this.lastFinish) / this.lastRecoveryTime, 0), 1);
      return driveAngle + phase * recoveryAngle;
    }
    return 0;
  }

  reset(): void {
    this.phase = 'recovery';
    this.prevT = null;
    this.prevA = 0;
    this.emaSq = 0;
    this.lastUpZero = null;
    this.lastDownZero = null;
    this.pendingCatch = null;
    this.drivePeak = 0;
    this.driveJerk = 0;
    this.recoveryMin = 0;
    this.lastCatch = null;
    this.lastFinish = null;
    this.strokeCount = 0;
    this.lastDriveTime = 700;
    this.lastRecoveryTime = 1400;
    this.lastDrivePercent = 33;
    this.strokes = [];
  }
}
