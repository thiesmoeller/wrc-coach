import type { AudioCoachMode } from './types';

export const AUDIO_MODE_LABELS: Record<AudioCoachMode, string> = {
  off: 'Off',
  balance: 'Balance tone',
  catchReport: 'Catch report',
  spokenSummary: 'Spoken summary',
  catchSharpness: 'Catch sharpness',
  accelerationSonification: 'Boat rhythm tone',
};
