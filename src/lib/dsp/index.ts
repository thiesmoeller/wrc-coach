/**
 * Low-level digital-signal-processing and orientation primitives shared by the
 * real-time app and offline analysis.
 */
export { SampleRateEstimator } from './SampleRateEstimator';
export { Biquad, ButterworthBandpass, designLowpass, designHighpass, type BiquadCoeffs } from './Biquad';
export { MadgwickAHRS } from './MadgwickAHRS';
export { HorizontalAxisEstimator, type Axis2D } from './HorizontalAxisEstimator';
export {
  type Quat,
  type Vec3,
  quatMultiply,
  quatConjugate,
  quatNormalize,
  rotateVector,
  sensorToEarth,
  earthToSensor,
} from './quaternion';
