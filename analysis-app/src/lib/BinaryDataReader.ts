import type { IMUSample, GPSSample, SessionData, CalibrationData } from '../types';

/**
 * Binary Reader for .wrcdata files (V1 and V2 formats)
 * Decodes binary format back to usable data
 */
export class BinaryDataReader {
  private readonly MAGIC_V1 = 'WRC_COACH_V1';
  private readonly MAGIC_V2 = 'WRC_COACH_V2';
  private readonly HEADER_SIZE_V1 = 64;
  private readonly HEADER_SIZE_V2 = 128;
  private readonly IMU_SAMPLE_SIZE = 32;
  private readonly GPS_SAMPLE_SIZE = 36;
  private readonly CALIBRATION_SIZE = 64;

  /**
   * Decode binary data from .wrcdata file
   */
  decode(buffer: ArrayBuffer): SessionData {
    const view = new DataView(buffer);
    let offset = 0;
    
    // Read magic string to detect version
    let magic = '';
    for (let i = 0; i < 16; i++) {
      const char = view.getUint8(i);
      if (char !== 0) magic += String.fromCharCode(char);
    }
    
    const version = magic.startsWith(this.MAGIC_V2) ? 2 : 1;
    const headerSize = version === 2 ? this.HEADER_SIZE_V2 : this.HEADER_SIZE_V1;
    
    // Read header
    const metadata = this.readHeader(view, offset, version);
    offset += headerSize;
    
    // Read calibration data if V2
    let calibration: CalibrationData | null = null;
    if (version === 2) {
      // Check if has_calibration flag is set
      const hasCalibration = view.getUint8(28) === 1;
      if (hasCalibration) {
        calibration = this.readCalibration(view, offset);
        offset += this.CALIBRATION_SIZE;
      }
    }
    
    // Read IMU samples
    const imuSamples: IMUSample[] = [];
    for (let i = 0; i < metadata.imuCount; i++) {
      const sample = this.readIMUSample(view, offset);
      imuSamples.push(sample);
      offset += this.IMU_SAMPLE_SIZE;
    }
    
    // Read GPS samples
    const gpsSamples: GPSSample[] = [];
    for (let i = 0; i < metadata.gpsCount; i++) {
      const sample = this.readGPSSample(view, offset);
      gpsSamples.push(sample);
      offset += this.GPS_SAMPLE_SIZE;
    }
    
    return {
      metadata,
      imuSamples,
      gpsSamples,
      calibration,
    };
  }

  private readHeader(view: DataView, offset: number, version: number) {
    // Read magic string
    let magic = '';
    for (let i = 0; i < 16; i++) {
      const char = view.getUint8(offset++);
      if (char !== 0) magic += String.fromCharCode(char);
    }
    
    const imuCount = view.getUint32(offset, true); offset += 4;
    const gpsCount = view.getUint32(offset, true); offset += 4;
    
    // V2 has calibration count
    if (version === 2) {
      offset += 4; // skip calibration count
      offset += 1; // skip has_calibration flag
    }
    
    const sessionStart = view.getFloat64(offset, true); offset += 8;
    const phoneOrientation: 'coxswain' | 'rower' = view.getUint8(offset++) === 1 ? 'coxswain' : 'rower';
    const demoMode = view.getUint8(offset++) === 1;
    const catchThreshold = view.getFloat32(offset, true); offset += 4;
    const finishThreshold = view.getFloat32(offset, true); offset += 4;
    
    return {
      magic,
      version,
      imuCount,
      gpsCount,
      sessionStart,
      phoneOrientation,
      demoMode,
      catchThreshold,
      finishThreshold,
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
    const timestamp = view.getFloat64(offset, true);
    
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

