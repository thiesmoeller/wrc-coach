/**
 * SampleRateEstimator
 *
 * Estimates the effective sample rate of an irregular, event-driven sensor
 * stream (e.g. the W3C `devicemotion` event, whose rate varies by device and
 * load) from sample timestamps.
 *
 * Why this matters: every frequency-domain algorithm downstream (band-pass
 * design, stroke-frequency reasoning, velocity integration) needs the *actual*
 * sampling interval. The legacy pipeline hard-coded 50 Hz, which silently
 * detunes the band-pass whenever the device delivers 60/100 Hz or throttles in
 * the background. We instead track the running median of inter-sample intervals
 * (robust to dropped frames and GC pauses, unlike a mean).
 */
export class SampleRateEstimator {
  private lastT: number | null = null;
  private readonly intervals: number[] = [];
  private readonly windowSize: number;
  private readonly minDtMs: number;
  private readonly maxDtMs: number;

  /**
   * @param windowSize   Number of recent intervals to keep for the median.
   * @param minDtMs       Intervals shorter than this (ms) are treated as noise
   *                      (duplicate timestamps) and ignored.
   * @param maxDtMs       Intervals longer than this (ms) are treated as gaps
   *                      (backgrounding, sensor stall) and ignored.
   */
  constructor(windowSize = 64, minDtMs = 1, maxDtMs = 500) {
    this.windowSize = Math.max(3, windowSize);
    this.minDtMs = minDtMs;
    this.maxDtMs = maxDtMs;
  }

  /**
   * Feed a new sample timestamp (ms). Returns the raw dt in seconds for this
   * step (clamped to a sane range), which callers can use directly for
   * integration. Use {@link getRate} / {@link getMedianDt} for the smoothed
   * estimate.
   */
  update(t: number): number {
    if (this.lastT === null) {
      this.lastT = t;
      return 0;
    }
    const dtMs = t - this.lastT;
    this.lastT = t;

    if (dtMs >= this.minDtMs && dtMs <= this.maxDtMs) {
      this.intervals.push(dtMs);
      if (this.intervals.length > this.windowSize) {
        this.intervals.shift();
      }
    }

    // Clamp the returned dt so a single gap cannot destabilise integrators.
    const clamped = Math.min(Math.max(dtMs, this.minDtMs), this.maxDtMs);
    return clamped / 1000;
  }

  /** True once enough intervals have been collected for a stable estimate. */
  isReady(minSamples = 5): boolean {
    return this.intervals.length >= minSamples;
  }

  /** Median inter-sample interval in milliseconds (0 if unknown). */
  getMedianDt(): number {
    if (this.intervals.length === 0) return 0;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Estimated sample rate in Hz. Falls back to {@link fallbackHz} until enough
   * data has been observed.
   */
  getRate(fallbackHz = 50): number {
    const medianDt = this.getMedianDt();
    if (medianDt <= 0) return fallbackHz;
    return 1000 / medianDt;
  }

  reset(): void {
    this.lastT = null;
    this.intervals.length = 0;
  }
}
