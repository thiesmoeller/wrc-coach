import { describe, it, expect } from 'vitest';
import { DemoPacer, type DemoEvent } from '../DemoPacer';
import { createSyntheticRowerStream, SCENARIOS, type SyntheticGpsFix } from '../../analysis/SyntheticRower';
import type { MotionData } from '../../../hooks/useDeviceMotion';

const DT = 20; // the scenarios run at 50 Hz

const imuOf = (events: DemoEvent[]): MotionData[] =>
  events.flatMap((e) => (e.kind === 'imu' ? [e.sample] : []));

/** Deterministic stand-in for a jittery timer: irregular tick times, none later than `maxStep` apart. */
function jitteryTicks(start: number, durationMs: number, maxStep: number, seed = 7): number[] {
  let state = seed;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const ticks: number[] = [];
  let t = start;
  while (t < start + durationMs) {
    ticks.push(t);
    t += 1 + rand() * (maxStep - 1);
  }
  ticks.push(start + durationMs);
  return ticks;
}

function run(pacer: DemoPacer, ticks: number[]): DemoEvent[] {
  const events: DemoEvent[] = [];
  for (const now of ticks) events.push(...pacer.tick(now));
  return events;
}

describe('DemoPacer', () => {
  it('stamps the first sample with the time of the first tick', () => {
    const pacer = new DemoPacer('skiffSteady');
    const events = pacer.tick(12_345.6);
    expect(imuOf(events)).toHaveLength(1);
    expect(imuOf(events)[0].t).toBe(12_345.6);
  });

  it('emits exactly the samples due for the elapsed time, however the ticks fall', () => {
    for (const maxStep of [4, 17, 33, 120]) {
      const pacer = new DemoPacer('skiffSteady');
      const start = 5_000.25;
      const imu = imuOf(run(pacer, jitteryTicks(start, 10_000, maxStep)));
      // Samples at start, start + 20, ..., start + 10 000.
      expect(imu).toHaveLength(10_000 / DT + 1);
    }
  });

  it('never emits a sample before it is due', () => {
    const pacer = new DemoPacer('skiffSteady');
    for (const now of jitteryTicks(1_000, 5_000, 45)) {
      for (const s of imuOf(pacer.tick(now))) expect(s.t).toBeLessThanOrEqual(now);
    }
  });

  it('emits nothing when no sample has become due', () => {
    const pacer = new DemoPacer('skiffSteady');
    expect(pacer.tick(1_000)).toHaveLength(1);
    expect(pacer.tick(1_000)).toHaveLength(0);
    expect(pacer.tick(1_019.9)).toHaveLength(0);
    expect(imuOf(pacer.tick(1_020))).toHaveLength(1);
    expect(pacer.tick(990)).toHaveLength(0);
  });

  it('keeps timestamps evenly spaced and increasing despite timer jitter', () => {
    const pacer = new DemoPacer('skiffApproachWobble');
    const start = 2_000;
    const imu = imuOf(run(pacer, jitteryTicks(start, 20_000, 90)));
    for (let i = 0; i < imu.length; i++) {
      expect(imu[i].t).toBeCloseTo(start + i * DT, 6);
    }
  });

  it('delivers the stream unaltered: values are those of the synthetic rower, only the clock is shifted', () => {
    const pacer = new DemoPacer('skiffUnevenCatch');
    const imu = imuOf(run(pacer, jitteryTicks(300, 4_000, 60)));
    const reference = createSyntheticRowerStream(SCENARIOS.skiffUnevenCatch);
    const first = reference.nextImu().sample;
    expect(imu[0]).toEqual({ ...first, t: 300 });
    for (let i = 1; i < imu.length; i++) {
      const ref = reference.nextImu().sample;
      expect(imu[i]).toEqual({ ...ref, t: 300 + (ref.t - first.t) });
    }
  });

  it('caps the catch-up after a long pause and resumes evenly spaced', () => {
    const pacer = new DemoPacer('skiffSteady', { maxCatchUpMs: 500 });
    const before = imuOf(run(pacer, jitteryTicks(1_000, 2_000, 25)));
    const lastBefore = before[before.length - 1].t;
    expect(lastBefore).toBe(3_000);

    // The tab was hidden for a minute.
    const resumeAt = 63_000;
    const burst = imuOf(pacer.tick(resumeAt));
    expect(burst).toHaveLength(500 / DT + 1);
    expect(burst[0].t).toBeCloseTo(resumeAt - 500, 6);
    expect(burst[burst.length - 1].t).toBeCloseTo(resumeAt, 6);
    for (let i = 1; i < burst.length; i++) {
      expect(burst[i].t - burst[i - 1].t).toBeCloseTo(DT, 6);
    }
    expect(burst[0].t).toBeGreaterThan(lastBefore);

    // Back to real time afterwards.
    const after = imuOf(run(pacer, jitteryTicks(resumeAt, 1_000, 25).slice(1)));
    expect(after).toHaveLength(1_000 / DT);
    expect(after[0].t).toBeCloseTo(resumeAt + DT, 6);
  });

  it('does not drop samples for a pause shorter than the cap', () => {
    const pacer = new DemoPacer('skiffSteady', { maxCatchUpMs: 500 });
    pacer.tick(0);
    const burst = imuOf(pacer.tick(400));
    expect(burst).toHaveLength(400 / DT);
    expect(burst[0].t).toBeCloseTo(DT, 6);
  });

  it('delivers GPS fixes from the same stream, in order, on the same clock', () => {
    const pacer = new DemoPacer('skiffSteady');
    const start = 40_000;
    const events = run(pacer, jitteryTicks(start, 30_000, 70));
    const gps = events.flatMap((e) => (e.kind === 'gps' ? [e.fix] : []));

    const reference = createSyntheticRowerStream(SCENARIOS.skiffSteady);
    const refGps: SyntheticGpsFix[] = [];
    let refStart = 0;
    for (let i = 0; i <= 30_000 / DT; i++) {
      const { sample } = reference.nextImu();
      if (i === 0) refStart = sample.t;
      refGps.push(...reference.takeGps());
    }
    expect(gps.length).toBe(refGps.length);
    expect(gps.length).toBeGreaterThanOrEqual(29);
    gps.forEach((fix, i) => {
      expect(fix).toEqual({ ...refGps[i], t: refGps[i].t - refStart + start });
    });

    // A fix arrives right after the IMU sample that reaches its time, never ahead of the IMU clock.
    let lastImuT = -Infinity;
    for (const e of events) {
      if (e.kind === 'imu') lastImuT = e.sample.t;
      else {
        expect(e.fix.t).toBeLessThanOrEqual(lastImuT);
        expect(lastImuT - e.fix.t).toBeLessThan(DT);
      }
    }
  });

  it('GPS speed agrees with the simulated boat (one trajectory behind IMU and GPS)', () => {
    const pacer = new DemoPacer('skiffSteady');
    const events = run(pacer, jitteryTicks(0, 60_000, 50));
    const speeds = events.flatMap((e) => (e.kind === 'gps' ? [e.fix.speed] : []));
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    expect(mean).toBeGreaterThan(SCENARIOS.skiffSteady.speedMps! - 0.3);
    expect(mean).toBeLessThan(SCENARIOS.skiffSteady.speedMps! + 0.3);
  });

  it('restarts the stream from its beginning on a scenario change', () => {
    const pacer = new DemoPacer('skiffSteady');
    run(pacer, jitteryTicks(0, 3_000, 30));
    expect(pacer.scenario).toBe('skiffSteady');

    pacer.restart('crewCatchSpread');
    expect(pacer.scenario).toBe('crewCatchSpread');
    const imu = imuOf(run(pacer, jitteryTicks(3_100, 1_000, 30)));

    const reference = createSyntheticRowerStream(SCENARIOS.crewCatchSpread);
    expect(imu[0].t).toBe(3_100);
    for (const sample of imu) {
      const { t: _t, ...values } = sample;
      const { t: _refT, ...refValues } = reference.nextImu().sample;
      expect(values).toEqual(refValues);
    }
  });

  it('restarting the same scenario replays it from the start', () => {
    const pacer = new DemoPacer('startFromRest');
    const firstRun = imuOf(run(pacer, jitteryTicks(0, 1_000, 30)));
    pacer.restart();
    const secondRun = imuOf(run(pacer, jitteryTicks(5_000, 1_000, 30)));
    expect(secondRun.length).toBe(firstRun.length);
    secondRun.forEach((s, i) => expect(s).toEqual({ ...firstRun[i], t: firstRun[i].t + 5_000 }));
  });

  it('keeps timestamps strictly increasing across a restart', () => {
    const pacer = new DemoPacer('skiffSteady');
    const before = imuOf(run(pacer, [100, 120, 140]));
    pacer.restart('turning');
    expect(pacer.tick(140)).toHaveLength(0);
    const after = imuOf(pacer.tick(141));
    expect(after).toHaveLength(1);
    expect(after[0].t).toBeGreaterThan(before[before.length - 1].t);
  });

  it('ignores a clock reading that is not a finite number', () => {
    const pacer = new DemoPacer('skiffSteady');
    expect(pacer.tick(NaN)).toHaveLength(0);
    expect(imuOf(pacer.tick(10))).toHaveLength(1);
  });
});
