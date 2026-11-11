import type { AccelerationInput, AccelerationSonificationSettings } from './types';

export function surgeAccelToPitchHz(
  input: AccelerationInput,
  settings: AccelerationSonificationSettings
): number {
  const { minAccelMs2, maxAccelMs2, minPitchHz, maxPitchHz } = settings;
  const span = maxAccelMs2 - minAccelMs2;
  if (span <= 0) return (minPitchHz + maxPitchHz) / 2;
  const t = Math.min(1, Math.max(0, (input.surgeAccelMs2 - minAccelMs2) / span));
  return minPitchHz + t * (maxPitchHz - minPitchHz);
}
