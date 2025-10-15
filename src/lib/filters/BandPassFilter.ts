/**
 * Band-Pass Filter (Butterworth 2nd order)
 * Isolates rowing stroke frequency (0.3-1.2 Hz = 18-72 SPM)
 * 
 * This filter removes both DC drift (high-pass) and high-frequency noise (low-pass),
 * leaving only the signal components that correspond to rowing strokes.
 */
export class BandPassFilter {
  // High-pass filter state
  private alpha_hp: number;
  private y_hp: number;
  private x_prev_hp: number;
  
  // Low-pass filter state
  private alpha_lp: number;
  private y_lp: number;

  /**
   * Create a band-pass filter
   * @param lowCut - Low cutoff frequency in Hz (removes DC drift)
   * @param highCut - High cutoff frequency in Hz (removes noise)
   * @param sampleRate - Sampling rate in Hz
   */
  constructor(lowCut: number, highCut: number, sampleRate: number) {
    // Create high-pass (removes DC drift)
    const wc_hp = (2 * Math.PI * lowCut) / sampleRate;
    this.alpha_hp = 1 / (1 + wc_hp);
    this.y_hp = 0;
    this.x_prev_hp = 0;
    
    // Create low-pass (removes high-frequency noise)
    const wc_lp = (2 * Math.PI * highCut) / sampleRate;
    this.alpha_lp = wc_lp / (1 + wc_lp);
    this.y_lp = 0;
  }
  
  /**
   * Process a single sample through the filter
   * @param x - Input sample
   * @returns Filtered output
   */
  process(x: number): number {
    // High-pass filter
    this.y_hp = this.alpha_hp * (this.y_hp + x - this.x_prev_hp);
    this.x_prev_hp = x;
    
    // Low-pass filter on high-pass output
    this.y_lp = this.alpha_lp * this.y_hp + (1 - this.alpha_lp) * this.y_lp;
    
    return this.y_lp;
  }
  
  /**
   * Reset filter to initial state
   */
  reset(): void {
    this.y_hp = 0;
    this.x_prev_hp = 0;
    this.y_lp = 0;
  }
}

