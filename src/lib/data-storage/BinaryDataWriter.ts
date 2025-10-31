/**
 * IMU Sample data structure
 */
export interface IMUSample {
  t: number;    // Timestamp (ms)
  ax: number;   // Acceleration X (m/s²)
  ay: number;   // Acceleration Y (m/s²)
  az: number;   // Acceleration Z (m/s²)
  gx: number;   // Gyroscope X (deg/s)
  gy: number;   // Gyroscope Y (deg/s)
  gz: number;   // Gyroscope Z (deg/s)
  mx?: number;  // Magnetometer X (µT) or Orientation Alpha (compass heading 0-360°) - V3 only
  my?: number;  // Magnetometer Y (µT) or Orientation Beta (front-back tilt) - V3 only
  mz?: number;  // Magnetometer Z (µT) or Orientation Gamma (left-right tilt) - V3 only
}

/**
 * GPS Sample data structure
 */
export interface GPSSample {
  t: number;         // Timestamp (ms)
  lat: number;       // Latitude (degrees)
  lon: number;       // Longitude (degrees)
  speed: number;     // Speed (m/s)
  heading: number;   // Heading (degrees)
  accuracy: number;  // Accuracy (m)
}

/**
 * Calibration data structure
 */
export interface CalibrationData {
  pitchOffset: number;      // Pitch offset (degrees)
  rollOffset: number;       // Roll offset (degrees)
  yawOffset: number;        // Yaw offset (degrees)
  lateralOffset: number;    // Lateral offset (meters)
  gravityMagnitude: number; // Measured gravity (m/s²)
  samples: number;          // Number of samples used
  variance: number;         // Sample variance (quality metric)
  timestamp: number;        // Calibration timestamp (ms)
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  sessionStart?: number;
  phoneOrientation?: 'rower' | 'coxswain';
  demoMode?: boolean;
  catchThreshold?: number;
  finishThreshold?: number;
  calibration?: CalibrationData | null;
  calibrationSamples?: IMUSample[];
}

/**
 * Binary Writer for IMU/GPS data
 * Creates compact .wrcdata files for efficient storage and reprocessing
 */
export class BinaryDataWriter {
  private readonly MAGIC_V3 = 'WRC_COACH_V3\0\0\0\0\0'; // 16 bytes (V3 includes magnetometer)
  private readonly MAGIC_V2 = 'WRC_COACH_V2\0\0\0\0\0'; // 16 bytes (V2 includes calibration)
  private readonly HEADER_SIZE = 128; // Expanded for calibration data
  private readonly IMU_SAMPLE_SIZE_V2 = 32; // V2: no magnetometer
  private readonly IMU_SAMPLE_SIZE_V3 = 44; // V3: with magnetometer (32 + 12)
  private readonly GPS_SAMPLE_SIZE = 36;
  private readonly CALIBRATION_SIZE = 64;

  /**
   * Encode samples to binary format
   * Uses V3 format if magnetometer data is present, otherwise V2
   */
  encode(imuSamples: IMUSample[], gpsSamples: GPSSample[], metadata: SessionMetadata = {}): ArrayBuffer {
    const imuCount = imuSamples.length;
    const gpsCount = gpsSamples.length;
    const calibrationSamples = metadata.calibrationSamples || [];
    const calibrationCount = calibrationSamples.length;
    const hasCalibration = metadata.calibration ? 1 : 0;
    
    // Detect if magnetometer or orientation data is present
    // Note: Orientation data (alpha/beta/gamma) gets mapped to mx/my/mz during storage
    const hasMagnetometer = imuSamples.some(s => 
      s.mx !== undefined || s.my !== undefined || s.mz !== undefined
    );
    const version = hasMagnetometer ? 3 : 2;
    
    // Debug: Log version detection
    const versionMsg = `[BinaryWriter] Version detection: ${imuSamples.length} IMU samples, hasMagnetometer=${hasMagnetometer}, using V${version}`;
    console.log(versionMsg);
    const imuSampleSize = version === 3 ? this.IMU_SAMPLE_SIZE_V3 : this.IMU_SAMPLE_SIZE_V2;
    
    // Calculate total size
    const totalSize = this.HEADER_SIZE + 
                     (hasCalibration ? this.CALIBRATION_SIZE : 0) +
                     (imuCount * imuSampleSize) + 
                     (gpsCount * this.GPS_SAMPLE_SIZE) +
                     (calibrationCount * imuSampleSize);
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;
    
    // Write header
    offset = this.writeHeader(view, offset, {
      version,
      imuCount,
      gpsCount,
      calibrationCount,
      hasCalibration,
      sessionStart: metadata.sessionStart || Date.now(),
      phoneOrientation: metadata.phoneOrientation === 'coxswain' ? 1 : 0,
      demoMode: metadata.demoMode ? 1 : 0,
      catchThreshold: metadata.catchThreshold || 0.6,
      finishThreshold: metadata.finishThreshold || -0.3,
    });
    
    // Write calibration data if present
    if (hasCalibration && metadata.calibration) {
      offset = this.writeCalibration(view, offset, metadata.calibration);
    }
    
    // Write IMU samples
    for (const sample of imuSamples) {
      offset = this.writeIMUSample(view, offset, sample, version);
    }
    
    // Write GPS samples
    for (const sample of gpsSamples) {
      offset = this.writeGPSSample(view, offset, sample);
    }
    
    // Write calibration samples (raw data collected during calibration)
    for (const sample of calibrationSamples) {
      offset = this.writeIMUSample(view, offset, sample, version);
    }
    
    return buffer;
  }

  private writeHeader(view: DataView, offset: number, header: {
    version: number;
    imuCount: number;
    gpsCount: number;
    calibrationCount: number;
    hasCalibration: number;
    sessionStart: number;
    phoneOrientation: number;
    demoMode: number;
    catchThreshold: number;
    finishThreshold: number;
  }): number {
    // Magic string (16 bytes)
    const magic = header.version === 3 ? this.MAGIC_V3 : this.MAGIC_V2;
    for (let i = 0; i < 16; i++) {
      view.setUint8(offset++, magic.charCodeAt(i));
    }
    
    view.setUint32(offset, header.imuCount, true); offset += 4;
    view.setUint32(offset, header.gpsCount, true); offset += 4;
    view.setUint32(offset, header.calibrationCount, true); offset += 4;
    view.setUint8(offset++, header.hasCalibration);
    view.setFloat64(offset, header.sessionStart, true); offset += 8;
    view.setUint8(offset++, header.phoneOrientation);
    view.setUint8(offset++, header.demoMode);
    view.setFloat32(offset, header.catchThreshold, true); offset += 4;
    view.setFloat32(offset, header.finishThreshold, true); offset += 4;
    
    // Skip reserved bytes (81 bytes remaining to reach 128 total)
    offset += 81;
    
    return offset;
  }
  
  private writeCalibration(view: DataView, offset: number, calibration: CalibrationData): number {
    view.setFloat32(offset, calibration.pitchOffset, true); offset += 4;
    view.setFloat32(offset, calibration.rollOffset, true); offset += 4;
    view.setFloat32(offset, calibration.yawOffset, true); offset += 4;
    view.setFloat32(offset, calibration.lateralOffset, true); offset += 4;
    view.setFloat32(offset, calibration.gravityMagnitude, true); offset += 4;
    view.setUint32(offset, calibration.samples, true); offset += 4;
    view.setFloat32(offset, calibration.variance, true); offset += 4;
    view.setFloat64(offset, calibration.timestamp, true); offset += 8;
    
    // Reserved bytes (28 bytes to reach 64 total)
    offset += 28;
    
    return offset;
  }

  private writeIMUSample(view: DataView, offset: number, sample: IMUSample, version: number): number {
    view.setFloat64(offset, sample.t, true); offset += 8;
    view.setFloat32(offset, sample.ax, true); offset += 4;
    view.setFloat32(offset, sample.ay, true); offset += 4;
    view.setFloat32(offset, sample.az, true); offset += 4;
    view.setFloat32(offset, sample.gx, true); offset += 4;
    view.setFloat32(offset, sample.gy, true); offset += 4;
    view.setFloat32(offset, sample.gz, true); offset += 4;
    
    // V3: Add magnetometer data (or NaN if not present)
    if (version === 3) {
      const mx = (sample.mx !== undefined && Number.isFinite(sample.mx)) ? sample.mx : NaN;
      const my = (sample.my !== undefined && Number.isFinite(sample.my)) ? sample.my : NaN;
      const mz = (sample.mz !== undefined && Number.isFinite(sample.mz)) ? sample.mz : NaN;
      view.setFloat32(offset, mx, true); offset += 4;
      view.setFloat32(offset, my, true); offset += 4;
      view.setFloat32(offset, mz, true); offset += 4;
    }
    
    return offset;
  }

  private writeGPSSample(view: DataView, offset: number, sample: GPSSample): number {
    view.setFloat64(offset, sample.t, true); offset += 8;
    view.setFloat64(offset, sample.lat, true); offset += 8;
    view.setFloat64(offset, sample.lon, true); offset += 8;
    view.setFloat32(offset, sample.speed, true); offset += 4;
    view.setFloat32(offset, sample.heading, true); offset += 4;
    view.setFloat32(offset, sample.accuracy, true); offset += 4;
    return offset;
  }
}

