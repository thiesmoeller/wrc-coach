import { describe, it, expect } from 'vitest';
import { DemoSource, type DemoScheduler } from '../DemoSource';
import { DEFAULT_DEMO_SCENARIO, DEMO_SCENARIOS, DEMO_SCENARIO_LABELS, isDemoScenario } from '../scenarios';
import { SCENARIOS, type SyntheticGpsFix } from '../../analysis/SyntheticRower';
import type { MotionData } from '../../../hooks/useDeviceMotion';

/** A clock the test moves by hand; the "timer" only fires when the test advances it. */
class FakeScheduler implements DemoScheduler {
  time = 1_000;
  private callback: (() => void) | null = null;
  private period = 0;
  private nextFire = 0;
  started = 0;
  cleared = 0;

  now(): number {
    return this.time;
  }
  setInterval(callback: () => void, ms: number): unknown {
    this.callback = callback;
    this.period = ms;
    this.nextFire = this.time + ms;
    this.started++;
    return this.started;
  }
  clearInterval(): void {
    this.callback = null;
    this.cleared++;
  }
  get active(): boolean {
    return this.callback !== null;
  }
  advance(ms: number): void {
    const end = this.time + ms;
    while (this.callback && this.nextFire <= end) {
      this.time = this.nextFire;
      this.nextFire += this.period;
      this.callback();
    }
    this.time = end;
  }
}

describe('DemoSource', () => {
  it('feeds motion and GPS subscribers from one stream on one clock', () => {
    const scheduler = new FakeScheduler();
    const source = new DemoSource(scheduler);
    const motion: MotionData[] = [];
    const fixes: SyntheticGpsFix[] = [];
    const order: string[] = [];

    source.subscribe('skiffSteady', { onMotion: (s) => { motion.push(s); order.push('imu'); } });
    source.subscribe('skiffSteady', { onGps: (f) => { fixes.push(f); order.push('gps'); } });
    scheduler.advance(10_000);

    expect(motion.length).toBe(10_000 / 20);
    expect(fixes.length).toBeGreaterThanOrEqual(9);
    expect(motion[0].t).toBe(1_010);
    for (const fix of fixes) {
      expect(fix.t).toBeGreaterThanOrEqual(motion[0].t);
      expect(fix.t).toBeLessThanOrEqual(scheduler.time);
    }
    for (let i = 1; i < fixes.length; i++) expect(fixes[i].t - fixes[i - 1].t).toBeCloseTo(1000, 6);
    expect(order.indexOf('gps')).toBeGreaterThan(0);
  });

  it('runs only while someone is subscribed', () => {
    const scheduler = new FakeScheduler();
    const source = new DemoSource(scheduler);
    expect(scheduler.active).toBe(false);

    const motion: MotionData[] = [];
    const stopMotion = source.subscribe('skiffSteady', { onMotion: (s) => motion.push(s) });
    const stopGps = source.subscribe('skiffSteady', { onGps: () => {} });
    expect(scheduler.started).toBe(1);
    expect(source.running).toBe(true);

    stopGps();
    expect(scheduler.active).toBe(true);
    stopMotion();
    stopMotion();
    expect(scheduler.active).toBe(false);
    expect(source.running).toBe(false);

    const count = motion.length;
    scheduler.advance(1_000);
    expect(motion.length).toBe(count);
  });

  it('a second subscriber with the same scenario joins the running stream', () => {
    const scheduler = new FakeScheduler();
    const source = new DemoSource(scheduler);
    const motion: MotionData[] = [];
    source.subscribe('startFromRest', { onMotion: (s) => motion.push(s) });
    scheduler.advance(30_000);

    const fixes: SyntheticGpsFix[] = [];
    source.subscribe('startFromRest', { onGps: (f) => fixes.push(f) });
    scheduler.advance(5_000);

    // Had the stream restarted, the boat would be back at rest.
    expect(fixes.length).toBeGreaterThanOrEqual(4);
    for (const fix of fixes) expect(fix.speed).toBeGreaterThan(2);
    for (let i = 1; i < motion.length; i++) expect(motion[i].t - motion[i - 1].t).toBeCloseTo(20, 6);
  });

  it('restarts the stream when the scenario changes', () => {
    const scheduler = new FakeScheduler();
    const source = new DemoSource(scheduler);
    const fixes: SyntheticGpsFix[] = [];

    let stop = source.subscribe('skiffSteady', { onGps: (f) => fixes.push(f) });
    scheduler.advance(20_000);
    expect(source.scenario).toBe('skiffSteady');
    const cruising = fixes[fixes.length - 1].speed;
    expect(cruising).toBeGreaterThan(3);

    // What the hooks do when the setting changes: unsubscribe, then subscribe with the new scenario.
    stop();
    fixes.length = 0;
    stop = source.subscribe('startFromRest', { onGps: (f) => fixes.push(f) });
    expect(source.scenario).toBe('startFromRest');
    scheduler.advance(1_500);
    expect(fixes.length).toBeGreaterThanOrEqual(1);
    expect(fixes[0].speed).toBeLessThan(0.5);
    stop();
  });

  it('restarts when demo mode is switched off and on again', () => {
    const scheduler = new FakeScheduler();
    const source = new DemoSource(scheduler);
    const first: MotionData[] = [];
    const stop = source.subscribe('skiffUnevenCatch', { onMotion: (s) => first.push(s) });
    scheduler.advance(2_000);
    stop();

    scheduler.advance(60_000);
    const second: MotionData[] = [];
    source.subscribe('skiffUnevenCatch', { onMotion: (s) => second.push(s) });
    scheduler.advance(2_000);

    expect(second.length).toBe(first.length);
    expect(second[0].t).toBeGreaterThan(first[first.length - 1].t);
    second.forEach((s, i) => {
      const { t: _t, ...values } = s;
      const { t: _t0, ...firstValues } = first[i];
      expect(values).toEqual(firstValues);
    });
  });

  it('restart() replays the scenario for current subscribers with increasing timestamps', () => {
    const scheduler = new FakeScheduler();
    const source = new DemoSource(scheduler);
    const fixes: SyntheticGpsFix[] = [];
    const motion: MotionData[] = [];
    source.subscribe('startFromRest', { onMotion: (s) => motion.push(s), onGps: (f) => fixes.push(f) });
    scheduler.advance(40_000);
    expect(fixes[fixes.length - 1].speed).toBeGreaterThan(3);

    fixes.length = 0;
    source.restart();
    scheduler.advance(1_500);
    expect(fixes[0].speed).toBeLessThan(0.5);
    for (let i = 1; i < motion.length; i++) expect(motion[i].t).toBeGreaterThan(motion[i - 1].t);
  });

  it('does not flood subscribers after the timer was suspended', () => {
    const scheduler = new FakeScheduler();
    const source = new DemoSource(scheduler, { maxCatchUpMs: 500 });
    const motion: MotionData[] = [];
    source.subscribe('skiffSteady', { onMotion: (s) => motion.push(s) });
    scheduler.advance(1_000);
    const before = motion.length;

    scheduler.time += 120_000;
    source.tick();
    expect(motion.length - before).toBe(500 / 20 + 1);
  });
});

describe('demo scenarios', () => {
  it('offers every synthetic scenario with a label', () => {
    expect([...DEMO_SCENARIOS].sort()).toEqual(Object.keys(SCENARIOS).sort());
    for (const key of DEMO_SCENARIOS) expect(DEMO_SCENARIO_LABELS[key].length).toBeGreaterThan(0);
    expect(DEMO_SCENARIOS).toContain(DEFAULT_DEMO_SCENARIO);
    expect(DEFAULT_DEMO_SCENARIO).toBe('skiffApproachWobble');
  });

  it('recognises scenario keys', () => {
    expect(isDemoScenario('crewCatchSpread')).toBe(true);
    expect(isDemoScenario('toString')).toBe(false);
    expect(isDemoScenario('nope')).toBe(false);
    expect(isDemoScenario(undefined)).toBe(false);
    expect(isDemoScenario(3)).toBe(false);
  });
});
