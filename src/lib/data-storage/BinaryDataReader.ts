import type { IMUSample, GPSSample, SessionMetadata, CalibrationData } from './BinaryDataWriter';

/**
 * Decoded session data
 */
export interface DecodedData {
  metadata: SessionMetadata & {
    magic: string;
    imuCount: number;
    gpsCount: number;
    sessionStart: number;
  };
  imuSamples: IMUSample[];
  gpsSamples: GPSSample[];
  calibration?: CalibrationData | null;
  calibrationSamples?: IMUSample[];
}

/**
 * Binary Reader for .wrcdata files
 * Decodes binary format back to usable data
 * Supports V1 (legacy), V2 (with calibration), and V3 (with magnetometer) formats
 */
export class BinaryDataReader {
  private readonly MAGIC_V1 = 'WRC_COACH_V1';
  private readonly MAGIC_V2 = 'WRC_COACH_V2';
  private readonly MAGIC_V3 = 'WRC_COACH_V3';
  private readonly HEADER_SIZE_V1 = 64;
  private readonly HEADER_SIZE_V2 = 128;
  private readonly IMU_SAMPLE_SIZE_V2 = 32;
  private readonly IMU_SAMPLE_SIZE_V3 = 44;
  private readonly GPS_SAMPLE_SIZE = 36;
  private readonly CALIBRATION_SIZE = 64;

  /**
   * Decode binary data
   */
  decode(buffer: ArrayBuffer): DecodedData {
    const view = new DataView(buffer);
    let offset = 0;
    
    // Peek at magic string to determine version
    let magic = '';
    for (let i = 0; i < 16; i++) {
      const char = view.getUint8(i);
      if (char !== 0) magic += String.fromCharCode(char);
    }
    
    const isV3 = magic.startsWith(this.MAGIC_V3);
    const isV2 = magic.startsWith(this.MAGIC_V2);
    const isV1 = magic.startsWith(this.MAGIC_V1);
    
    if (!isV1 && !isV2 && !isV3) {
      throw new Error(`Invalid file format: ${magic}`);
    }
    
    const version = isV3 ? 3 : isV2 ? 2 : 1;
    const headerSize = version === 1 ? this.HEADER_SIZE_V1 : this.HEADER_SIZE_V2;
    const imuSampleSize = version === 3 ? this.IMU_SAMPLE_SIZE_V3 : this.IMU_SAMPLE_SIZE_V2;
    
    // Read header based on version
    const header = version === 1 
      ? this.readHeaderV1(view, offset) 
      : version === 2 
      ? this.readHeaderV2(view, offset)
      : this.readHeaderV3(view, offset);
    offset += headerSize;
    
    // Read calibration data if V2 or V3
    let calibration: CalibrationData | null = null;
    if ((version === 2 || version === 3) && header.hasCalibration) {
      calibration = this.readCalibration(view, offset);
      offset += this.CALIBRATION_SIZE;
    }
    
    // Read IMU samples
    const imuSamples: IMUSample[] = [];
    for (let i = 0; i < header.imuCount; i++) {
      const sample = this.readIMUSample(view, offset, version);
      imuSamples.push(sample);
      offset += imuSampleSize;
    }
    
    // Read GPS samples
    const gpsSamples: GPSSample[] = [];
    for (let i = 0; i < header.gpsCount; i++) {
      const sample = this.readGPSSample(view, offset);
      gpsSamples.push(sample);
      offset += this.GPS_SAMPLE_SIZE;
    }
    
    // Read calibration samples if V2 or V3
    const calibrationSamples: IMUSample[] = [];
    if ((version === 2 || version === 3) && header.calibrationCount > 0) {
      for (let i = 0; i < header.calibrationCount; i++) {
        const sample = this.readIMUSample(view, offset, version);
        calibrationSamples.push(sample);
        offset += imuSampleSize;
      }
    }
    
    return {
      metadata: header,
      imuSamples,
      gpsSamples,
      calibration,
      calibrationSamples: calibrationSamples.length > 0 ? calibrationSamples : undefined,
    };
  }

  private readHeaderV1(view: DataView, offset: number): SessionMetadata & {
    magic: string;
    imuCount: number;
    gpsCount: number;
    sessionStart: number;
    calibrationCount: number;
    hasCalibration: boolean;
  } {
    // Read magic string
    let magic = '';
    for (let i = 0; i < 16; i++) {
      const char = view.getUint8(offset++);
      if (char !== 0) magic += String.fromCharCode(char);
    }
    
    const imuCount = view.getUint32(offset, true); offset += 4;
    const gpsCount = view.getUint32(offset, true); offset += 4;
    const sessionStart = view.getFloat64(offset, true); offset += 8;
    const phoneOrientation: 'coxswain' | 'rower' = view.getUint8(offset++) === 1 ? 'coxswain' : 'rower';
    const demoMode = view.getUint8(offset++) === 1;
    const catchThreshold = view.getFloat32(offset, true); offset += 4;
    const finishThreshold = view.getFloat32(offset, true); offset += 4;
    
    return {
      magic,
      imuCount,
      gpsCount,
      sessionStart,
      phoneOrientation,
      demoMode,
      catchThreshold,
      finishThreshold,
      calibrationCount: 0,
      hasCalibration: false,
    };
  }

  private readHeaderV3(view: DataView, offset: number): SessionMetadata & {
    magic: string;
    imuCount: number;
    gpsCount: number;
    sessionStart: number;
    calibrationCount: number;
    hasCalibration: boolean;
  } {
    // Read magic string
    let magic = '';
    for (let i = 0; i < 16; i++) {
      const char = view.getUint8(offset++);
      if (char !== 0) magic += String.fromCharCode(char);
    }
    
    const imuCount = view.getUint32(offset, true); offset += 4;
    const gpsCount = view.getUint32(offset, true); offset += 4;
    const calibrationCount = view.getUint32(offset, true); offset += 4;
    const hasCalibration = view.getUint8(offset++) === 1;
    const sessionStart = view.getFloat64(offset, true); offset += 8;
    const phoneOrientation: 'coxswain' | 'rower' = view.getUint8(offset++) === 1 ? 'coxswain' : 'rower';
    const demoMode = view.getUint8(offset++) === 1;
    const catchThreshold = view.getFloat32(offset, true); offset += 4;
    const finishThreshold = view.getFloat32(offset, true); offset += 4;
    
    return {
      magic,
      imuCount,
      gpsCount,
      sessionStart,
      phoneOrientation,
      demoMode,
      catchThreshold,
      finishThreshold,
      calibrationCount,
      hasCalibration,
    };
  }

  private readHeaderV2(view: DataView, offset: number): SessionMetadata & {
    magic: string;
    imuCount: number;
    gpsCount: number;
    sessionStart: number;
    calibrationCount: number;
    hasCalibration: boolean;
  } {
    // Read magic string
    let magic = '';
    for (let i = 0; i < 16; i++) {
      const char = view.getUint8(offset++);
      if (char !== 0) magic += String.fromCharCode(char);
    }
    
    const imuCount = view.getUint32(offset, true); offset += 4;
    const gpsCount = view.getUint32(offset, true); offset += 4;
    const calibrationCount = view.getUint32(offset, true); offset += 4;
    const hasCalibration = view.getUint8(offset++) === 1;
    const sessionStart = view.getFloat64(offset, true); offset += 8;
    const phoneOrientation: 'coxswain' | 'rower' = view.getUint8(offset++) === 1 ? 'coxswain' : 'rower';
    const demoMode = view.getUint8(offset++) === 1;
    const catchThreshold = view.getFloat32(offset, true); offset += 4;
    const finishThreshold = view.getFloat32(offset, true); offset += 4;
    
    // Skip reserved bytes (81 bytes)
    // offset += 81; (we don't need to adjust offset here since we're returning)
    
    return {
      magic,
      imuCount,
      gpsCount,
      sessionStart,
      phoneOrientation,
      demoMode,
      catchThreshold,
      finishThreshold,
      calibrationCount,
      hasCalibration,
    };
  }

  private readCalibration(view: DataView, offset: number): CalibrationData {
    const pitchOffset = view.getFloat32(offset, true); offset += 4;
    const rollOffset = view.getFloat32(offset, true); offset += 4;
    const yawOffset = view.getFloat32(offset, true); offset += 4;
    const lateralOffset = view.getFloat32(offset, true); offset += 4;
    const gravityMagnitude = view.getFloat32(offset, true); offset += 4;
    const samples = view.getUint32(offset, true); offset += 4;
    const variance = view.getFloat32(offset, true); offset += 4;
    const timestamp = view.getFloat64(offset, true); offset += 8;
    
    return {
      pitchOffset,
      rollOffset,
      yawOffset,
      lateralOffset,
      gravityMagnitude,
      samples,
      variance,
      timestamp,
    };
  }

  private readIMUSample(view: DataView, offset: number, version: number): IMUSample {
    const sample: IMUSample = {
      t: view.getFloat64(offset, true),
      ax: view.getFloat32(offset + 8, true),
      ay: view.getFloat32(offset + 12, true),
      az: view.getFloat32(offset + 16, true),
      gx: view.getFloat32(offset + 20, true),
      gy: view.getFloat32(offset + 24, true),
      gz: view.getFloat32(offset + 28, true),
    };
    
    // V3: Read magnetometer/orientation data
    // Note: mx/my/mz can contain either:
    //   - Magnetometer data (µT) for older files
    //   - Orientation data (degrees) for newer files:
    //     - mx = alpha (compass heading 0-360°)
    //     - my = beta (front-back tilt)
    //     - mz = gamma (left-right tilt)
    if (version === 3) {
      const mx = view.getFloat32(offset + 32, true);
      const my = view.getFloat32(offset + 36, true);
      const mz = view.getFloat32(offset + 40, true);
      
      // Only include if not NaN
      if (Number.isFinite(mx)) sample.mx = mx;
      if (Number.isFinite(my)) sample.my = my;
      if (Number.isFinite(mz)) sample.mz = mz;
    }
    
    return sample;
  }

  private readGPSSample(view: DataView, offset: number): GPSSample {
    return {
      t: view.getFloat64(offset, true),
      lat: view.getFloat64(offset + 8, true),
      lon: view.getFloat64(offset + 16, true),
      speed: view.getFloat32(offset + 24, true),
      heading: view.getFloat32(offset + 28, true),
      accuracy: view.getFloat32(offset + 32, true),
    };
  }
}

