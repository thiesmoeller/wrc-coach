import type { AudioCoachSettings } from './types';

export const DEFAULT_AUDIO_COACH_SETTINGS: AudioCoachSettings = {
  masterVolume: 0.7,
  monoOutput: false,
  latencyOffsetMs: 0,
  timingSensitiveThresholdMs: 80,
  balance: {
    deadBandDeg: 0.5,
    hysteresisDeg: 0.15,
    fullScaleLeanDeg: 3,
    gate: 'approach',
    stereoPitchHz: 880,
    monoPitchLeftHz: 620,
    monoPitchRightHz: 1240,
    rampSec: 0.03,
    updateThrottleSec: 0.05,
  },
  catchReport: {
    leanTargetBandDeg: 0.5,
    wobbleTargetBandDeg: 0.4,
    wobbleThresholdSomeDeg: 0.4,
    wobbleThresholdLotDeg: 1.0,
    toneDurationMs: 160,
    pitchSteadyHz: 660,
    pitchSomeHz: 990,
    pitchLotHz: 1320,
    fadeMode: 'everyNth',
    fullFeedbackStrokeCount: 20,
    strokesPerFadeTier: 15,
    maxEveryNth: 4,
    medianWindowSize: 10,
  },
  spokenSummary: {
    everyNStrokes: 20,
    everyMetres: 250,
    enabledStrokeInterval: true,
    enabledMetreInterval: false,
  },
  catchSharpness: {
    minLockTimeMs: 40,
    maxLockTimeMs: 200,
    minPitchHz: 1800,
    maxPitchHz: 700,
    toneDurationMs: 120,
  },
  acceleration: {
    minAccelMs2: -4,
    maxAccelMs2: 4,
    minPitchHz: 500,
    maxPitchHz: 1600,
    smoothingSec: 0.08,
  },
};

export function mergeAudioCoachSettings(
  base: AudioCoachSettings,
  partial: Partial<AudioCoachSettings>
): AudioCoachSettings {
  return {
    ...base,
    ...partial,
    balance: { ...base.balance, ...partial.balance },
    catchReport: { ...base.catchReport, ...partial.catchReport },
    spokenSummary: { ...base.spokenSummary, ...partial.spokenSummary },
    catchSharpness: { ...base.catchSharpness, ...partial.catchSharpness },
    acceleration: { ...base.acceleration, ...partial.acceleration },
  };
}
