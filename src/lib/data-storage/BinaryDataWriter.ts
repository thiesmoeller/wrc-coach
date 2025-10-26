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
}

/**
 * Binary Writer for IMU/GPS data
 * Creates compact .wrcdata files for efficient storage and reprocessing
 * 
 * V3 Format: Uses PCA-based axis detection (no calibration data)
 */
export class BinaryDataWriter {
  private readonly MAGIC = 'WRC_COACH_V3\0\0\0\0\0'; // 16 bytes (V3 - PCA-based, no calibration)
  private readonly HEADER_SIZE = 64; // Simplified header (no calibration)
  private readonly IMU_SAMPLE_SIZE = 32;
  private readonly GPS_SAMPLE_SIZE = 36;

  /**
   * Encode samples to binary format (V3 - no calibration)
   */
  encode(imuSamples: IMUSample[], gpsSamples: GPSSample[], metadata: SessionMetadata = {}): ArrayBuffer {
    const imuCount = imuSamples.length;
    const gpsCount = gpsSamples.length;
    
    // Calculate total size (no calibration in V3)
    const totalSize = this.HEADER_SIZE + 
                     (imuCount * this.IMU_SAMPLE_SIZE) + 
                     (gpsCount * this.GPS_SAMPLE_SIZE);
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;
    
    // Write header
    offset = this.writeHeader(view, offset, {
      imuCount,
      gpsCount,
      sessionStart: metadata.sessionStart || Date.now(),
      phoneOrientation: metadata.phoneOrientation === 'coxswain' ? 1 : 0,
      demoMode: metadata.demoMode ? 1 : 0,
    });
    
    // Write IMU samples
    for (const sample of imuSamples) {
      offset = this.writeIMUSample(view, offset, sample);
    }
    
    // Write GPS samples
    for (const sample of gpsSamples) {
      offset = this.writeGPSSample(view, offset, sample);
    }
    
    return buffer;
  }

  private writeHeader(view: DataView, offset: number, header: {
    imuCount: number;
    gpsCount: number;
    sessionStart: number;
    phoneOrientation: number;
    demoMode: number;
  }): number {
    // Magic string (16 bytes)
    for (let i = 0; i < 16; i++) {
      view.setUint8(offset++, this.MAGIC.charCodeAt(i));
    }
    
    // Counts (8 bytes)
    view.setUint32(offset, header.imuCount, true); offset += 4;
    view.setUint32(offset, header.gpsCount, true); offset += 4;
    
    // Session metadata (10 bytes)
    view.setFloat64(offset, header.sessionStart, true); offset += 8;
    view.setUint8(offset++, header.phoneOrientation);
    view.setUint8(offset++, header.demoMode);
    
    // Reserved bytes (30 bytes remaining to reach 64 total)
    offset += 30;
    
    return offset;
  }

  private writeIMUSample(view: DataView, offset: number, sample: IMUSample): number {
    view.setFloat64(offset, sample.t, true); offset += 8;
    view.setFloat32(offset, sample.ax, true); offset += 4;
    view.setFloat32(offset, sample.ay, true); offset += 4;
    view.setFloat32(offset, sample.az, true); offset += 4;
    view.setFloat32(offset, sample.gx, true); offset += 4;
    view.setFloat32(offset, sample.gy, true); offset += 4;
    view.setFloat32(offset, sample.gz, true); offset += 4;
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

