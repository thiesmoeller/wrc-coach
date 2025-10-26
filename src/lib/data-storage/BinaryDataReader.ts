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
 * 
 * Supports V1 (legacy), V2 (with calibration - deprecated), and V3 (PCA-based, no calibration)
 */
export class BinaryDataReader {
  private readonly MAGIC_V1 = 'WRC_COACH_V1';
  private readonly MAGIC_V2 = 'WRC_COACH_V2';
  private readonly MAGIC_V3 = 'WRC_COACH_V3';
  private readonly HEADER_SIZE_V1 = 64;
  private readonly HEADER_SIZE_V2 = 128;
  private readonly HEADER_SIZE_V3 = 64;
  private readonly IMU_SAMPLE_SIZE = 32;
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
      throw new Error('Invalid file format');
    }
    
    console.log(`Reading .wrcdata file version ${isV3 ? '3' : isV2 ? '2' : '1'}`);
    
    // Read header based on version
    let header;
    if (isV3) {
      header = this.readHeaderV3(view, offset);
      offset += this.HEADER_SIZE_V3;
    } else if (isV2) {
      header = this.readHeaderV2(view, offset);
      offset += this.HEADER_SIZE_V2;
    } else {
      header = this.readHeaderV1(view, offset);
      offset += this.HEADER_SIZE_V1;
    }
    
    // Read calibration data if V2 (deprecated - not used in V3)
    let calibration: CalibrationData | null = null;
    if (isV2 && header.hasCalibration) {
      calibration = this.readCalibration(view, offset);
      offset += this.CALIBRATION_SIZE;
    }
    
    // Read IMU samples
    const imuSamples: IMUSample[] = [];
    for (let i = 0; i < header.imuCount; i++) {
      const sample = this.readIMUSample(view, offset);
      imuSamples.push(sample);
      offset += this.IMU_SAMPLE_SIZE;
    }
    
    // Read GPS samples
    const gpsSamples: GPSSample[] = [];
    for (let i = 0; i < header.gpsCount; i++) {
      const sample = this.readGPSSample(view, offset);
      gpsSamples.push(sample);
      offset += this.GPS_SAMPLE_SIZE;
    }
    
    // Read calibration samples if V2 (deprecated - not present in V3)
    const calibrationSamples: IMUSample[] = [];
    if (isV2 && header.calibrationCount > 0) {
      for (let i = 0; i < header.calibrationCount; i++) {
        const sample = this.readIMUSample(view, offset);
        calibrationSamples.push(sample);
        offset += this.IMU_SAMPLE_SIZE;
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
    // Skip thresholds (deprecated in V3)
    offset += 4; // catchThreshold
    offset += 4; // finishThreshold
    
    return {
      magic,
      imuCount,
      gpsCount,
      sessionStart,
      phoneOrientation,
      demoMode,
      calibrationCount: 0,
      hasCalibration: false,
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
    // Skip thresholds (deprecated in V3)
    offset += 4; // catchThreshold
    offset += 4; // finishThreshold
    
    // Skip reserved bytes (81 bytes)
    // offset += 81; (we don't need to adjust offset here since we're returning)
    
    return {
      magic,
      imuCount,
      gpsCount,
      sessionStart,
      phoneOrientation,
      demoMode,
      calibrationCount,
      hasCalibration,
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
    const sessionStart = view.getFloat64(offset, true); offset += 8;
    const phoneOrientation: 'coxswain' | 'rower' = view.getUint8(offset++) === 1 ? 'coxswain' : 'rower';
    const demoMode = view.getUint8(offset++) === 1;
    
    // Skip reserved bytes (30 bytes)
    // offset += 30; (we don't need to adjust offset here since we're returning)
    
    return {
      magic,
      imuCount,
      gpsCount,
      sessionStart,
      phoneOrientation,
      demoMode,
      calibrationCount: 0, // V3 has no calibration
      hasCalibration: false, // V3 has no calibration
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

  private readIMUSample(view: DataView, offset: number): IMUSample {
    return {
      t: view.getFloat64(offset, true),
      ax: view.getFloat32(offset + 8, true),
      ay: view.getFloat32(offset + 12, true),
      az: view.getFloat32(offset + 16, true),
      gx: view.getFloat32(offset + 20, true),
      gy: view.getFloat32(offset + 24, true),
      gz: view.getFloat32(offset + 28, true),
    };
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

