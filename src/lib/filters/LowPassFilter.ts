/**
 * Low-Pass Filter (exponential smoothing)
 * Reduces sensor noise while preserving signal
 * 
 * This is a simple first-order IIR filter that smooths noisy signals
 * using exponential weighted moving average.
 */
export class LowPassFilter {
  private alpha: number;  // Smoothing factor (0-1)
  private y: number | null;  // Current filtered value

  /**
   * Create a low-pass filter
   * @param alpha - Smoothing factor (0-1). Higher = more smoothing, more lag.
   *                Default 0.85 means 85% old value + 15% new value.
   */
  constructor(alpha: number = 0.85) {
    this.alpha = alpha;
    this.y = null;
  }
  
  /**
   * Process a single sample through the filter
   * @param x - Input sample
   * @returns Filtered output
   */
  process(x: number): number {
    if (this.y === null) {
      this.y = x;
    } else {
      this.y = this.alpha * this.y + (1 - this.alpha) * x;
    }
    return this.y;
  }
  
  /**
   * Reset filter to initial state
   */
  reset(): void {
    this.y = null;
  }
}

