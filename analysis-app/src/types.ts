/**
 * IMU sensor sample
 * Note: V3 files may include mx/my/mz fields which can contain:
 *   - Magnetometer data (µT) for older files
 *   - Orientation data (degrees) for newer files:
 *     - mx = alpha (compass heading 0-360°)
 *     - my = beta (front-back tilt)
 *     - mz = gamma (left-right tilt)
 */
export interface IMUSample {
  t: number;    // timestamp (ms)
  ax: number;   // acceleration x (m/s²)
  ay: number;   // acceleration y (m/s²) - fore-aft
  az: number;   // acceleration z (m/s²)
  gx: number;   // gyro x (deg/s)
  gy: number;   // gyro y (deg/s)
  gz: number;   // gyro z (deg/s)
  mx?: number;  // Magnetometer X (µT) OR Orientation Alpha (compass heading 0-360°) - V3 only
  my?: number;  // Magnetometer Y (µT) OR Orientation Beta (front-back tilt) - V3 only
  mz?: number;  // Magnetometer Z (µT) OR Orientation Gamma (left-right tilt) - V3 only
}

/**
 * GPS sample
 */
export interface GPSSample {
  t: number;        // timestamp (ms)
  lat: number;      // latitude (degrees)
  lon: number;      // longitude (degrees)
  speed: number;    // speed (m/s)
  heading: number;  // heading (degrees)
  accuracy: number; // accuracy (meters)
}

/**
 * Stroke information (matches PWA StrokeInfo)
 */
export interface StrokeInfo {
  catchTime: number;
  finishTime: number;
  driveTime: number;
  recoveryTime: number;
  strokeRate: number;
  drivePercent: number;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  magic: string;
  version: number;
  imuCount: number;
  gpsCount: number;
  sessionStart: number;
  phoneOrientation: 'rower' | 'coxswain';
  demoMode: boolean;
  catchThreshold: number;
  finishThreshold: number;
}

/**
 * Complete session data
 */
export interface SessionData {
  metadata: SessionMetadata;
  imuSamples: IMUSample[];
  gpsSamples: GPSSample[];
}

/**
 * Processed analysis results
 */
export interface AnalysisResults {
  timeVector: number[];         // time in seconds
  rawAcceleration: number[];    // raw ay
  filteredAcceleration: number[]; // filtered ay
  catches: number[];            // catch timestamps
  finishes: number[];           // finish timestamps
  strokes: StrokeInfo[];        // stroke info
  avgStrokeRate: number;
  avgDrivePercent: number;
  totalStrokes: number;
}
