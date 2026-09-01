/**
 * Minimal quaternion / 3-vector helpers used by the orientation and boat-frame
 * math. Quaternions are stored as (w, x, y, z).
 *
 * Convention used throughout the analysis layer: a quaternion `q` represents the
 * rotation that maps a vector expressed in the **sensor** frame to the **earth**
 * frame (Z up, opposite gravity). `rotateVector(q, v)` applies that active
 * rotation.
 */
export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function quatConjugate(q: Quat): Quat {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
}

/** Active rotation of vector `v` by quaternion `q`: v' = q · v · q*. */
export function rotateVector(q: Quat, v: Vec3): Vec3 {
  const qv: Quat = { w: 0, x: v.x, y: v.y, z: v.z };
  const r = quatMultiply(quatMultiply(q, qv), quatConjugate(q));
  return { x: r.x, y: r.y, z: r.z };
}

/** Map a sensor-frame vector into the earth frame. */
export function sensorToEarth(q: Quat, v: Vec3): Vec3 {
  return rotateVector(q, v);
}

/** Map an earth-frame vector into the sensor frame. */
export function earthToSensor(q: Quat, v: Vec3): Vec3 {
  return rotateVector(quatConjugate(q), v);
}
