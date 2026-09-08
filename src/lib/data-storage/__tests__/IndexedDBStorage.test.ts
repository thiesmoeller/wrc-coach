import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  IndexedDBStorage,
  resetIndexedDBStorageForTests,
} from '../IndexedDBStorage';
import { BinaryDataReader } from '../BinaryDataReader';

function imuSample(t: number) {
  return {
    type: 'imu' as const,
    t,
    ax: 1,
    ay: 0,
    az: 9.8,
    gx: 0.1,
    gy: 0,
    gz: 0,
    mx: 12,
    my: 3,
    mz: 1,
  };
}

async function deleteCoachDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('wrc_coach_db');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      // Connection still closing; success will fire afterward.
    };
  });
}

describe('IndexedDB chunked session export', () => {
  let storage: IndexedDBStorage;

  beforeEach(async () => {
    resetIndexedDBStorageForTests();
    await deleteCoachDb();
    storage = new IndexedDBStorage();
    await storage.init();
  });

  afterEach(() => {
    storage?.close();
    resetIndexedDBStorageForTests();
  });

  it('stores chunk size on metadata and exports a non-empty merged file', async () => {
    const sessionId = 'session_long_row';

    const chunk1: any[] = Array.from({ length: 200 }, (_, i) => imuSample(1000 + i * 10));
    const chunk2: any[] = Array.from({ length: 300 }, (_, i) => imuSample(4000 + i * 10));
    chunk2.push({
      type: 'gps' as const,
      t: 4010,
      lat: 53.5,
      lon: 10.0,
      speed: 2.5,
      heading: 80,
      accuracy: 4,
    });

    await storage.appendSessionChunk(sessionId, chunk1);
    await storage.appendSessionChunk(sessionId, chunk2);
    const metadata = await storage.updateSessionMetadata(sessionId, {
      sessionStartTime: 1000,
      duration: 2 * 60 * 60 * 1000,
      avgStrokeRate: 24,
      avgDrivePercent: 33,
      maxSpeed: 4.1,
      totalDistance: 12000,
      strokeCount: 2800,
      demoMode: false,
    });

    expect(metadata.dataSize).toBeGreaterThan(128);
    expect(metadata.sampleCount).toBe(501);

    const listed = await storage.getAllSessionMetadata();
    expect(listed[0].dataSize).toBeGreaterThan(128);
    expect(listed[0].dataSize).toBe(metadata.dataSize);

    const binary = await storage.getSessionBinary(sessionId);
    expect(binary).not.toBeNull();
    expect(binary!.byteLength).toBeGreaterThan(128);

    const decoded = new BinaryDataReader().decode(binary!);
    expect(decoded.imuSamples).toHaveLength(500);
    expect(decoded.gpsSamples).toHaveLength(1);
  });

  it('does not wipe exportable chunks when metadata is updated again', async () => {
    const sessionId = 'session_update_again';
    await storage.appendSessionChunk(sessionId, [imuSample(1), imuSample(2)]);
    await storage.updateSessionMetadata(sessionId, {
      sessionStartTime: 1,
      duration: 1000,
      avgStrokeRate: 20,
      avgDrivePercent: 30,
      maxSpeed: 1,
      totalDistance: 10,
      strokeCount: 1,
    });
    await storage.updateSessionMetadata(sessionId, {
      sessionStartTime: 1,
      duration: 2000,
      avgStrokeRate: 21,
      avgDrivePercent: 31,
      maxSpeed: 1.2,
      totalDistance: 20,
      strokeCount: 2,
    });

    const binary = await storage.getSessionBinary(sessionId);
    expect(binary).not.toBeNull();
    expect(binary!.byteLength).toBeGreaterThan(128);
  });

  it('repairs Size 0 listings from existing chunks and peeks format without a full merge', async () => {
    const sessionId = 'session_zero_size_listing';
    await storage.appendSessionChunk(
      sessionId,
      Array.from({ length: 40 }, (_, i) => imuSample(i * 10))
    );

    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('wrc_coach_db', 2);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('sessions', 'readwrite');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.objectStore('sessions').put({
          id: sessionId,
          timestamp: 1,
          sessionStartTime: 1,
          duration: 2 * 60 * 60 * 1000,
          avgStrokeRate: 22,
          avgDrivePercent: 30,
          maxSpeed: 3,
          totalDistance: 1000,
          strokeCount: 400,
          sampleCount: 0,
          dataSize: 0,
        });
      };
    });

    const listed = await storage.getAllSessionMetadata();
    expect(listed[0].dataSize).toBeGreaterThan(128);
    expect(listed[0].sampleCount).toBe(40);

    const version = await storage.getSessionFormatVersion(sessionId);
    expect(version).toBe(3);
  });

  it('merges many small chunks in chunkIndex order', async () => {
    const sessionId = 'session_many_chunks';
    const chunkCount = 40;
    const perChunk = 25;
    for (let c = 0; c < chunkCount; c++) {
      const samples = Array.from({ length: perChunk }, (_, i) =>
        imuSample(c * perChunk * 10 + i * 10)
      );
      await storage.appendSessionChunk(sessionId, samples);
    }

    const metadata = await storage.updateSessionMetadata(sessionId, {
      sessionStartTime: 0,
      duration: 10000,
      avgStrokeRate: 20,
      avgDrivePercent: 30,
      maxSpeed: 1,
      totalDistance: 10,
      strokeCount: 1,
    });
    expect(metadata.sampleCount).toBe(chunkCount * perChunk);

    const binary = await storage.getSessionBinary(sessionId);
    const decoded = new BinaryDataReader().decode(binary!);
    expect(decoded.imuSamples).toHaveLength(chunkCount * perChunk);
    expect(decoded.imuSamples[0].t).toBe(0);
    expect(decoded.imuSamples[decoded.imuSamples.length - 1].t).toBe(
      (chunkCount * perChunk - 1) * 10
    );
  });
});
