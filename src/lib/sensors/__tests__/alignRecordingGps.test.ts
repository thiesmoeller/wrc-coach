import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { alignRecordingGps } from '../alignRecordingGps';
import { generateSyntheticRow, SCENARIOS } from '../../analysis/SyntheticRower';
import { BinaryDataWriter } from '../../data-storage/BinaryDataWriter';
import { BinaryDataReader, type DecodedData } from '../../data-storage/BinaryDataReader';

const SESSION_START = 1_762_862_400_000;

/** How the offline consumers hand GPS to the pipeline: a fix is used once the IMU clock reaches its time. */
function fixesReachedByImu(recording: DecodedData): number {
  let used = 0;
  for (const s of recording.imuSamples) {
    while (used < recording.gpsSamples.length && recording.gpsSamples[used].t <= s.t) used++;
  }
  return used;
}

/** Encode a 40 s synthetic row as a `.wrcdata` buffer and decode it again. */
function recordedFile(gpsClock: 'epoch' | 'imu', sessionStart = SESSION_START): { decoded: DecodedData; truthGpsT: number[] } {
  const row = generateSyntheticRow({ ...SCENARIOS.skiffSteady, durationS: 40 });
  const imuStart = row.imu[0].t;
  const gps = row.gps.map((g) => ({
    ...g,
    t: gpsClock === 'epoch' ? SESSION_START + (g.t - imuStart) : g.t,
  }));
  const buffer = new BinaryDataWriter().encode(row.imu, gps, { sessionStart });
  return { decoded: new BinaryDataReader().decode(buffer), truthGpsT: row.gps.map((g) => g.t) };
}

describe('alignRecordingGps', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('a legacy recording (GPS in epoch ms, IMU in performance.now ms) has no usable GPS until aligned', () => {
    const { decoded, truthGpsT } = recordedFile('epoch');
    expect(decoded.gpsSamples.length).toBeGreaterThan(30);
    expect(fixesReachedByImu(decoded)).toBe(0);

    const { recording, clock } = alignRecordingGps(decoded);
    expect(clock).toBe('session-start');
    expect(fixesReachedByImu(recording)).toBe(decoded.gpsSamples.length);
    recording.gpsSamples.forEach((g, i) => {
      expect(g.t).toBeCloseTo(truthGpsT[i], 6);
    });
  });

  it('keeps position, speed, heading and accuracy and does not modify its input', () => {
    const { decoded } = recordedFile('epoch');
    const before = decoded.gpsSamples.map((g) => ({ ...g }));
    const { recording } = alignRecordingGps(decoded);

    expect(decoded.gpsSamples).toEqual(before);
    expect(recording.imuSamples).toBe(decoded.imuSamples);
    expect(recording.metadata).toBe(decoded.metadata);
    recording.gpsSamples.forEach((g, i) => {
      const { t: _t, ...rest } = g;
      const { t: _t0, ...original } = before[i];
      expect(rest).toEqual(original);
    });
  });

  it('passes a recording that already shares one clock through untouched', () => {
    const { decoded } = recordedFile('imu');
    const { recording, clock } = alignRecordingGps(decoded);
    expect(clock).toBe('shared');
    expect(recording).toBe(decoded);
    expect(fixesReachedByImu(recording)).toBe(decoded.gpsSamples.length);
  });

  it('is idempotent', () => {
    const { decoded } = recordedFile('epoch');
    const once = alignRecordingGps(decoded);
    const twice = alignRecordingGps(once.recording);
    expect(twice.clock).toBe('shared');
    expect(twice.recording).toBe(once.recording);
  });

  it('falls back to the first fix when the session-start header is unusable', () => {
    const { decoded } = recordedFile('epoch', SESSION_START - 86_400_000);
    const { recording, clock } = alignRecordingGps(decoded);
    expect(clock).toBe('first-sample');
    expect(recording.gpsSamples[0].t).toBe(decoded.imuSamples[0].t);
    expect(fixesReachedByImu(recording)).toBe(decoded.gpsSamples.length);
  });

  it('reports a recording without GPS', () => {
    const { decoded } = recordedFile('imu');
    const noGps = { ...decoded, gpsSamples: [] };
    const { recording, clock } = alignRecordingGps(noGps);
    expect(clock).toBe('no-gps');
    expect(recording).toBe(noGps);
  });
});
