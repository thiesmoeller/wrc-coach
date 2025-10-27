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

export {
  AdaptiveStrokeDetector,
  type StrokeSegment,
} from './AdaptiveStrokeDetector';

export {
  RealTimeAdaptiveStrokeDetector,
  type RealTimeStrokeInfo,
} from './RealTimeAdaptiveStrokeDetector';

export { BaselineCorrector } from './BaselineCorrector';

