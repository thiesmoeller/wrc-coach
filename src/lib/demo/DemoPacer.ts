import type { MotionData } from '../../hooks/useDeviceMotion';
import {
  createSyntheticRowerStream,
  SCENARIOS,
  type SyntheticGpsFix,
  type SyntheticRowerStream,
} from '../analysis/SyntheticRower';
import { DEFAULT_DEMO_SCENARIO, type DemoScenario } from './scenarios';

export type DemoEvent =
  | { kind: 'imu'; sample: MotionData }
  | { kind: 'gps'; fix: SyntheticGpsFix };

export interface DemoPacerOptions {
  /**
   * Longest stretch of signal one tick may deliver (ms). After a longer pause
   * (hidden tab, suspended timers) the stream resumes this far behind the
   * clock, leaving a gap in the timestamps instead of a burst of samples.
   */
  maxCatchUpMs?: number;
}

const DEFAULT_MAX_CATCH_UP_MS = 500;

/**
 * Plays a synthetic rower stream in real time against a caller-supplied clock.
 *
 * Browser timers are jittery and throttled, so samples are not stamped with
 * the time a timer happened to fire. Each tick delivers every sample that has
 * become due, stamped with the stream's own evenly spaced times shifted onto
 * the caller's clock. GPS fixes come from the same stream, in order between
 * the IMU samples, on the same clock.
 */
export class DemoPacer {
  private readonly maxCatchUpMs: number;
  private currentScenario: DemoScenario;
  private stream: SyntheticRowerStream;
  /** Caller-clock time of the stream's first sample; null until the first tick after a (re)start. */
  private origin: number | null = null;
  private firstStreamT = 0;
  private emitted = 0;
  private lastT = -Infinity;

  constructor(scenario: DemoScenario = DEFAULT_DEMO_SCENARIO, options: DemoPacerOptions = {}) {
    this.maxCatchUpMs = Math.max(0, options.maxCatchUpMs ?? DEFAULT_MAX_CATCH_UP_MS);
    this.currentScenario = scenario;
    this.stream = createSyntheticRowerStream(SCENARIOS[scenario]);
  }

  get scenario(): DemoScenario {
    return this.currentScenario;
  }

  get sampleIntervalMs(): number {
    return 1000 / this.stream.config.rateHz;
  }

  /** Begin a fresh stream; its first sample is stamped with the time of the next tick. */
  restart(scenario: DemoScenario = this.currentScenario): void {
    this.currentScenario = scenario;
    this.stream = createSyntheticRowerStream(SCENARIOS[scenario]);
    this.origin = null;
    this.emitted = 0;
  }

  /** Everything that has become due up to `nowMs`, oldest first. */
  tick(nowMs: number): DemoEvent[] {
    const events: DemoEvent[] = [];
    if (!Number.isFinite(nowMs)) return events;

    if (this.origin === null) {
      // Timestamps stay strictly increasing across a restart.
      if (nowMs <= this.lastT) return events;
      const frame = this.stream.nextImu();
      this.firstStreamT = frame.sample.t;
      this.origin = nowMs;
      this.emitted = 1;
      this.push(events, frame.sample);
      return events;
    }

    const behind = nowMs - this.toClock(this.nextStreamT());
    if (behind > this.maxCatchUpMs) this.origin += behind - this.maxCatchUpMs;

    while (this.toClock(this.nextStreamT()) <= nowMs) {
      this.emitted++;
      this.push(events, this.stream.nextImu().sample);
    }
    return events;
  }

  private nextStreamT(): number {
    return this.firstStreamT + this.emitted * this.sampleIntervalMs;
  }

  /** Subtracting the stream's start first keeps the mapping exact: the first sample lands on the tick time itself. */
  private toClock(streamT: number): number {
    return (this.origin as number) + (streamT - this.firstStreamT);
  }

  private push(events: DemoEvent[], sample: MotionData): void {
    this.lastT = this.toClock(sample.t);
    events.push({ kind: 'imu', sample: { ...sample, t: this.lastT } });
    for (const fix of this.stream.takeGps()) {
      events.push({ kind: 'gps', fix: { ...fix, t: this.toClock(fix.t) } });
    }
  }
}
