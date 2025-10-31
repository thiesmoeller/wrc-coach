import type { IMUSample, GPSSample, SessionData } from '../types';

/**
 * Binary Reader for .wrcdata files (V1, V2, and V3)
 * Decodes binary format back to usable data
 */
export class BinaryDataReader {
  private readonly MAGIC_V1 = 'WRC_COACH_V1';
  private readonly MAGIC_V2 = 'WRC_COACH_V2';
  private readonly MAGIC_V3 = 'WRC_COACH_V3';
  private readonly HEADER_SIZE_V1 = 64;
  private readonly HEADER_SIZE_V2 = 128;
  private readonly HEADER_SIZE_V3 = 128;
  private readonly IMU_SAMPLE_SIZE_V2 = 32;
  private readonly IMU_SAMPLE_SIZE_V3 = 44;
  private readonly GPS_SAMPLE_SIZE = 36;

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
    
    const isV3 = magic.startsWith(this.MAGIC_V3);
    const isV2 = magic.startsWith(this.MAGIC_V2);
    const version = isV3 ? 3 : isV2 ? 2 : 1;
    const headerSize = version === 1 ? this.HEADER_SIZE_V1 : this.HEADER_SIZE_V2;
    const imuSampleSize = version === 3 ? this.IMU_SAMPLE_SIZE_V3 : this.IMU_SAMPLE_SIZE_V2;
    
    // Read header
    const metadata = this.readHeader(view, offset, version);
    offset += headerSize;
    
    // Skip calibration data if V2 or V3
    if (version >= 2) {
      // Check if has_calibration flag is set
      const hasCalibration = view.getUint8(28) === 1;
      if (hasCalibration) {
        offset += 64; // Skip calibration block
      }
    }
    
    // Read IMU samples
    const imuSamples: IMUSample[] = [];
    for (let i = 0; i < metadata.imuCount; i++) {
      const sample = this.readIMUSample(view, offset, version);
      imuSamples.push(sample);
      offset += imuSampleSize;
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
    
    // V2/V3 has calibration count
    if (version >= 2) {
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
      if (Number.isFinite(mx)) (sample as any).mx = mx;
      if (Number.isFinite(my)) (sample as any).my = my;
      if (Number.isFinite(mz)) (sample as any).mz = mz;
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

