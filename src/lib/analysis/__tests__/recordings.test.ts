import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BinaryDataReader } from '../../data-storage/BinaryDataReader';
import { checkRecording, formatRecordingSummary } from '../validation/recordingCheck';

/**
 * Sanity run of the pipeline over real on-water recordings.
 *
 * Drop exported `.wrcdata` sessions into `fixtures/recordings/` at the repo
 * root (that folder is exempt from the `*.wrcdata` gitignore rule). Only real
 * recordings belong there: synthetic sessions are covered by the acceptance
 * tests. With no files this reports one skipped test rather than passing.
 */
const RECORDINGS_DIR = resolve(__dirname, '../../../../fixtures/recordings');
const files = existsSync(RECORDINGS_DIR)
  ? readdirSync(RECORDINGS_DIR).filter((f) => f.toLowerCase().endsWith('.wrcdata')).sort()
  : [];

describe('real recordings (fixtures/recordings/*.wrcdata)', () => {
  if (files.length === 0) {
    it.skip('NOTHING CHECKED: no .wrcdata recordings in fixtures/recordings/', () => {});
    return;
  }

  for (const file of files) {
    it(`${file}: plausible sample rate, finite outputs, strokes at a rowing rate`, () => {
      const bytes = readFileSync(resolve(RECORDINGS_DIR, file));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const summary = checkRecording(new BinaryDataReader().decode(buffer));
      console.info(`[recording] ${formatRecordingSummary(file, summary)}`);

      expect(summary.imuCount).toBeGreaterThan(0);
      expect(summary.sampleRateHz).toBeGreaterThanOrEqual(20);
      expect(summary.sampleRateHz).toBeLessThanOrEqual(250);
      expect(summary.finiteOutputs).toBe(true);
      if (summary.gpsCount > 0) {
        expect(summary.gpsDelivered).toBeGreaterThan(0);
      }
      if (summary.durationS > 60) {
        expect(summary.strokeCount).toBeGreaterThan(1);
        expect(summary.medianStrokeRate).toBeGreaterThanOrEqual(10);
        expect(summary.medianStrokeRate).toBeLessThanOrEqual(50);
      }
    });
  }
});
