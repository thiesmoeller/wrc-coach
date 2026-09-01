/**
 * Stroke Detection
 * 
 * Algorithms for detecting and analyzing rowing strokes.
 */

export {
  StrokeDetector,
  type StrokeThresholds,
  type StrokeInfo,
  type StrokeSample,
} from './StrokeDetector';

export { BaselineCorrector } from './BaselineCorrector';

export {
  AdaptiveStrokeDetector,
  type StrokeMetrics,
  type AdaptiveStrokeOptions,
} from './AdaptiveStrokeDetector';

