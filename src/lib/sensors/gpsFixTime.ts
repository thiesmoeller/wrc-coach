/** A fix older than this is stamped as if it were this old. */
export const MAX_GPS_FIX_AGE_MS = 10_000;

/**
 * Time of a GPS fix on the `performance.now()` clock the IMU samples use.
 *
 * The fix carries its own wall-clock time, so its age on arrival is known and
 * the fix can be placed where it was measured rather than where it was
 * delivered. The age is limited to 0..{@link MAX_GPS_FIX_AGE_MS}: a fix
 * "from the future" (wall clock behind GPS time) is stamped at arrival, and a
 * stale fix or a broken timestamp cannot land arbitrarily far in the past.
 *
 * @param fixEpochMs `GeolocationPosition.timestamp`
 * @param nowEpochMs `Date.now()` on arrival
 * @param nowPerfMs  `performance.now()` on arrival
 */
export function gpsFixTimeOnImuClock(fixEpochMs: number, nowEpochMs: number, nowPerfMs: number): number {
  const age = nowEpochMs - fixEpochMs;
  if (!Number.isFinite(age) || age <= 0) return nowPerfMs;
  return nowPerfMs - Math.min(age, MAX_GPS_FIX_AGE_MS);
}
