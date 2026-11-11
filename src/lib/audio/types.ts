export type AudioCoachMode =
  | 'off'
  | 'balance'
  | 'catchReport'
  | 'spokenSummary'
  | 'catchSharpness'
  | 'accelerationSonification';

export type StrokePhase = 'drive' | 'recovery' | 'approach';

export type BalanceGate = 'always' | 'recovery' | 'approach';

export type AudioOutputState = 'locked' | 'running' | 'suspended' | 'unavailable';

export type WobbleLevel = 'steady' | 'some' | 'a lot';

export type CatchReportFadeMode = 'everyNth' | 'worseThanMedian';

export type CatchReportMonoSidePattern = 'left' | 'right' | 'neutral';

export interface BalanceToneSettings {
  deadBandDeg: number;
  hysteresisDeg: number;
  fullScaleLeanDeg: number;
  gate: BalanceGate;
  stereoPitchHz: number;
  monoPitchLeftHz: number;
  monoPitchRightHz: number;
  rampSec: number;
  updateThrottleSec: number;
}

export interface CatchReportSettings {
  leanTargetBandDeg: number;
  wobbleTargetBandDeg: number;
  wobbleThresholdSomeDeg: number;
  wobbleThresholdLotDeg: number;
  toneDurationMs: number;
  pitchSteadyHz: number;
  pitchSomeHz: number;
  pitchLotHz: number;
  fadeMode: CatchReportFadeMode;
  fullFeedbackStrokeCount: number;
  strokesPerFadeTier: number;
  maxEveryNth: number;
  medianWindowSize: number;
}

export interface SpokenSummarySettings {
  everyNStrokes: number;
  everyMetres: number;
  enabledStrokeInterval: boolean;
  enabledMetreInterval: boolean;
}

export interface CatchSharpnessSettings {
  minLockTimeMs: number;
  maxLockTimeMs: number;
  minPitchHz: number;
  maxPitchHz: number;
  toneDurationMs: number;
}

export interface AccelerationSonificationSettings {
  minAccelMs2: number;
  maxAccelMs2: number;
  minPitchHz: number;
  maxPitchHz: number;
  smoothingSec: number;
}

export interface AudioCoachSettings {
  masterVolume: number;
  monoOutput: boolean;
  latencyOffsetMs: number;
  timingSensitiveThresholdMs: number;
  balance: BalanceToneSettings;
  catchReport: CatchReportSettings;
  spokenSummary: SpokenSummarySettings;
  catchSharpness: CatchSharpnessSettings;
  acceleration: AccelerationSonificationSettings;
}

export interface BalanceLiveInput {
  rollDeg: number;
  phase: StrokePhase;
}

export interface CatchStrokeInput {
  leanDeg: number;
  approachWobbleDeg: number;
}

export interface SummaryBlockInput {
  strokeRateSpm: number | null;
  meanCatchLeanDeg: number | null;
  wobbleTrend: 'down' | 'up' | 'flat' | null;
}

export interface CatchSharpnessInput {
  catchLockTimeMs: number;
}

export interface AccelerationInput {
  surgeAccelMs2: number;
}

export interface BalanceToneDecision {
  audible: boolean;
  pan: number;
  pitchHz: number;
  gain: number;
  lowSide: 'left' | 'right' | null;
}

export interface CatchReportDecision {
  play: boolean;
  wobbleLevel: WobbleLevel;
  pitchHz: number;
  pan: number;
  monoSidePattern: CatchReportMonoSidePattern;
  leanSide: 'left' | 'right' | 'center';
}

export interface CatchReportFadeState {
  qualifyingOutOfBandCount: number;
  recentSeveritySamples: number[];
}
