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

export interface ChunkLayout {
  version: number;
  imuCount: number;
  gpsCount: number;
  imuOffset: number;
  gpsOffset: number;
  imuBytes: number;
  gpsBytes: number;
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

  /**
   * Merge already-encoded .wrcdata chunks into one file by copying sample
   * bytes. Long sessions are stored as many small chunks; decoding them all
   * into JS objects can OOM on a phone and makes Share return null / "Failed
   * to export session".
   */
  mergeChunks(chunkBuffers: ArrayBuffer[], metadata: SessionMetadata = {}): ArrayBuffer {
    if (chunkBuffers.length === 0) {
      return this.encode([], [], metadata);
    }

    const layouts = chunkBuffers.map((buffer) => this.inspectChunk(buffer));
    const merged = this.createMergedBuffer(layouts, metadata);
    let imuWrite = merged.imuWrite;
    let gpsWrite = merged.gpsWrite;
    for (let i = 0; i < chunkBuffers.length; i++) {
      const next = this.copyChunkIntoMerge(
        merged.out,
        merged.view,
        imuWrite,
        gpsWrite,
        chunkBuffers[i],
        layouts[i],
        merged.version
      );
      imuWrite = next.imuWrite;
      gpsWrite = next.gpsWrite;
    }
    return merged.buffer;
  }

  peekVersion(buffer: ArrayBuffer): number {
    if (buffer.byteLength < 16) return 0;
    const view = new DataView(buffer);
    let magic = '';
    for (let i = 0; i < 16; i++) {
      const char = view.getUint8(i);
      if (char !== 0) magic += String.fromCharCode(char);
    }
    if (magic.startsWith('WRC_COACH_V3')) return 3;
    if (magic.startsWith('WRC_COACH_V2')) return 2;
    if (magic.startsWith('WRC_COACH_V1')) return 1;
    return 0;
  }

  inspectChunk(buffer: ArrayBuffer): ChunkLayout {
    if (buffer.byteLength < 24) {
      throw new Error('Session chunk is too small to be a WRC file');
    }
    const version = this.peekVersion(buffer);
    if (version === 0) {
      throw new Error('Invalid session chunk format');
    }

    const view = new DataView(buffer);
    const imuCount = view.getUint32(16, true);
    const gpsCount = view.getUint32(20, true);
    const headerSize = version === 1 ? 64 : this.HEADER_SIZE;
    const hasCalibration = version === 1 ? 0 : view.getUint8(28);
    const imuSampleSize = version === 3 ? this.IMU_SAMPLE_SIZE_V3 : this.IMU_SAMPLE_SIZE_V2;
    let imuOffset = headerSize;
    if ((version === 2 || version === 3) && hasCalibration) {
      imuOffset += this.CALIBRATION_SIZE;
    }
    const imuBytes = imuCount * imuSampleSize;
    const gpsOffset = imuOffset + imuBytes;
    const gpsBytes = gpsCount * this.GPS_SAMPLE_SIZE;
    if (gpsOffset + gpsBytes > buffer.byteLength) {
      throw new Error('Session chunk is truncated');
    }
    return { version, imuCount, gpsCount, imuOffset, gpsOffset, imuBytes, gpsBytes };
  }

  createMergedBuffer(
    layouts: ChunkLayout[],
    metadata: SessionMetadata = {}
  ): {
    buffer: ArrayBuffer;
    view: DataView;
    out: Uint8Array;
    imuWrite: number;
    gpsWrite: number;
    version: number;
  } {
    const version = layouts.some((c) => c.version === 3) ? 3 : 2;
    const outImuSize = version === 3 ? this.IMU_SAMPLE_SIZE_V3 : this.IMU_SAMPLE_SIZE_V2;
    const imuCount = layouts.reduce((sum, c) => sum + c.imuCount, 0);
    const gpsCount = layouts.reduce((sum, c) => sum + c.gpsCount, 0);
    const totalSize =
      this.HEADER_SIZE + imuCount * outImuSize + gpsCount * this.GPS_SAMPLE_SIZE;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const out = new Uint8Array(buffer);
    const imuWrite = this.writeHeader(view, 0, {
      version,
      imuCount,
      gpsCount,
      calibrationCount: 0,
      hasCalibration: 0,
      sessionStart: metadata.sessionStart || Date.now(),
      phoneOrientation: metadata.phoneOrientation === 'coxswain' ? 1 : 0,
      demoMode: metadata.demoMode ? 1 : 0,
      catchThreshold: metadata.catchThreshold || 0.6,
      finishThreshold: metadata.finishThreshold || -0.3,
    });
    const gpsWrite = imuWrite + imuCount * outImuSize;
    return { buffer, view, out, imuWrite, gpsWrite, version };
  }

  copyChunkIntoMerge(
    out: Uint8Array,
    view: DataView,
    imuWrite: number,
    gpsWrite: number,
    buffer: ArrayBuffer,
    layout: ChunkLayout,
    targetVersion: number
  ): { imuWrite: number; gpsWrite: number } {
    const src = new Uint8Array(buffer);
    if (layout.version === targetVersion) {
      out.set(src.subarray(layout.imuOffset, layout.imuOffset + layout.imuBytes), imuWrite);
      imuWrite += layout.imuBytes;
    } else if (layout.version === 2 && targetVersion === 3) {
      for (let i = 0; i < layout.imuCount; i++) {
        const start = layout.imuOffset + i * this.IMU_SAMPLE_SIZE_V2;
        out.set(src.subarray(start, start + this.IMU_SAMPLE_SIZE_V2), imuWrite);
        imuWrite += this.IMU_SAMPLE_SIZE_V2;
        view.setFloat32(imuWrite, NaN, true); imuWrite += 4;
        view.setFloat32(imuWrite, NaN, true); imuWrite += 4;
        view.setFloat32(imuWrite, NaN, true); imuWrite += 4;
      }
    } else {
      throw new Error(`Cannot merge V${layout.version} IMU samples into V${targetVersion}`);
    }

    if (layout.gpsBytes > 0) {
      out.set(src.subarray(layout.gpsOffset, layout.gpsOffset + layout.gpsBytes), gpsWrite);
      gpsWrite += layout.gpsBytes;
    }
    return { imuWrite, gpsWrite };
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

