/**
 * Accelerometer sign convention.
 *
 * W3C `devicemotion` (and Android Chrome) report `accelerationIncludingGravity`
 * as roughly +9.81 along the device axis that points up: {0, 0, +9.81} for a
 * phone lying flat with the screen up. iOS browsers report the opposite sign on
 * all three axes. `rotationRate` is not affected.
 *
 * The detector decides which convention the platform uses so samples can be
 * normalised to the W3C one before anything else sees them.
 */

const D2R = Math.PI / 180;

export interface DeviceVector {
  x: number;
  y: number;
  z: number;
}

/**
 * Unit vector pointing up, in device coordinates, for W3C `deviceorientation`
 * angles. The spec's rotation is R = Rz(alpha)·Rx(beta)·Ry(gamma), device to
 * earth (east, north, up); up in the device frame is the third row of R, which
 * does not depend on alpha.
 */
export function upInDevice(betaDeg: number, gammaDeg: number): DeviceVector {
  const b = betaDeg * D2R;
  const g = gammaDeg * D2R;
  return {
    x: -Math.cos(b) * Math.sin(g),
    y: Math.sin(b),
    z: Math.cos(b) * Math.cos(g),
  };
}

export interface NavigatorLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

/** iOS / iPadOS, including iPadOS presenting itself as a desktop Mac. */
export function isAppleMobile(nav: NavigatorLike | undefined): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  const desktopMac = nav.platform === 'MacIntel' || /Macintosh/.test(ua);
  return desktopMac && (nav.maxTouchPoints ?? 0) > 1;
}

export interface AccelSignDetectorOptions {
  /** Used until the data decides: true when the platform is expected to invert (iOS). */
  fallbackInverted: boolean;
  /** Paired accelerometer + orientation samples averaged per decision. */
  windowSamples?: number;
  /** |mean of up · acceleration| (m/s²) needed to decide; gravity gives about 9.8. */
  marginMps2?: number;
}

export type AccelSignSource = 'fallback' | 'data';

export class AccelSignDetector {
  private readonly windowSamples: number;
  private readonly margin: number;
  private applied: 1 | -1;
  private decided: 1 | -1 | null = null;
  private locked = false;
  private sum = 0;
  private count = 0;

  constructor(options: AccelSignDetectorOptions) {
    this.windowSamples = Math.max(1, options.windowSamples ?? 12);
    this.margin = options.marginMps2 ?? 5;
    this.applied = options.fallbackInverted ? -1 : 1;
  }

  /** Factor that turns a raw accelerometer sample into the W3C convention. */
  get sign(): 1 | -1 {
    return this.applied;
  }

  get inverted(): boolean {
    return this.applied === -1;
  }

  /** Where the sign currently in use came from. */
  get source(): AccelSignSource {
    return this.decided !== null && this.decided === this.applied ? 'data' : 'fallback';
  }

  /** The data has decided, whether or not the result is in use yet. */
  get isDecided(): boolean {
    return this.decided !== null;
  }

  /** What the data decided: true = the platform inverts, null = undecided. */
  get decidedInverted(): boolean | null {
    return this.decided === null ? null : this.decided === -1;
  }

  /** The data disagrees with the sign in use and the change waits for the lock to lift. */
  get pending(): boolean {
    return this.decided !== null && this.decided !== this.applied;
  }

  /**
   * While locked (a recording is running) the sign in use never changes; a
   * decision reached meanwhile is applied when the lock lifts.
   */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (!locked && this.decided !== null) this.applied = this.decided;
  }

  /**
   * Feed one raw accelerometer sample (including gravity) together with the
   * device tilt reported at about the same time.
   */
  observe(ax: number, ay: number, az: number, betaDeg: number, gammaDeg: number): void {
    if (this.decided !== null) return;
    const up = upInDevice(betaDeg, gammaDeg);
    const dot = up.x * ax + up.y * ay + up.z * az;
    if (!Number.isFinite(dot)) return;

    this.sum += dot;
    this.count++;
    if (this.count < this.windowSamples) return;

    const mean = this.sum / this.count;
    this.sum = 0;
    this.count = 0;
    if (Math.abs(mean) < this.margin) return;

    this.decided = mean > 0 ? 1 : -1;
    if (!this.locked) this.applied = this.decided;
  }
}
