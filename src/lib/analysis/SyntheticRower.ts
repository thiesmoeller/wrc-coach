import type { MotionData } from '../../hooks/useDeviceMotion';
import type { Vec3 } from '../dsp/quaternion';

/**
 * SyntheticRower — generates physically self-consistent phone IMU + GPS data for
 * a rowing shell, with ground truth. Used by unit/acceptance tests, by the demo
 * mode (via the streaming generator) and (mirrored in Python) to produce demo
 * `.wrcdata` for the offline analysis.
 *
 * The generator builds the signal the "forward" way: a boat-frame surge profile,
 * a boat attitude trajectory (roll / pitch / yaw scenarios) and a speed that is
 * the integral of that surge. The phone sits at an arbitrary mounting in the
 * boat; specific force and angular rate are derived from the one attitude
 * trajectory, so accelerometer and gyroscope stay mutually consistent for every
 * scenario combination.
 *
 * Frames and signs
 *   Boat frame: x = bow (surge), y = port, z = up.
 *   Roll  : rotation about +x, positive = starboard side down.
 *   Pitch : positive = bow up.
 *   Yaw   : rotation about +z (up), positive = bow swings to port
 *           (counter-clockwise seen from above). GPS compass heading therefore
 *           DEcreases for a positive yaw rate.
 *   World<-boat rotation: Rz(yaw) · Ry(−pitch) · Rx(roll).
 *
 * Generator cycle
 *   Each stroke is one generator cycle with phase 0..1. For the legacy profile
 *   phase 0 is the start of the pre-catch dip (catch ≈ 0.054). For the realistic
 *   profile phase 0 lies in the late recovery and the single-rower catch is at
 *   {@link REALISTIC_CATCH_PHASE}. `startPhase` is expressed in this generator
 *   phase; the truth `phase` channel is catch-referenced instead (0 at a true
 *   catch, rising linearly to 1 at the next).
 */

const G = 9.81;
const D2R = Math.PI / 180;

/** Fraction of the recovery (its last part) that counts as the approach to the catch. */
export const APPROACH_FRACTION = 0.3;
/** Generator phase of the single-rower catch in the realistic profile. */
export const REALISTIC_CATCH_PHASE = 0.2;
/** Rise time of the catch roll kick (ms). */
export const CATCH_KICK_RISE_MS = 100;
/** Duration of the catch yaw-rate pulse (ms). */
export const YAW_KICK_WIDTH_MS = 150;
/** Time after the catch over which the approach wobble dies out (ms). */
export const WOBBLE_FADE_MS = 150;

export type SurgeProfileKind = 'legacy' | 'realistic';
export type GpsSpeedModel = 'legacy' | 'consistent';

export interface SyntheticConfig {
  strokeRate?: number;      // SPM
  durationS?: number;       // batch length; ignored by the stream
  rateHz?: number;
  mountPitchDeg?: number;   // phone tilt in the boat
  mountRollDeg?: number;
  mountYawDeg?: number;     // phone heading in the boat (180 = rower facing stern)
  /** Initial GPS compass heading; also the boat's initial yaw in the generator's world frame. */
  boatHeadingDeg?: number;
  /** 1× per stroke roll sinusoid amplitude (deg): amp · sin(2π · generator phase). */
  rollAmpDeg?: number;
  /**
   * Peak surge during the drive (m/s²). Default 3.2 for the legacy profile and
   * 2.0 · strokeRate / 24 for the realistic one. 0 with the legacy profile
   * gives a boat that rolls but does not surge (the stroke timeline remains).
   */
  driveAccelPeak?: number;
  noise?: number;           // accel noise σ (m/s²)
  gyroNoise?: number;       // gyro noise σ (deg/s)
  speedMps?: number;        // mean boat speed once cruising
  seed?: number;

  /** 'legacy' keeps the original profile (non-zero mean, shallow check). */
  surgeProfile?: SurgeProfileKind;
  /**
   * Realistic profile: fraction of the cycle between the catch and finish zero
   * crossings. Default 0.35 at 18 SPM rising linearly to 0.50 at 36 SPM and
   * above. For the legacy profile the resolved config reports the profile's own
   * value.
   */
  driveFraction?: number;
  /** Realistic profile: depth of the pre-catch check (m/s², positive). Default 2 · driveAccelPeak. */
  checkDepth?: number;
  /** Realistic profile: time from the start of the check dip to the catch zero crossing (ms). */
  checkWidthMs?: number;
  /**
   * Crew timing spread (ms): the boat's surge is the sum of two half crews whose
   * catches are this far apart, so the rise at the catch is two partial steps.
   */
  catchSpreadMs?: number;
  /** Same for the release. Defaults to catchSpreadMs. The legacy profile only supports equal spreads. */
  releaseSpreadMs?: number;
  /** Stroke-to-stroke period jitter, σ in % of the period. */
  rateJitterPct?: number;
  /** Generator phase (0..1) at which the recording begins. */
  startPhase?: number;

  /**
   * 'consistent': GPS speed = true speed (mean + integral of the noise-free
   * surge) at fix time − latency. 'legacy': the original slow sinusoid around
   * speedMps. Default 'consistent' for the realistic profile, 'legacy' otherwise.
   */
  gpsSpeedModel?: GpsSpeedModel;
  gpsNoise?: number;        // GPS speed noise σ (m/s)
  /** A fix stamped t reports the boat state at t − gpsLatencyMs. */
  gpsLatencyMs?: number;
  /**
   * Start from rest: the boat sits still until the first catch, then the mean
   * speed builds from 0 to cruising over this many seconds (0 = already
   * cruising). The matching mean acceleration is added to the surge.
   */
  rampUpS?: number;

  /** Static lean (deg, + starboard down). */
  rollOffsetDeg?: number;
  /** Roll drifts by this much over the approach and returns to level during the drive (deg). */
  approachDriftDeg?: number;
  /** Amplitude of a per-stroke random roll oscillation during the approach (deg). */
  approachWobbleDeg?: number;
  approachWobbleHz?: number;
  /** Roll step right after the catch that decays during the drive (deg, signed). */
  catchKickDeg?: number;
  /** Peak of a yaw-rate pulse right after the catch (deg/s, signed); heading returns by the finish. */
  catchYawKickDegS?: number;
  /** Steady turn (deg/s, + = to port). Adds the centripetal v·ω on the sway axis. */
  turnRateDegS?: number;
  /** Real pitch oscillation, amp · cos(2π · catch-referenced phase): bow highest at the catch (deg). */
  pitchAmpDeg?: number;
  /** Constant gyro bias in the phone frame (deg/s). */
  gyroBiasDegS?: [number, number, number];
}

export type ResolvedSyntheticConfig = Required<SyntheticConfig>;

export interface SyntheticGpsFix {
  t: number;        // arrival time, IMU clock (ms)
  lat: number;
  lon: number;
  speed: number;
  heading: number;  // compass course (deg, 0..360)
  accuracy: number;
}

/** Ground truth for one IMU sample. */
export interface SyntheticTruthSample {
  rollDeg: number;       // + starboard down
  pitchDeg: number;      // + bow up
  rollRateDegS: number;  // body rate about the bow axis
  pitchRateDegS: number; // body rate about the starboard axis (+ bow rising)
  yawRateDegS: number;   // body rate about the boat's up axis (+ bow to port)
  surge: number;         // noise-free surge acceleration (m/s², + toward bow)
  phase: number;         // 0 at a true catch → 1 at the next
  speed: number;         // true boat speed (m/s)
}

/**
 * Per-stroke landmark times in the IMU clock (ms), located on the continuous
 * noise-free surge profile (not on the sampled array).
 */
export interface TruthStroke {
  index: number;
  checkTime: number;     // deepest surge before the catch
  catchTime: number;     // upward zero crossing after the check
  firstPeakTime: number; // first drive peak (first local maximum ≥ half the drive maximum)
  finishTime: number;    // downward zero crossing at the end of the drive
  periodMs: number;      // this catch to the next catch
}

export interface SyntheticTruth {
  rollDeg: number[];
  pitchDeg: number[];
  rollRateDegS: number[];
  pitchRateDegS: number[];
  yawRateDegS: number[];
  surge: number[];
  phase: number[];
  speed: number[];
  /**
   * Strokes whose check..finish lie inside the recording. With `rampUpS` only
   * strokes after the ramp are listed (during it the added mean acceleration
   * moves the zero crossings).
   */
  strokes: TruthStroke[];
  /** Unit vectors in the phone frame. */
  bowPhone: Vec3;
  upPhone: Vec3;
}

export interface SyntheticData {
  imu: MotionData[];
  gps: SyntheticGpsFix[];
  truthRollDeg: number[]; // same array as truth.rollDeg
  truth: SyntheticTruth;
  config: ResolvedSyntheticConfig;
}

export interface SyntheticImuFrame {
  sample: MotionData;
  truth: SyntheticTruthSample;
}

export interface SyntheticRowerStream {
  readonly config: ResolvedSyntheticConfig;
  readonly bowPhone: Vec3;
  readonly upPhone: Vec3;
  /** Next IMU sample (t advances by 1000 / rateHz) with its truth. Never ends. */
  nextImu(): SyntheticImuFrame;
  /** GPS fixes that have arrived up to the last IMU sample and were not taken yet. */
  takeGps(): SyntheticGpsFix[];
  /** Truth strokes completed up to the last IMU sample and not taken yet. */
  takeStrokes(): TruthStroke[];
  /** Sizes of the internal buffers (all bounded however long the stream runs). */
  bufferSizes(): { cycles: number; pendingGps: number; pendingStrokes: number };
}

/** Deterministic PRNG so tests and generated data are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  // Box–Muller.
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

type M3 = number[][];

function rotX(a: number): M3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
}
function rotY(a: number): M3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
}
function rotZ(a: number): M3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}
function mul(a: M3, b: M3): M3 {
  const r: M3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return r;
}
function mv(a: M3, v: number[]): number[] {
  return [
    a[0][0] * v[0] + a[0][1] * v[1] + a[0][2] * v[2],
    a[1][0] * v[0] + a[1][1] * v[1] + a[1][2] * v[2],
    a[2][0] * v[0] + a[2][1] * v[1] + a[2][2] * v[2],
  ];
}
function transpose(a: M3): M3 {
  return [
    [a[0][0], a[1][0], a[2][0]],
    [a[0][1], a[1][1], a[2][1]],
    [a[0][2], a[1][2], a[2][2]],
  ];
}

function smoothstep(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * (3 - 2 * x);
}

function wrap01(x: number): number {
  const w = x - Math.floor(x);
  return w >= 1 ? 0 : w;
}

/**
 * Research-based single-stroke surge profile (fraction of cycle 0..1 → m/s²),
 * scaled to the requested drive peak. Sharp catch, twin (legs/back) drive peak,
 * clean finish, shallow recovery — matching the app's demo generator.
 */
export function surgeShape(cyclePos: number, peak: number): number {
  const k = peak / 3.2;
  if (cyclePos < 0.05) {
    return -0.5 * k * Math.sin((cyclePos / 0.05) * Math.PI);
  } else if (cyclePos < 0.08) {
    const p = (cyclePos - 0.05) / 0.03;
    return (-0.5 + 3.5 * p) * k;
  } else if (cyclePos < 0.35) {
    const p = (cyclePos - 0.08) / 0.27;
    if (p < 0.4) return 3.2 * k * Math.sin((p * Math.PI) / 0.4);
    if (p < 0.5) return (2.8 - (p - 0.4) * 2.0) * k;
    return (2.6 + 0.6 * Math.sin(((p - 0.5) * Math.PI) / 0.5)) * k;
  } else if (cyclePos < 0.4) {
    const p = (cyclePos - 0.35) / 0.05;
    return (2.6 * (1 - p) - 0.3 * p) * k;
  } else if (cyclePos < 0.75) {
    const p = (cyclePos - 0.4) / 0.35;
    return -0.25 * k * Math.sin(p * Math.PI);
  } else {
    const p = (cyclePos - 0.75) / 0.25;
    return (-0.15 - 0.25 * Math.sin(p * Math.PI * 0.8)) * k;
  }
}

/** Default drive fraction of the realistic profile: drive time stays roughly constant as the rate rises. */
export function defaultDriveFraction(strokeRate: number): number {
  return Math.min(0.5, Math.max(0.3, 0.35 + (strokeRate - 18) / 120));
}

const T0_MS = 1_000_000; // arbitrary performance.now()-style base

interface Knot {
  t: number;
  v: number;
}

/**
 * One (half-)crew's realistic surge as a function of time relative to the
 * nominal catch (ms). Half-cosine segments between knots:
 * recovery plateau → check trough → first drive peak → dip → second peak →
 * recovery plateau. The catch and finish zero crossings sit exactly at
 * `catchMs` and `catchMs + driveMs`; the plateau level is solved so the cycle
 * mean is zero.
 */
function realisticGroup(
  catchMs: number,
  driveMs: number,
  periodMs: number,
  peak: number,
  check: number,
  widthMs: number,
): (tauMs: number) => number {
  const p1 = 0.9 * peak;
  const dip = 0.55 * peak;
  const p2 = peak;
  const tTrough = 0.6 * widthMs;
  const tDesc = 0.4 * widthMs;
  const rise = (tTrough * Math.PI) / Math.acos((p1 - check) / (p1 + check));
  const tPeak1 = rise - tTrough;
  const fall = 0.5 * driveMs;

  const knotsFor = (r: number): Knot[] => {
    const t2 = driveMs - (fall * Math.acos(-(p2 - r) / (p2 + r))) / Math.PI;
    return [
      { t: -tTrough - tDesc, v: -r },
      { t: -tTrough, v: -check },
      { t: tPeak1, v: p1 },
      { t: tPeak1 + 0.2 * driveMs, v: dip },
      { t: t2, v: p2 },
      { t: t2 + fall, v: -r },
    ];
  };
  const meanFor = (r: number): number => {
    const k = knotsFor(r);
    let area = 0;
    for (let i = 0; i + 1 < k.length; i++) {
      area += 0.5 * (k[i].v + k[i + 1].v) * (k[i + 1].t - k[i].t);
    }
    area += -r * (periodMs - (k[k.length - 1].t - k[0].t));
    return area / periodMs;
  };

  let lo = 1e-6;
  let hi = 0.9 * check;
  if (!(meanFor(lo) > 0) || !(meanFor(hi) < 0)) {
    throw new Error(
      'SyntheticRower: realistic surge profile has no zero-mean solution ' +
        `(driveAccelPeak ${peak}, checkDepth ${check}, drive ${driveMs.toFixed(0)} ms of ${periodMs.toFixed(0)} ms)`,
    );
  }
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (meanFor(mid) > 0) lo = mid;
    else hi = mid;
  }
  const knots = knotsFor(0.5 * (lo + hi));
  const plateau = knots[0].v;
  const span = knots[knots.length - 1].t - knots[0].t;
  for (let i = 0; i + 1 < knots.length; i++) {
    if (!(knots[i + 1].t - knots[i].t > 1)) {
      throw new Error('SyntheticRower: realistic surge profile is degenerate for this drive time / check width');
    }
  }
  if (!(span < periodMs)) {
    throw new Error('SyntheticRower: drive plus check do not fit in one stroke period');
  }

  return (tauMs: number): number => {
    const rel = tauMs - catchMs - knots[0].t;
    const x = knots[0].t + (rel - Math.floor(rel / periodMs) * periodMs);
    for (let i = 0; i + 1 < knots.length; i++) {
      const a = knots[i];
      const b = knots[i + 1];
      if (x < b.t) {
        return a.v + (b.v - a.v) * 0.5 * (1 - Math.cos((Math.PI * (x - a.t)) / (b.t - a.t)));
      }
    }
    return plateau;
  };
}

export interface SurgeProfile {
  /** Noise-free surge (m/s²) at a generator phase 0..1. */
  at(phase: number): number;
  /** Mean over one cycle (0 for the realistic profile). */
  mean: number;
  /** Landmarks as generator phases, all inside one cycle, check < catch < firstPeak < finish. */
  landmarks: { check: number; catch: number; firstPeak: number; finish: number };
  /**
   * Speed change since phase 0 for a unit period: ∫(surge − mean) dphase.
   * Multiply by the period in seconds for m/s. Zero at phase 0 and 1.
   */
  velocity(phase: number): number;
  /** Cycle mean of {@link velocity}. */
  velocityMean: number;
}

function bisectZero(f: (x: number) => number, a: number, b: number): number {
  let fa = f(a);
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (a + b);
    const fm = f(m);
    if ((fa <= 0 && fm <= 0) || (fa > 0 && fm > 0)) {
      a = m;
      fa = fm;
    } else {
      b = m;
    }
  }
  return 0.5 * (a + b);
}

function goldenExtremum(f: (x: number) => number, a: number, b: number, sign: 1 | -1): number {
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = sign * f(c);
  let fd = sign * f(d);
  for (let i = 0; i < 60; i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = sign * f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = sign * f(d);
    }
  }
  return 0.5 * (a + b);
}

/**
 * @param shape the function the landmarks are located on; differs from `at`
 *              only for a zero-amplitude profile, which keeps the landmark
 *              phases of its shape so the stroke timeline stays defined.
 */
function finalizeProfile(at: (phase: number) => number, shape: (phase: number) => number = at): SurgeProfile {
  const n = 4096;
  const s = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) s[i] = shape(i === n ? 0 : i / n);

  let iMin = 0;
  for (let i = 1; i < n; i++) if (s[i] < s[iMin]) iMin = i;
  const periodic = (x: number) => shape(wrap01(x));
  const check = goldenExtremum(periodic, (iMin - 1) / n, (iMin + 1) / n, -1);

  let jCatch = -1;
  for (let j = iMin; j < n; j++) {
    if (s[j] <= 0 && s[j + 1] > 0) {
      jCatch = j;
      break;
    }
  }
  let jFinish = -1;
  for (let j = Math.max(jCatch, 0); j < n; j++) {
    if (s[j] > 0 && s[j + 1] <= 0) jFinish = j;
  }
  if (jCatch < 0 || jFinish < 0 || check <= 0) {
    throw new Error('SyntheticRower: surge profile landmarks do not fall inside one generator cycle');
  }
  const catchPhase = bisectZero(shape, jCatch / n, (jCatch + 1) / n);
  const finish = bisectZero((x) => -shape(x), jFinish / n, (jFinish + 1) / n);

  let driveMax = 0;
  for (let j = jCatch; j <= jFinish; j++) driveMax = Math.max(driveMax, s[j]);
  let jPeak = -1;
  for (let j = jCatch + 1; j <= jFinish; j++) {
    if (s[j] >= 0.5 * driveMax && s[j] >= s[j - 1] && s[j] > s[j + 1]) {
      jPeak = j;
      break;
    }
  }
  if (jPeak < 0) {
    throw new Error('SyntheticRower: surge profile has no drive peak');
  }
  const firstPeak = goldenExtremum(shape, (jPeak - 1) / n, (jPeak + 1) / n, 1);

  const m = 8192;
  const raw = new Float64Array(m + 1);
  let prev = at(0);
  for (let i = 1; i <= m; i++) {
    const cur = at(i === m ? 0 : i / m);
    raw[i] = raw[i - 1] + (0.5 * (prev + cur)) / m;
    prev = cur;
  }
  const mean = raw[m];
  let velocityMean = 0;
  for (let i = 0; i <= m; i++) {
    raw[i] -= (mean * i) / m;
    if (i > 0) velocityMean += (0.5 * (raw[i - 1] + raw[i])) / m;
  }
  const velocity = (phase: number): number => {
    const x = wrap01(phase) * m;
    const i = Math.min(m - 1, Math.floor(x));
    return raw[i] + (raw[i + 1] - raw[i]) * (x - i);
  };

  return {
    at,
    mean,
    landmarks: { check, catch: catchPhase, firstPeak, finish },
    velocity,
    velocityMean,
  };
}

function buildProfile(
  kind: SurgeProfileKind,
  periodMs: number,
  peak: number,
  check: number,
  widthMs: number,
  driveFraction: number,
  catchSpreadMs: number,
  releaseSpreadMs: number,
): SurgeProfile {
  const spread = catchSpreadMs !== 0 || releaseSpreadMs !== 0;
  if (kind === 'legacy') {
    if (releaseSpreadMs !== catchSpreadMs) {
      throw new Error('SyntheticRower: the legacy surge profile only supports releaseSpreadMs === catchSpreadMs');
    }
    const shift = (0.5 * catchSpreadMs) / periodMs;
    const legacy = (amp: number) =>
      spread
        ? (phase: number) =>
            0.5 * surgeShape(wrap01(phase + shift), amp) + 0.5 * surgeShape(wrap01(phase - shift), amp)
        : (phase: number) => surgeShape(phase, amp);
    return finalizeProfile(legacy(peak), peak > 0 ? undefined : legacy(1));
  }

  const driveMs = driveFraction * periodMs;
  const groups = spread
    ? [
        realisticGroup(-0.5 * catchSpreadMs, driveMs + 0.5 * (catchSpreadMs - releaseSpreadMs), periodMs, peak, check, widthMs),
        realisticGroup(0.5 * catchSpreadMs, driveMs - 0.5 * (catchSpreadMs - releaseSpreadMs), periodMs, peak, check, widthMs),
      ]
    : [realisticGroup(0, driveMs, periodMs, peak, check, widthMs)];
  const weight = 1 / groups.length;
  return finalizeProfile((phase) => {
    const tau = (phase - REALISTIC_CATCH_PHASE) * periodMs;
    let sum = 0;
    for (const g of groups) sum += g(tau);
    return sum * weight;
  });
}

function resolveBase(config: SyntheticConfig) {
  const surgeProfile = config.surgeProfile ?? 'legacy';
  const strokeRate = config.strokeRate ?? 24;
  const driveAccelPeak =
    config.driveAccelPeak ?? (surgeProfile === 'realistic' ? (2.0 * strokeRate) / 24 : 3.2);
  const catchSpreadMs = config.catchSpreadMs ?? 0;
  return {
    surgeProfile,
    strokeRate,
    driveAccelPeak,
    catchSpreadMs,
    releaseSpreadMs: config.releaseSpreadMs ?? catchSpreadMs,
    driveFraction: config.driveFraction ?? defaultDriveFraction(strokeRate),
    checkDepth: config.checkDepth ?? 2 * driveAccelPeak,
    checkWidthMs: config.checkWidthMs ?? 130,
  };
}

/** The noise-free surge profile (and its landmarks) that a config produces. */
export function createSurgeProfile(config: SyntheticConfig = {}): SurgeProfile {
  const b = resolveBase(config);
  return buildProfile(
    b.surgeProfile,
    60000 / b.strokeRate,
    b.driveAccelPeak,
    b.checkDepth,
    b.checkWidthMs,
    b.driveFraction,
    b.catchSpreadMs,
    b.releaseSpreadMs,
  );
}

function resolveConfig(config: SyntheticConfig, profile: SurgeProfile): ResolvedSyntheticConfig {
  const b = resolveBase(config);
  const legacy = b.surgeProfile === 'legacy';
  const lm = profile.landmarks;
  const periodMs = 60000 / b.strokeRate;
  return {
    strokeRate: b.strokeRate,
    durationS: config.durationS ?? 60,
    rateHz: config.rateHz ?? 50,
    mountPitchDeg: config.mountPitchDeg ?? 18,
    mountRollDeg: config.mountRollDeg ?? -6,
    mountYawDeg: config.mountYawDeg ?? 0,
    boatHeadingDeg: config.boatHeadingDeg ?? 40,
    rollAmpDeg: config.rollAmpDeg ?? 3,
    driveAccelPeak: b.driveAccelPeak,
    noise: config.noise ?? 0.05,
    gyroNoise: config.gyroNoise ?? 0.5,
    speedMps: config.speedMps ?? 4.2,
    seed: config.seed ?? 12345,
    surgeProfile: b.surgeProfile,
    driveFraction: legacy ? lm.finish - lm.catch : b.driveFraction,
    checkDepth: legacy ? -profile.at(lm.check) : b.checkDepth,
    checkWidthMs: legacy ? lm.catch * periodMs : b.checkWidthMs,
    catchSpreadMs: b.catchSpreadMs,
    releaseSpreadMs: b.releaseSpreadMs,
    rateJitterPct: config.rateJitterPct ?? 0,
    startPhase: wrap01(config.startPhase ?? 0),
    gpsSpeedModel: config.gpsSpeedModel ?? (legacy ? 'legacy' : 'consistent'),
    gpsNoise: config.gpsNoise ?? 0.05,
    gpsLatencyMs: Math.max(0, config.gpsLatencyMs ?? 0),
    rampUpS: Math.max(0, config.rampUpS ?? 0),
    rollOffsetDeg: config.rollOffsetDeg ?? 0,
    approachDriftDeg: config.approachDriftDeg ?? 0,
    approachWobbleDeg: config.approachWobbleDeg ?? 0,
    approachWobbleHz: config.approachWobbleHz ?? 1.5,
    catchKickDeg: config.catchKickDeg ?? 0,
    catchYawKickDegS: config.catchYawKickDegS ?? 0,
    turnRateDegS: config.turnRateDegS ?? 0,
    pitchAmpDeg: config.pitchAmpDeg ?? 0,
    gyroBiasDegS: config.gyroBiasDegS ? [...config.gyroBiasDegS] : [0, 0, 0],
  };
}

interface Cycle {
  start: number;       // elapsed ms at generator phase 0
  period: number;      // ms
  wobblePhase: number; // rad, for the approach into this cycle's catch
  wobbleScale: number;
}

interface StrokeContext {
  cycle: Cycle;
  index: number;        // absolute index of the generator cycle containing t
  genPhase: number;
  sinceCatch: number;   // ms since the previous true catch
  driveMs: number;      // that stroke's catch → finish
  recoveryMs: number;   // its finish → the next catch
  toNextCatch: number;  // ms until the next true catch
  prevCatch: Cycle;     // cycle owning the previous catch
  nextCatch: Cycle;     // cycle owning the next catch
}

const MAX_PENDING = 64;
const RATE_DIFF_HALF_STEP_MS = 0.5;

/**
 * Streaming generator. Runs indefinitely with bounded memory; the batch
 * {@link generateSyntheticRow} is this stream collected for `durationS`.
 */
export function createSyntheticRowerStream(config: SyntheticConfig = {}): SyntheticRowerStream {
  const profile = createSurgeProfile(config);
  const cfg = resolveConfig(config, profile);
  const lm = profile.landmarks;

  const imuRng = mulberry32(cfg.seed);
  const strokeRng = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0);
  const gpsRng = mulberry32((cfg.seed ^ 0x85ebca6b) >>> 0);

  const dt = 1000 / cfg.rateHz;
  const period = 60000 / cfg.strokeRate;

  const Rbp = mul(
    rotZ(cfg.mountYawDeg * D2R),
    mul(rotY(cfg.mountPitchDeg * D2R), rotX(cfg.mountRollDeg * D2R)),
  );
  const RbpT = transpose(Rbp);
  const toVec = (v: number[]): Vec3 => ({ x: v[0], y: v[1], z: v[2] });
  const bowPhone = toVec(mv(RbpT, [1, 0, 0]));
  const upPhone = toVec(mv(RbpT, [0, 0, 1]));

  // ── Stroke timeline: a sliding window of generator cycles ────────────────
  const drawCycle = (): Omit<Cycle, 'start'> => {
    const jitter = Math.max(-2.5, Math.min(2.5, gaussian(strokeRng)));
    const wobblePhase = 2 * Math.PI * strokeRng();
    const wobbleScale = 0.5 + strokeRng();
    return { period: period * (1 + (cfg.rateJitterPct / 100) * jitter), wobblePhase, wobbleScale };
  };
  const PRE_CYCLES = 3;
  const cycles: Cycle[] = [];
  {
    const pre: Array<Omit<Cycle, 'start'>> = [];
    for (let i = 0; i <= PRE_CYCLES; i++) pre.push(drawCycle());
    let start = -cfg.startPhase * pre[PRE_CYCLES].period;
    cycles[PRE_CYCLES] = { ...pre[PRE_CYCLES], start };
    for (let i = PRE_CYCLES - 1; i >= 0; i--) {
      start -= pre[i].period;
      cycles[i] = { ...pre[i], start };
    }
  }
  let firstIndex = -PRE_CYCLES; // absolute index of cycles[0]; cycle 0 contains t = 0
  let cursor = PRE_CYCLES;      // position in `cycles` of the last located cycle

  const extend = (): void => {
    const last = cycles[cycles.length - 1];
    cycles.push({ ...drawCycle(), start: last.start + last.period });
  };
  const cycleAt = (index: number): Cycle => {
    while (index - firstIndex >= cycles.length) extend();
    return cycles[index - firstIndex];
  };
  const locate = (t: number): number => {
    while (t >= cycles[cursor].start + cycles[cursor].period) {
      if (cursor + 1 >= cycles.length) extend();
      cursor++;
    }
    while (cursor > 0 && t < cycles[cursor].start) cursor--;
    return cursor + firstIndex;
  };
  const prune = (keepFrom: number): void => {
    const drop = Math.min(keepFrom - firstIndex, cursor - PRE_CYCLES);
    if (drop > 0) {
      cycles.splice(0, drop);
      firstIndex += drop;
      cursor -= drop;
    }
  };

  const catchOf = (c: Cycle) => c.start + lm.catch * c.period;
  const finishOf = (c: Cycle) => c.start + lm.finish * c.period;

  const contextAt = (t: number): StrokeContext => {
    const index = locate(t);
    const cycle = cycleAt(index);
    const genPhase = Math.min(Math.max((t - cycle.start) / cycle.period, 0), 1 - 1e-12);
    const afterCatch = t >= catchOf(cycle);
    const prevCatch = afterCatch ? cycle : cycleAt(index - 1);
    const nextCatch = afterCatch ? cycleAt(index + 1) : cycle;
    const cA = catchOf(prevCatch);
    const fA = finishOf(prevCatch);
    const cB = catchOf(nextCatch);
    return {
      cycle,
      index,
      genPhase,
      sinceCatch: t - cA,
      driveMs: fA - cA,
      recoveryMs: cB - fA,
      toNextCatch: cB - t,
      prevCatch,
      nextCatch,
    };
  };

  // ── Start from rest ──────────────────────────────────────────────────────
  const rampMs = cfg.rampUpS * 1000;
  let rowStart = -Infinity;
  let refPeriod = period;
  if (rampMs > 0) {
    const first = catchOf(cycleAt(0)) >= 0 ? cycleAt(0) : cycleAt(1);
    rowStart = catchOf(first);
    refPeriod = first.period;
  }
  const velocityAtCatch = profile.velocity(lm.catch);
  const speedAtCatch = cfg.speedMps - (period / 1000) * (profile.velocityMean - velocityAtCatch);
  const speedOffset = (refPeriod / 1000) * velocityAtCatch;

  /** Fraction of cruising reached and the extra mean acceleration (m/s²). */
  const ramp = (t: number): { level: number; accel: number } => {
    if (rampMs <= 0 || t >= rowStart + rampMs) return { level: 1, accel: 0 };
    if (t < rowStart) return { level: 0, accel: 0 };
    const u = (t - rowStart) / rampMs;
    return {
      level: Math.sin((Math.PI / 2) * u),
      accel: ((speedAtCatch * (Math.PI / 2)) / cfg.rampUpS) * Math.cos((Math.PI / 2) * u),
    };
  };

  const motionAt = (t: number, ctx: StrokeContext): { surge: number; speed: number } => {
    if (t < rowStart) return { surge: 0, speed: 0 };
    const r = ramp(t);
    return {
      surge: profile.at(ctx.genPhase) + r.accel,
      speed:
        speedAtCatch * r.level +
        (ctx.cycle.period / 1000) * profile.velocity(ctx.genPhase) -
        speedOffset,
    };
  };

  // ── Attitude trajectory (degrees) ────────────────────────────────────────
  const attitudeAt = (t: number, ctx: StrokeContext): { roll: number; pitch: number; yaw: number; yawKick: number } => {
    const tau = ctx.sinceCatch;
    const inDrive = tau < ctx.driveMs;
    const approachMs = APPROACH_FRACTION * ctx.recoveryMs;
    const u = 1 - ctx.toNextCatch / approachMs; // 0 at the start of the approach, 1 at the catch

    let roll = cfg.rollOffsetDeg + cfg.rollAmpDeg * Math.sin(2 * Math.PI * ctx.genPhase);

    if (cfg.approachDriftDeg !== 0) {
      roll += inDrive
        ? cfg.approachDriftDeg * 0.5 * (1 + Math.cos((Math.PI * tau) / ctx.driveMs))
        : cfg.approachDriftDeg * smoothstep(u);
    }

    if (cfg.approachWobbleDeg !== 0) {
      const w = (2 * Math.PI * cfg.approachWobbleHz) / 1000;
      if (u > 0) {
        roll +=
          cfg.approachWobbleDeg * ctx.nextCatch.wobbleScale * smoothstep(u / 0.3) *
          Math.sin(ctx.nextCatch.wobblePhase - w * ctx.toNextCatch);
      }
      if (tau < WOBBLE_FADE_MS) {
        roll +=
          cfg.approachWobbleDeg * ctx.prevCatch.wobbleScale * (1 - smoothstep(tau / WOBBLE_FADE_MS)) *
          Math.sin(ctx.prevCatch.wobblePhase + w * tau);
      }
    }

    if (cfg.catchKickDeg !== 0 && inDrive) {
      roll +=
        tau < CATCH_KICK_RISE_MS
          ? cfg.catchKickDeg * smoothstep(tau / CATCH_KICK_RISE_MS)
          : cfg.catchKickDeg * 0.5 *
            (1 + Math.cos((Math.PI * (tau - CATCH_KICK_RISE_MS)) / Math.max(1, ctx.driveMs - CATCH_KICK_RISE_MS)));
    }

    let yawKick = 0;
    if (cfg.catchYawKickDegS !== 0 && inDrive) {
      const step = (cfg.catchYawKickDegS * YAW_KICK_WIDTH_MS) / 2000; // deg gained by the pulse
      if (tau < YAW_KICK_WIDTH_MS) {
        const x = tau / YAW_KICK_WIDTH_MS;
        yawKick = step * (x - Math.sin(2 * Math.PI * x) / (2 * Math.PI));
      } else {
        yawKick =
          step * 0.5 *
          (1 + Math.cos((Math.PI * (tau - YAW_KICK_WIDTH_MS)) / Math.max(1, ctx.driveMs - YAW_KICK_WIDTH_MS)));
      }
    }

    const catchPhase = tau / (tau + ctx.toNextCatch);
    const pitch = cfg.pitchAmpDeg === 0 ? 0 : cfg.pitchAmpDeg * Math.cos(2 * Math.PI * catchPhase);
    const yaw = cfg.boatHeadingDeg + (cfg.turnRateDegS * t) / 1000 + yawKick;
    return { roll, pitch, yaw, yawKick };
  };

  /** level-heading frame <- boat (tilt only). */
  const tiltOf = (a: { roll: number; pitch: number }): M3 =>
    mul(rotY(-a.pitch * D2R), rotX(a.roll * D2R));
  const worldFromBoat = (t: number): M3 => {
    const a = attitudeAt(t, contextAt(t));
    return mul(rotZ(a.yaw * D2R), tiltOf(a));
  };

  // ── GPS ──────────────────────────────────────────────────────────────────
  const lat0 = 53.5;
  const lon0 = 10.0;
  let north = 0;
  let east = 0;
  let nextFix = Math.ceil(cfg.gpsLatencyMs / 1000);
  const pendingGps: SyntheticGpsFix[] = [];
  const pendingStrokes: TruthStroke[] = [];
  let nextStrokeCycle = 0;
  let strokeCount = 0;

  const courseDegAt = (t: number): number => {
    const h = (cfg.boatHeadingDeg - (cfg.turnRateDegS * t) / 1000) % 360;
    return h < 0 ? h + 360 : h;
  };

  const captureFix = (fixIndex: number, tMeas: number, prevElapsed: number): void => {
    const ctx = contextAt(tMeas);
    const trueSpeed = motionAt(tMeas, ctx).speed;
    const course = courseDegAt(tMeas) * D2R;
    const ahead = (trueSpeed * Math.max(0, tMeas - prevElapsed)) / 1000;
    const n = north + ahead * Math.cos(course);
    const e = east + ahead * Math.sin(course);
    const noise = gaussian(gpsRng) * cfg.gpsNoise;
    let speed: number;
    if (cfg.gpsSpeedModel === 'legacy') {
      speed =
        (cfg.speedMps + 0.15 * Math.sin((2 * Math.PI * tMeas) / period)) * ramp(tMeas).level + noise;
    } else {
      speed = Math.max(0, trueSpeed + noise);
    }
    pendingGps.push({
      t: T0_MS + fixIndex * 1000,
      lat: lat0 + n / 111320,
      lon: lon0 + e / (111320 * Math.cos(lat0 * D2R)),
      speed,
      heading: courseDegAt(tMeas),
      accuracy: 5,
    });
    if (pendingGps.length > MAX_PENDING) pendingGps.shift();
  };

  const emitStrokes = (elapsed: number): void => {
    for (;;) {
      const c = cycleAt(nextStrokeCycle);
      const finish = finishOf(c);
      if (finish > elapsed) break;
      const checkTime = c.start + lm.check * c.period;
      const earliest = rampMs > 0 ? rowStart + rampMs : 0;
      if (checkTime >= earliest) {
        const catchTime = catchOf(c);
        pendingStrokes.push({
          index: strokeCount++,
          checkTime: T0_MS + checkTime,
          catchTime: T0_MS + catchTime,
          firstPeakTime: T0_MS + c.start + lm.firstPeak * c.period,
          finishTime: T0_MS + finish,
          periodMs: catchOf(cycleAt(nextStrokeCycle + 1)) - catchTime,
        });
        if (pendingStrokes.length > MAX_PENDING) pendingStrokes.shift();
      }
      nextStrokeCycle++;
    }
  };

  let sampleIndex = 0;
  let lastElapsed = 0;
  const turnRad = cfg.turnRateDegS * D2R;
  const h = RATE_DIFF_HALF_STEP_MS;

  const nextImu = (): SyntheticImuFrame => {
    const elapsed = sampleIndex * dt;
    const prevElapsed = sampleIndex === 0 ? 0 : (sampleIndex - 1) * dt;
    sampleIndex++;

    // ω = vee(Rᵀ·dR/dt) of the world<-boat rotation, by central difference.
    const rel = mul(transpose(worldFromBoat(elapsed - h)), worldFromBoat(elapsed + h));
    const k = 1 / (2 * ((2 * h) / 1000));
    const omegaBoat = [
      (rel[2][1] - rel[1][2]) * k,
      (rel[0][2] - rel[2][0]) * k,
      (rel[1][0] - rel[0][1]) * k,
    ];

    const ctx = contextAt(elapsed);
    const motion = motionAt(elapsed, ctx);
    const att = attitudeAt(elapsed, ctx);

    // Hull acceleration in the level frame aligned with the course: surge along
    // the track, centripetal toward the inside of the turn. A catch yaw kick
    // swings the hull about that course without changing it.
    const aCourse = [motion.surge, motion.speed * turnRad, 0];
    const aHull = mv(rotZ(-att.yawKick * D2R), aCourse);
    const tiltT = transpose(tiltOf(att));
    const fBoat = mv(tiltT, [aHull[0], aHull[1], aHull[2] + G]);
    fBoat[0] += gaussian(imuRng) * cfg.noise;
    fBoat[1] += gaussian(imuRng) * cfg.noise * 0.6;
    fBoat[2] += gaussian(imuRng) * cfg.noise;
    const aPhone = mv(RbpT, fBoat);
    const omegaPhone = mv(RbpT, omegaBoat);

    const sample: MotionData = {
      t: T0_MS + elapsed,
      ax: aPhone[0],
      ay: aPhone[1],
      az: aPhone[2],
      gx: omegaPhone[0] / D2R + cfg.gyroBiasDegS[0] + gaussian(imuRng) * cfg.gyroNoise,
      gy: omegaPhone[1] / D2R + cfg.gyroBiasDegS[1] + gaussian(imuRng) * cfg.gyroNoise,
      gz: omegaPhone[2] / D2R + cfg.gyroBiasDegS[2] + gaussian(imuRng) * cfg.gyroNoise,
    };
    const truth: SyntheticTruthSample = {
      rollDeg: att.roll,
      pitchDeg: att.pitch,
      rollRateDegS: omegaBoat[0] / D2R,
      pitchRateDegS: -omegaBoat[1] / D2R,
      yawRateDegS: omegaBoat[2] / D2R,
      surge: motion.surge,
      phase: ctx.sinceCatch / (ctx.sinceCatch + ctx.toNextCatch),
      speed: motion.speed,
    };

    for (;;) {
      const tMeas = nextFix * 1000 - cfg.gpsLatencyMs;
      if (tMeas > elapsed) break;
      captureFix(nextFix, tMeas, prevElapsed);
      nextFix++;
    }
    const course = courseDegAt(elapsed) * D2R;
    const step = (motion.speed * (elapsed - prevElapsed)) / 1000;
    north += step * Math.cos(course);
    east += step * Math.sin(course);

    emitStrokes(elapsed);
    lastElapsed = elapsed;
    prune(nextStrokeCycle - 1);

    return { sample, truth };
  };

  const takeGps = (): SyntheticGpsFix[] => {
    const now = T0_MS + lastElapsed;
    let n = 0;
    while (n < pendingGps.length && pendingGps[n].t <= now) n++;
    return pendingGps.splice(0, n);
  };

  return {
    config: cfg,
    bowPhone,
    upPhone,
    nextImu,
    takeGps,
    takeStrokes: () => pendingStrokes.splice(0, pendingStrokes.length),
    bufferSizes: () => ({
      cycles: cycles.length,
      pendingGps: pendingGps.length,
      pendingStrokes: pendingStrokes.length,
    }),
  };
}

export function generateSyntheticRow(config: SyntheticConfig = {}): SyntheticData {
  const stream = createSyntheticRowerStream(config);
  const cfg = stream.config;
  const nImu = Math.floor((cfg.durationS * 1000) / (1000 / cfg.rateHz));

  const imu: MotionData[] = [];
  const gps: SyntheticGpsFix[] = [];
  const truth: SyntheticTruth = {
    rollDeg: [],
    pitchDeg: [],
    rollRateDegS: [],
    pitchRateDegS: [],
    yawRateDegS: [],
    surge: [],
    phase: [],
    speed: [],
    strokes: [],
    bowPhone: stream.bowPhone,
    upPhone: stream.upPhone,
  };

  for (let i = 0; i < nImu; i++) {
    const frame = stream.nextImu();
    imu.push(frame.sample);
    truth.rollDeg.push(frame.truth.rollDeg);
    truth.pitchDeg.push(frame.truth.pitchDeg);
    truth.rollRateDegS.push(frame.truth.rollRateDegS);
    truth.pitchRateDegS.push(frame.truth.pitchRateDegS);
    truth.yawRateDegS.push(frame.truth.yawRateDegS);
    truth.surge.push(frame.truth.surge);
    truth.phase.push(frame.truth.phase);
    truth.speed.push(frame.truth.speed);
    for (const fix of stream.takeGps()) gps.push(fix);
    for (const stroke of stream.takeStrokes()) truth.strokes.push(stroke);
  }

  return { imu, gps, truthRollDeg: truth.rollDeg, truth, config: cfg };
}

const SKIFF: SyntheticConfig = {
  surgeProfile: 'realistic',
  strokeRate: 22,
  durationS: 120,
  speedMps: 3.8,
  rollAmpDeg: 0.5,
  rollOffsetDeg: 0.5,
  pitchAmpDeg: 0.3,
  rateJitterPct: 1.5,
  gyroBiasDegS: [0.2, -0.15, 0.1],
  gpsNoise: 0.2,
  gpsLatencyMs: 500,
};

const CREW: SyntheticConfig = {
  ...SKIFF,
  strokeRate: 30,
  speedMps: 5.0,
  rollAmpDeg: 0.3,
  rollOffsetDeg: 0,
};

/** Named scenarios (plain configs; spread one and override what you need). */
export const SCENARIOS = {
  /** Single scull, steady state, well balanced. */
  skiffSteady: SKIFF,
  /** Falls 2° to starboard through the approach, levels during the drive. */
  skiffApproachDrift: { ...SKIFF, approachDriftDeg: 2 },
  /** Stroke-to-stroke balance corrections (1.5° at 1.5 Hz) in the approach. */
  skiffApproachWobble: { ...SKIFF, approachWobbleDeg: 1.5 },
  /** One blade locks first: roll and yaw kick at the catch. */
  skiffUnevenCatch: { ...SKIFF, catchKickDeg: 1.5, catchYawKickDegS: 4 },
  /** Crew boat with every blade locking together. */
  crewTogether: CREW,
  /** Half the crew catches and releases 60 ms after the other half. */
  crewCatchSpread: { ...CREW, catchSpreadMs: 60 },
  /** Steady 2°/s turn to port. */
  turning: { ...SKIFF, turnRateDegS: 2 },
  /** Sits still, then builds to cruising speed over 20 s; realistic GPS noise and latency. */
  startFromRest: { ...SKIFF, rampUpS: 20, gpsNoise: 0.3, gpsLatencyMs: 1000 },
} satisfies Record<string, SyntheticConfig>;
