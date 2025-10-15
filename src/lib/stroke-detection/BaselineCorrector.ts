/**
 * Recovery window sample
 */
interface RecoverySample {
  t: number;
  v: number;
}

/**
 * Baseline Corrector
 * 
 * Tracks recovery phase acceleration to establish a baseline,
 * which is subtracted from all measurements to compensate for
 * environmental drag and drift.
 */
export class BaselineCorrector {
  private recoveryWindow: RecoverySample[];
  private readonly recoveryWindowMs: number;

  constructor(recoveryWindowMs: number = 3000) {
    this.recoveryWindow = [];
    this.recoveryWindowMs = recoveryWindowMs;
  }

  /**
   * Update baseline with a new sample
   * Should only be called during recovery phase
   */
  update(t: number, value: number, isInDrive: boolean): void {
    if (!isInDrive) {
      this.recoveryWindow.push({ t, v: value });
    }
    
    // Remove old samples
    while (
      this.recoveryWindow.length > 0 && 
      t - this.recoveryWindow[0].t > this.recoveryWindowMs
    ) {
      this.recoveryWindow.shift();
    }
  }

  /**
   * Get baseline-corrected value
   * @param value - Raw value
   * @returns Baseline-corrected value
   */
  correct(value: number): number {
    if (this.recoveryWindow.length < 10) {
      return value;
    }
    
    const avg = this.recoveryWindow.reduce((sum, p) => sum + p.v, 0) / this.recoveryWindow.length;
    return value - avg;
  }

  /**
   * Get current baseline value
   */
  getBaseline(): number {
    if (this.recoveryWindow.length === 0) {
      return 0;
    }
    return this.recoveryWindow.reduce((sum, p) => sum + p.v, 0) / this.recoveryWindow.length;
  }

  /**
   * Reset corrector
   */
  reset(): void {
    this.recoveryWindow = [];
  }
}

