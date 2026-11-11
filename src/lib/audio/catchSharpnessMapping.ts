import type { CatchSharpnessInput, CatchSharpnessSettings } from './types';

export function catchLockTimeToPitchHz(
  input: CatchSharpnessInput,
  settings: CatchSharpnessSettings
): number {
  const { minLockTimeMs, maxLockTimeMs, minPitchHz, maxPitchHz } = settings;
  const t = Math.min(
    1,
    Math.max(0, (input.catchLockTimeMs - minLockTimeMs) / (maxLockTimeMs - minLockTimeMs))
  );
  return maxPitchHz + (minPitchHz - maxPitchHz) * (1 - t);
}
