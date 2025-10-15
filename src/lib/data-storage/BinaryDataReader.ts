import type { IMUSample, GPSSample, SessionMetadata } from './BinaryDataWriter';

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
}

/**
 * Binary Reader for .wrcdata files
 * Decodes binary format back to usable data
 */
export class BinaryDataReader {
  private readonly MAGIC = 'WRC_COACH_V1';
  private readonly HEADER_SIZE = 64;
  private readonly IMU_SAMPLE_SIZE = 32;
  private readonly GPS_SAMPLE_SIZE = 36;

  /**
   * Decode binary data
   */
  decode(buffer: ArrayBuffer): DecodedData {
    const view = new DataView(buffer);
    let offset = 0;
    
    // Read and verify header
    const header = this.readHeader(view, offset);
    offset += this.HEADER_SIZE;
    
    if (!header.magic.startsWith(this.MAGIC)) {
      throw new Error('Invalid file format');
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
    
    return {
      metadata: header,
      imuSamples,
      gpsSamples,
    };
  }

  private readHeader(view: DataView, offset: number): SessionMetadata & {
    magic: string;
    imuCount: number;
    gpsCount: number;
    sessionStart: number;
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

