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
