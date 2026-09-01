/**
 * Biquad IIR filter (Direct Form II Transposed) and RBJ "audio EQ cookbook"
 * coefficient designers.
 *
 * This replaces the legacy `BandPassFilter`, which claimed to be a "Butterworth
 * 2nd order" band-pass but was actually a cascade of two leaky first-order
 * sections with a hard-coded 50 Hz assumption. A true biquad gives a
 * predictable, sample-rate-correct magnitude response (unity gain in the
 * pass-band, real roll-off outside it), which is essential once the effective
 * sample rate is measured rather than assumed.
 */

export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** A single second-order section, Direct Form II Transposed. */
export class Biquad {
  private c: BiquadCoeffs;
  private z1 = 0;
  private z2 = 0;

  constructor(coeffs: BiquadCoeffs) {
    this.c = coeffs;
  }

  setCoeffs(coeffs: BiquadCoeffs): void {
    this.c = coeffs;
  }

  process(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.c;
    const y = b0 * x + this.z1;
    this.z1 = b1 * x - a1 * y + this.z2;
    this.z2 = b2 * x - a2 * y;
    return y;
  }

  reset(): void {
    this.z1 = 0;
    this.z2 = 0;
  }
}

const TWO_PI = 2 * Math.PI;

/** Butterworth (Q = 1/√2) low-pass biquad via the RBJ cookbook. */
export function designLowpass(fc: number, fs: number, Q = Math.SQRT1_2): BiquadCoeffs {
  const w0 = (TWO_PI * fc) / fs;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * Q);
  const a0 = 1 + alpha;
  const b0 = ((1 - cos) / 2) / a0;
  const b1 = (1 - cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  return { b0, b1, b2, a1, a2 };
}

/** Butterworth (Q = 1/√2) high-pass biquad via the RBJ cookbook. */
export function designHighpass(fc: number, fs: number, Q = Math.SQRT1_2): BiquadCoeffs {
  const w0 = (TWO_PI * fc) / fs;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * Q);
  const a0 = 1 + alpha;
  const b0 = ((1 + cos) / 2) / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  return { b0, b1, b2, a1, a2 };
}

/**
 * Sample-rate-aware band-pass built as a Butterworth high-pass (removes DC /
 * slow drift and gravity-leakage) cascaded with a Butterworth low-pass (removes
 * stroke-band noise, splash, hull vibration).
 *
 * For rowing surge acceleration a pass-band of ~0.2–2.0 Hz (12–120 spm plus the
 * harmonics that shape the catch) preserves stroke morphology while rejecting
 * drift and jitter.
 */
export class ButterworthBandpass {
  private hp: Biquad;
  private lp: Biquad;
  private lowCut: number;
  private highCut: number;
  private fs: number;

  constructor(lowCut: number, highCut: number, fs: number) {
    this.lowCut = lowCut;
    this.highCut = highCut;
    this.fs = fs;
    this.hp = new Biquad(designHighpass(lowCut, fs));
    this.lp = new Biquad(designLowpass(highCut, fs));
  }

  /**
   * Re-tune the filter to a new sample rate (called once the measured rate is
   * stable). Cutoffs are clamped below Nyquist. Preserves running state so the
   * transient is small.
   */
  redesign(fs: number): void {
    if (fs <= 0 || Math.abs(fs - this.fs) / this.fs < 0.02) return;
    this.fs = fs;
    const nyquist = fs / 2;
    const low = Math.min(this.lowCut, nyquist * 0.9);
    const high = Math.min(this.highCut, nyquist * 0.9);
    this.hp.setCoeffs(designHighpass(low, fs));
    this.lp.setCoeffs(designLowpass(high, fs));
  }

  process(x: number): number {
    return this.lp.process(this.hp.process(x));
  }

  reset(): void {
    this.hp.reset();
    this.lp.reset();
  }
}
