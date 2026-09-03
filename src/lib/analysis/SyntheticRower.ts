import type { MotionData } from '../../hooks/useDeviceMotion';

/**
 * SyntheticRower — generates physically self-consistent phone IMU + GPS data for
 * a rowing shell, used both by unit tests and (mirrored in Python) to produce
 * demo `.wrcdata` for the offline analysis.
 *
 * The generator builds the signal the "forward" way: it starts from a realistic
 * boat-frame surge profile and a boat "set" (roll) oscillation, places the phone
 * at an arbitrary mounting (pitch/roll/yaw) in a boat with an arbitrary heading,
 * then rotates true specific force and angular rate into the phone frame and
 * adds gravity + noise. Because the accel/gyro are produced from the *same*
 * orientation that defines the ground-truth roll, recovering that roll and the
 * fore–aft axis is a genuine test of the AHRS + PCA pipeline rather than a
 * tautology.
 */

const G = 9.81;

export interface SyntheticConfig {
  strokeRate?: number;      // SPM
  durationS?: number;
  rateHz?: number;
  mountPitchDeg?: number;   // phone tilt in the boat
  mountRollDeg?: number;
  mountYawDeg?: number;     // phone heading in the boat (180 = rower facing stern)
  boatHeadingDeg?: number;  // boat yaw in the world (tests PCA robustness)
  rollAmpDeg?: number;      // boat set oscillation amplitude
  driveAccelPeak?: number;  // m/s² peak surge during the drive
  noise?: number;           // accel noise σ (m/s²)
  gyroNoise?: number;       // gyro noise σ (deg/s)
  speedMps?: number;        // mean boat speed for GPS
  seed?: number;
}

export interface SyntheticData {
  imu: MotionData[];
  gps: Array<{ t: number; lat: number; lon: number; speed: number; heading: number; accuracy: number }>;
  truthRollDeg: number[]; // ground-truth boat set per IMU sample
  config: Required<SyntheticConfig>;
}

const DEFAULTS: Required<SyntheticConfig> = {
  strokeRate: 24,
  durationS: 60,
  rateHz: 50,
  mountPitchDeg: 18,
  mountRollDeg: -6,
  mountYawDeg: 0,
  boatHeadingDeg: 40,
  rollAmpDeg: 3,
  driveAccelPeak: 3.2,
  noise: 0.05,
  gyroNoise: 0.5,
  speedMps: 4.2,
  seed: 12345,
};

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

const D2R = Math.PI / 180;
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

export function generateSyntheticRow(config: SyntheticConfig = {}): SyntheticData {
  const cfg: Required<SyntheticConfig> = { ...DEFAULTS, ...config };
  const rng = mulberry32(cfg.seed);
  const gauss = () => {
    // Box–Muller.
    const u = Math.max(1e-9, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const dt = 1000 / cfg.rateHz;
  const period = 60000 / cfg.strokeRate;
  const nImu = Math.floor((cfg.durationS * 1000) / dt);

  // Static boat/phone geometry.
  const Rwb_yaw = rotZ(cfg.boatHeadingDeg * D2R);
  const Rbp = mul(
    rotZ(cfg.mountYawDeg * D2R),
    mul(rotY(cfg.mountPitchDeg * D2R), rotX(cfg.mountRollDeg * D2R)),
  );

  const imu: MotionData[] = [];
  const truthRollDeg: number[] = [];
  const t0 = 1_000_000; // arbitrary performance.now()-style base

  let prevRoll = 0;
  for (let i = 0; i < nImu; i++) {
    const t = t0 + i * dt;
    const elapsed = i * dt;
    const cyclePos = (elapsed % period) / period;

    // Boat-frame linear acceleration.
    const surge = surgeShape(cyclePos, cfg.driveAccelPeak) + gauss() * cfg.noise;
    const sway = gauss() * cfg.noise * 0.6;
    const heave = gauss() * cfg.noise;
    const aBoat = [surge, sway, heave];

    // Boat set (roll) oscillation, twice per stroke is common; keep 1×.
    const rollRad = cfg.rollAmpDeg * D2R * Math.sin(2 * Math.PI * cyclePos);
    const rollDeg = (rollRad / D2R);
    truthRollDeg.push(rollDeg);

    // World<-boat and world<-phone rotations at this instant.
    const Rwb = mul(Rwb_yaw, rotX(rollRad));
    const Rwp = mul(Rwb, Rbp);

    // Specific force in world = linear accel (world) + gravity up.
    const aWorldLin = mv(Rwb, aBoat);
    const fWorld = [aWorldLin[0], aWorldLin[1], aWorldLin[2] + G];
    const aPhone = mv(transpose(Rwp), fWorld);

    // Angular rate: boat rolls about its forward axis.
    const rollRate = (rollRad - prevRoll) / (dt / 1000); // rad/s
    prevRoll = rollRad;
    const omegaBoat = [rollRate, 0, 0];
    const omegaPhone = mv(transpose(Rbp), omegaBoat);
    const toDeg = 1 / D2R;

    imu.push({
      t,
      ax: aPhone[0],
      ay: aPhone[1],
      az: aPhone[2],
      gx: omegaPhone[0] * toDeg + gauss() * cfg.gyroNoise,
      gy: omegaPhone[1] * toDeg + gauss() * cfg.gyroNoise,
      gz: omegaPhone[2] * toDeg + gauss() * cfg.gyroNoise,
    });
  }

  // GPS at 1 Hz, straight-line course, speed modulated slightly per stroke.
  const gps: SyntheticData['gps'] = [];
  const nGps = cfg.durationS;
  const lat0 = 53.5;
  const lon0 = 10.0;
  const headingRad = cfg.boatHeadingDeg * D2R;
  let dist = 0;
  for (let i = 0; i < nGps; i++) {
    const t = t0 + i * 1000;
    const speed = cfg.speedMps + 0.15 * Math.sin(2 * Math.PI * (i / (period / 1000))) + gauss() * 0.05;
    dist += speed; // 1 s steps
    const dNorth = dist * Math.cos(headingRad);
    const dEast = dist * Math.sin(headingRad);
    const lat = lat0 + dNorth / 111320;
    const lon = lon0 + dEast / (111320 * Math.cos(lat0 * D2R));
    gps.push({ t, lat, lon, speed, heading: cfg.boatHeadingDeg, accuracy: 5 });
  }

  return { imu, gps, truthRollDeg, config: cfg };
}
