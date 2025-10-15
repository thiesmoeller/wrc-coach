/**
 * Coordinate Transformations
 * 
 * Utilities for transforming sensor data between coordinate frames.
 */

export {
  transformToBoatFrame,
  multiplyQuaternions,
  quaternionFromAxisAngle,
  rotateVectorByQuaternion,
  type BoatAcceleration,
  type PhoneOrientation,
  type Quaternion,
  type Vector3,
} from './BoatTransform';

