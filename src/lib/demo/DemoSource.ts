import type { MotionData } from '../../hooks/useDeviceMotion';
import type { SyntheticGpsFix } from '../analysis/SyntheticRower';
import { DemoPacer, type DemoPacerOptions } from './DemoPacer';
import type { DemoScenario } from './scenarios';

export interface DemoListener {
  onMotion?: (sample: MotionData) => void;
  onGps?: (fix: SyntheticGpsFix) => void;
}

/** The clock and timer the source runs on; replaceable so tests need no real timers. */
export interface DemoScheduler {
  now(): number;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const browserScheduler: DemoScheduler = {
  now: () => performance.now(),
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
};

/** Half a sample period at the stream's 50 Hz: a due sample waits at most this long for a timer. */
const TICK_MS = 10;

/**
 * The one simulated boat behind demo mode. Every subscriber (motion, GPS)
 * reads the same synthetic rower stream, so demo acceleration, rotation and
 * GPS speed describe one trajectory on one clock.
 *
 * The stream starts with the first subscriber, stops with the last, and starts
 * afresh when a subscriber asks for a different scenario.
 */
export class DemoSource {
  private pacer: DemoPacer | null = null;
  private readonly listeners = new Set<DemoListener>();
  private timer: unknown = null;

  constructor(
    private readonly scheduler: DemoScheduler = browserScheduler,
    private readonly options: DemoPacerOptions = {},
  ) {}

  get scenario(): DemoScenario | null {
    return this.pacer ? this.pacer.scenario : null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  subscribe(scenario: DemoScenario, listener: DemoListener): () => void {
    const first = this.listeners.size === 0;
    if (!this.pacer) {
      this.pacer = new DemoPacer(scenario, this.options);
    } else if (first || scenario !== this.pacer.scenario) {
      this.pacer.restart(scenario);
    }
    this.listeners.add(listener);
    if (this.timer === null) {
      this.timer = this.scheduler.setInterval(() => this.tick(), TICK_MS);
    }

    return () => {
      if (!this.listeners.delete(listener)) return;
      if (this.listeners.size === 0 && this.timer !== null) {
        this.scheduler.clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Begin the current scenario again from its start (used when a recording starts). */
  restart(): void {
    this.pacer?.restart();
  }

  /** Deliver everything that is due now. Called by the timer; public for tests. */
  tick(): void {
    if (!this.pacer || this.listeners.size === 0) return;
    for (const event of this.pacer.tick(this.scheduler.now())) {
      for (const listener of [...this.listeners]) {
        if (!this.listeners.has(listener)) continue;
        if (event.kind === 'imu') listener.onMotion?.(event.sample);
        else listener.onGps?.(event.fix);
      }
    }
  }
}

export const demoSource = new DemoSource();
