/**
 * IMU sensor sample
 */
export interface IMUSample {
  t: number;    // timestamp (ms)
  ax: number;   // acceleration x (m/s²)
  ay: number;   // acceleration y (m/s²) - fore-aft
  az: number;   // acceleration z (m/s²)
  gx: number;   // gyro x (deg/s)
  gy: number;   // gyro y (deg/s)
  gz: number;   // gyro z (deg/s)
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
 * Calibration data
 */
export interface CalibrationData {
  pitchOffset: number;
  rollOffset: number;
  yawOffset: number;
  lateralOffset: number;
  gravityMagnitude: number;
  samples: number;
  variance: number;
  timestamp: number;
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
  calibration?: CalibrationData | null;
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
