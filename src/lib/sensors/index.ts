/**
 * Hygiene at the boundary where sensor data enters the app: one accelerometer
 * sign convention and one clock for IMU and GPS.
 */
export {
  AccelSignDetector,
  upInDevice,
  isAppleMobile,
  type AccelSignDetectorOptions,
  type AccelSignSource,
  type DeviceVector,
  type NavigatorLike,
} from './AccelSignDetector';
export { gpsFixTimeOnImuClock, MAX_GPS_FIX_AGE_MS } from './gpsFixTime';
export { alignRecordingGps, type AlignedRecording } from './alignRecordingGps';
