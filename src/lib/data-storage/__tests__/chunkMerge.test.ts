import { describe, it, expect } from 'vitest';
import { CircularBuffer } from '../CircularBuffer';
import { BinaryDataWriter, type IMUSample, type GPSSample } from '../BinaryDataWriter';
import { BinaryDataReader } from '../BinaryDataReader';

describe('CircularBuffer', () => {
  it('returns every item when the buffer is completely full', () => {
    const buf = new CircularBuffer<number>(4);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4);
    expect(buf.getSize()).toBe(4);
    expect(buf.getReadyItems()).toEqual([1, 2, 3, 4]);
    buf.push(5);
    expect(buf.getReadyItems()).toEqual([2, 3, 4, 5]);
  });
});

function imu(t: number, extra: Partial<IMUSample> = {}): IMUSample {
  return { t, ax: 1, ay: 2, az: 3, gx: 0.1, gy: 0.2, gz: 0.3, mx: 10, my: 20, mz: 30, ...extra };
}

function gps(t: number): GPSSample {
  return { t, lat: 53.5, lon: 10.0, speed: 3.2, heading: 90, accuracy: 5 };
}

describe('BinaryDataWriter.mergeChunks', () => {
  const writer = new BinaryDataWriter();
  const reader = new BinaryDataReader();

  it('concatenates IMU and GPS samples from multiple chunks without dropping data', () => {
    const chunk1 = writer.encode(
      [imu(1000), imu(1010)],
      [gps(1005)],
      { sessionStart: 1000, demoMode: false }
    );
    const chunk2 = writer.encode(
      [imu(2000), imu(2010), imu(2020)],
      [gps(2005), gps(2015)],
      { sessionStart: 1000, demoMode: false }
    );

    const merged = writer.mergeChunks([chunk1, chunk2], { sessionStart: 1000, demoMode: true });
    const decoded = reader.decode(merged);

    expect(decoded.imuSamples).toHaveLength(5);
    expect(decoded.gpsSamples).toHaveLength(3);
    expect(decoded.imuSamples.map((s) => s.t)).toEqual([1000, 1010, 2000, 2010, 2020]);
    expect(decoded.gpsSamples.map((s) => s.t)).toEqual([1005, 2005, 2015]);
    expect(decoded.metadata.demoMode).toBe(true);
    expect(decoded.imuSamples[0].mx).toBeCloseTo(10);
  });

  it('promotes V2 chunks into a V3 file when any chunk has magnetometer data', () => {
    const v2 = writer.encode(
      [{ t: 1, ax: 1, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 }],
      [],
      { sessionStart: 1 }
    );
    const v3 = writer.encode([imu(2)], [], { sessionStart: 1 });
    const merged = writer.mergeChunks([v2, v3], { sessionStart: 1 });
    const decoded = reader.decode(merged);
    expect(decoded.metadata.magic.startsWith('WRC_COACH_V3')).toBe(true);
    expect(decoded.imuSamples).toHaveLength(2);
  });
});
