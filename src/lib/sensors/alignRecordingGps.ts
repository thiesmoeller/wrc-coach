import { alignGpsClock, type GpsClock } from '../analysis/validation/recordingCheck';
import type { DecodedData } from '../data-storage/BinaryDataReader';

export interface AlignedRecording<T> {
  /** The input itself when nothing had to move, otherwise a copy with re-stamped GPS fixes. */
  recording: T;
  clock: GpsClock;
}

/**
 * Put a decoded recording's GPS fixes on its IMU clock, keeping every other
 * field. Older recordings stamped GPS in epoch ms and IMU in
 * `performance.now()` ms; newer ones share a clock and pass through untouched,
 * so this is safe to apply to any file (and more than once).
 */
export function alignRecordingGps<T extends DecodedData>(recording: T): AlignedRecording<T> {
  const aligned = alignGpsClock(recording);
  if (aligned.clock === 'shared' || aligned.clock === 'no-gps') {
    return { recording, clock: aligned.clock };
  }
  return {
    recording: {
      ...recording,
      gpsSamples: recording.gpsSamples.map((g, i) => ({ ...g, t: aligned.gps[i].t })),
    },
    clock: aligned.clock,
  };
}
