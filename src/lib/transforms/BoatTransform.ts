import type { Orientation } from '../filters';

/**
 * Acceleration in boat reference frame
 */
export interface BoatAcceleration {
  surge: number;  // Fore-aft acceleration (m/s²), positive = forward
  sway: number;   // Lateral acceleration (m/s²), positive = starboard
  heave: number;  // Vertical acceleration (m/s²), positive = up
}

/**
 * Phone orientation mode
 */
export type PhoneOrientation = 'rower' | 'coxswain';

/**
 * Transform phone acceleration to boat reference frame
 * Handles both rower and coxswain phone orientations
 * 
 * Phone frame (typical): screen up, top toward bow
 * - ax: left (-) to right (+)
 * - ay: stern (-) to bow (+)
 * - az: down (-) to up (+)
 * 
 * Boat frame:
 * - surge: stern (-) to bow (+)
 * - sway: port (-) to starboard (+)
 * - heave: down (-) to up (+)
 * 
 * @param ax - Phone X acceleration (m/s²)
 * @param ay - Phone Y acceleration (m/s²)
 * @param az - Phone Z acceleration (m/s²)
 * @param orientation - Current orientation (pitch, roll, yaw)
 * @param phoneOrientation - Phone mounting mode ('rower' or 'coxswain')
 * @returns Acceleration in boat frame
 */
export function transformToBoatFrame(
  ax: number,
  ay: number,
  az: number,
  orientation: Orientation,
  phoneOrientation: PhoneOrientation
): BoatAcceleration {
  // Remove gravity component using orientation
  const pitch = (orientation.pitch * Math.PI) / 180;
  const roll = (orientation.roll * Math.PI) / 180;
  
  const g = 9.81;
  const gx = g * Math.sin(roll);
  const gy = -g * Math.sin(pitch) * Math.cos(roll);
  const gz = g * Math.cos(pitch) * Math.cos(roll);
  
  // Gravity-compensated acceleration
  const ax_clean = ax - gx;
  const ay_clean = ay - gy;
  const az_clean = az - gz;
  
  // Map to boat frame based on orientation mode
  let surge: number;
  let sway: number;
  let heave: number;
  
  if (phoneOrientation === 'coxswain') {
    // Coxswain: phone facing forward (bow)
    // Phone Y-axis aligns with boat surge
    surge = ay_clean;
    sway = ax_clean;
    heave = az_clean;
  } else {
    // Rower: phone facing backward (stern)
    // Phone Y-axis is opposite to boat surge (need to flip)
    surge = -ay_clean; // FLIP for rower
    sway = -ax_clean;  // FLIP for rower (maintains port/starboard)
    heave = az_clean;
  }
  
  return { surge, sway, heave };
}

/**
 * Quaternion for 3D rotations
 */
export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

/**
 * 3D Vector
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Multiply two quaternions
 */
export function multiplyQuaternions(q1: Quaternion, q2: Quaternion): Quaternion {
  return {
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
  };
}

/**
 * Create quaternion from axis-angle representation
 */
export function quaternionFromAxisAngle(axis: Vector3, angle: number): Quaternion {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  return {
    w: Math.cos(halfAngle),
    x: axis.x * s,
    y: axis.y * s,
    z: axis.z * s,
  };
}

/**
 * Rotate a vector by a quaternion
 */
export function rotateVectorByQuaternion(q: Quaternion, v: Vector3): Vector3 {
  const qv: Quaternion = { w: 0, x: v.x, y: v.y, z: v.z };
  const qConj: Quaternion = { w: q.w, x: -q.x, y: -q.y, z: -q.z };
  const result = multiplyQuaternions(multiplyQuaternions(q, qv), qConj);
  return { x: result.x, y: result.y, z: result.z };
}

