/**
 * InterruptionTracker
 *
 * Web sensor APIs (`devicemotion`, `deviceorientation`, `geolocation`) only
 * deliver events to a foregrounded, visible page. When the athlete locks the
 * screen or switches apps mid-session the browser suspends those events, so the
 * recording silently develops a gap.
 *
 * We can't keep sampling in the background from a PWA, but we CAN make the gaps
 * honest: this tracker records every period during which the page was hidden
 * while recording, so the UI can warn the athlete that data is missing and how
 * much. It is a plain, framework-agnostic class so the bookkeeping is trivial to
 * unit-test; the React hook `useBackgroundInterruptions` just feeds it
 * visibility events.
 */
export interface Interruption {
  /** Timestamp (ms) when the page became hidden. */
  hiddenAt: number;
  /** Timestamp (ms) when the page became visible again, or null if still hidden. */
  visibleAt: number | null;
  /** Duration of the gap in ms (0 while still open). */
  durationMs: number;
}

export class InterruptionTracker {
  private interruptions: Interruption[] = [];
  private openIndex: number | null = null;

  /** Begin an interruption. No-op if one is already open (dedupes repeats). */
  markHidden(t: number): void {
    if (this.openIndex !== null) return;
    this.interruptions.push({ hiddenAt: t, visibleAt: null, durationMs: 0 });
    this.openIndex = this.interruptions.length - 1;
  }

  /** Close the open interruption. No-op if none is open. */
  markVisible(t: number): void {
    if (this.openIndex === null) return;
    const it = this.interruptions[this.openIndex];
    it.visibleAt = t;
    it.durationMs = Math.max(0, t - it.hiddenAt);
    this.openIndex = null;
  }

  /** True while the page is currently in the background. */
  isHidden(): boolean {
    return this.openIndex !== null;
  }

  /** Number of interruptions recorded (including any currently open one). */
  getCount(): number {
    return this.interruptions.length;
  }

  /** Copy of all interruptions recorded so far. */
  getInterruptions(): Interruption[] {
    return this.interruptions.map((i) => ({ ...i }));
  }

  /**
   * Total time spent hidden (ms). Closed interruptions contribute their measured
   * duration; if one is still open and `now` is supplied, its elapsed time is
   * included so the display keeps counting up.
   */
  getTotalHiddenMs(now?: number): number {
    let total = 0;
    for (const i of this.interruptions) {
      if (i.visibleAt !== null) {
        total += i.durationMs;
      } else if (now !== undefined) {
        total += Math.max(0, now - i.hiddenAt);
      }
    }
    return total;
  }

  reset(): void {
    this.interruptions = [];
    this.openIndex = null;
  }
}
