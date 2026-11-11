/**
 * High-level rowing-analysis layer: the shared pipeline that turns raw phone
 * IMU + GPS into stroke metrics, plus speed fusion and session aggregation.
 */
export { RowingPipeline, type ProcessedSample, type RowingPipelineOptions } from './RowingPipeline';
export { SpeedEstimator, type SpeedEstimatorOptions } from './SpeedEstimator';
export {
  summarizeSession,
  mean,
  std,
  median,
  coeffVar,
  rms,
  type SessionSummary,
} from './RowingMetrics';
export {
  generateSyntheticRow,
  createSyntheticRowerStream,
  createSurgeProfile,
  defaultDriveFraction,
  surgeShape,
  SCENARIOS,
  APPROACH_FRACTION,
  type SyntheticConfig,
  type ResolvedSyntheticConfig,
  type SyntheticData,
  type SyntheticTruth,
  type SyntheticTruthSample,
  type SyntheticImuFrame,
  type SyntheticGpsFix,
  type SyntheticRowerStream,
  type SurgeProfile,
  type TruthStroke,
} from './SyntheticRower';
export {
  runPipeline,
  validatePipeline,
  angleError,
  landmarkErrors,
  bowSign,
  type EvalWindow,
  type DetectedStroke,
  type PipelineInput,
  type PipelineTrace,
  type AngleErrorStats,
  type LandmarkStats,
  type LandmarkReport,
  type BowSignReport,
  type ValidationOptions,
  type ValidationReport,
} from './validation/pipelineValidation';
export {
  checkRecording,
  alignGpsClock,
  formatRecordingSummary,
  type RecordingSummary,
  type GpsClock,
  type AlignedGps,
} from './validation/recordingCheck';
