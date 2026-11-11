/**
 * Low-level digital-signal-processing and orientation primitives shared by the
 * real-time app and offline analysis.
 */
export { SampleRateEstimator } from './SampleRateEstimator';
export { Biquad, ButterworthBandpass, designLowpass, designHighpass, type BiquadCoeffs } from './Biquad';
export { GravityFilter, type GravityFilterOptions } from './GravityFilter';
export { BoatFrameEstimator, type BoatFrameOptions, type BowSignSource } from './BoatFrameEstimator';
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
