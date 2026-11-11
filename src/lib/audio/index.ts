export { AudioCoach } from './AudioCoach';
export type { AudioCoachDependencies } from './AudioCoach';
export { DEFAULT_AUDIO_COACH_SETTINGS, mergeAudioCoachSettings } from './settings';
export type { AudioCoachSettings } from './types';
export type {
  AccelerationInput,
  AudioCoachMode,
  AudioOutputState,
  BalanceGate,
  BalanceLiveInput,
  CatchReportFadeState,
  CatchReportMonoSidePattern,
  CatchSharpnessInput,
  CatchStrokeInput,
  StrokePhase,
  SummaryBlockInput,
  WobbleLevel,
} from './types';
export { AUDIO_MODE_LABELS } from './modeLabels';
export {
  computeBalanceTone,
  effectiveLeanWithHysteresis,
  balanceWouldBeAudible,
  continuousLeanMagnitude,
  leanToGain,
  phasePassesGate,
  rollToPan,
  rollToRowerLowSide,
} from './balanceMapping';
export {
  classifyWobble,
  computeCatchReportDecision,
  createCatchReportFadeState,
  everyNthAfterFullFeedback,
  isCatchInBand,
  shouldPlayCatchReport,
  shouldPlayEveryNthSchedule,
  simulateCatchReportPlayback,
  wobbleToPitchHz,
  leanToSide,
  leanToPan,
  leanToMonoSidePattern,
  severityScore,
} from './catchReportLogic';
export {
  buildSpokenSummary,
  createSummarySchedulerState,
  shouldSpeakSummary,
} from './summaryText';
export { catchLockTimeToPitchHz } from './catchSharpnessMapping';
export { surgeAccelToPitchHz } from './accelerationMapping';
export { estimateOutputLatencyMs, isTimingSensitiveReliable } from './latency';
export {
  SpeechQueue,
  defaultSpeechSynthesis,
  defaultUtteranceFactory,
} from './speechQueue';
export type { UtteranceFactory } from './speechQueue';
export { playOneShotTone } from './oneShotTone';
