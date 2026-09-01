/**
 * HorizontalAxisEstimator
 *
 * Once gravity has been removed (via the AHRS) the boat's motion lives almost
 * entirely on one horizontal axis: the fore–aft "surge" line. But the phone's
 * heading (yaw) around vertical is unknown and arbitrary — the legacy pipeline
 * simply assumed the phone's Y axis was fore–aft, which only holds if the phone
 * is mounted perfectly square to the boat.
 *
 * This estimator recovers the fore–aft direction automatically via streaming
 * principal-component analysis of the horizontal linear-acceleration vector:
 * the eigenvector of the 2×2 covariance with the largest variance is the surge
 * axis. PCA is sign-agnostic, so we resolve fore vs. aft using the skewness of
 * the projection — a rowing drive is a short, sharp positive spike followed by a
 * long gentle recovery, i.e. strongly positively skewed toward "bow".
 *
 * The result is a data-driven boat frame that tolerates any yaw mounting and
 * even a phone that shifts slightly during a session.
 */
export interface Axis2D {
  x: number;
  y: number;
}

export class HorizontalAxisEstimator {
  private mx = 0;
  private my = 0;
  private cxx = 0;
  private cyy = 0;
  private cxy = 0;
  private skew = 0; // EMA of projection^3 (sign resolution)
  private samples = 0;
  private readonly tau: number;
  private forward: Axis2D = { x: 1, y: 0 };

  /**
   * @param tauSeconds Time constant of the exponential window. Long enough to
   *                   span several strokes (default 8 s) so the estimate is
   *                   stable but can still adapt if the mounting changes.
   */
  constructor(tauSeconds = 8) {
    this.tau = tauSeconds;
  }

  /**
   * Feed one horizontal linear-acceleration sample (earth frame X/Y) with the
   * time step dt (seconds). Returns nothing; query via {@link getForward}.
   */
  update(ax: number, ay: number, dt: number): void {
    const alpha = dt > 0 ? 1 - Math.exp(-dt / this.tau) : 0.02;
    this.samples++;

    // EMA mean.
    this.mx += alpha * (ax - this.mx);
    this.my += alpha * (ay - this.my);

    // EMA covariance of the centred vector.
    const dx = ax - this.mx;
    const dy = ay - this.my;
    this.cxx += alpha * (dx * dx - this.cxx);
    this.cyy += alpha * (dy * dy - this.cyy);
    this.cxy += alpha * (dx * dy - this.cxy);

    // Principal eigenvector of [[cxx,cxy],[cxy,cyy]] (largest variance).
    const tr = this.cxx + this.cyy;
    const det = this.cxx * this.cyy - this.cxy * this.cxy;
    const disc = Math.max(0, (tr * tr) / 4 - det);
    const l1 = tr / 2 + Math.sqrt(disc);

    let fx: number;
    let fy: number;
    if (Math.abs(this.cxy) > 1e-9) {
      fx = this.cxy;
      fy = l1 - this.cxx;
    } else {
      // Diagonal covariance: pick the larger-variance axis.
      if (this.cxx >= this.cyy) {
        fx = 1;
        fy = 0;
      } else {
        fx = 0;
        fy = 1;
      }
    }
    const n = Math.hypot(fx, fy) || 1;
    fx /= n;
    fy /= n;

    // Keep orientation continuous (avoid 180° eigenvector flips frame-to-frame).
    if (fx * this.forward.x + fy * this.forward.y < 0) {
      fx = -fx;
      fy = -fy;
    }

    // Sign resolution via skewness of the projection onto the current axis.
    const proj = dx * fx + dy * fy;
    this.skew += alpha * (proj * proj * proj - this.skew);
    if (this.skew < 0) {
      fx = -fx;
      fy = -fy;
      this.skew = -this.skew;
    }

    this.forward = { x: fx, y: fy };
  }

  /** True once the covariance has enough energy to trust the axis. */
  isReady(minSamples = 40): boolean {
    return this.samples >= minSamples && this.cxx + this.cyy > 1e-4;
  }

  /** Unit fore–aft ("surge", +bow) axis in the earth horizontal plane. */
  getForward(): Axis2D {
    return { ...this.forward };
  }

  /** Unit port–starboard ("sway", +starboard) axis (forward rotated −90°). */
  getStarboard(): Axis2D {
    // starboard = forward × up, with up = +Z: (fy, -fx).
    return { x: this.forward.y, y: -this.forward.x };
  }

  reset(): void {
    this.mx = this.my = 0;
    this.cxx = this.cyy = this.cxy = 0;
    this.skew = 0;
    this.samples = 0;
    this.forward = { x: 1, y: 0 };
  }
}
