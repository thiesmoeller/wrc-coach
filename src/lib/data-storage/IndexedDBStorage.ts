/**
 * IndexedDB Storage for Session Data
 * 
 * Stores large session data in IndexedDB instead of localStorage to overcome
 * the 5-10 MB localStorage limit. Each session's full sample data is stored
 * as a binary blob, while metadata is kept in localStorage for fast UI rendering.
 */

import { BinaryDataWriter, IMUSample, GPSSample, SessionMetadata } from './BinaryDataWriter';
import { BinaryDataReader } from './BinaryDataReader';

const DB_NAME = 'wrc_coach_db';
const DB_VERSION = 2; // Increment version to add chunks store
const STORE_NAME = 'sessions';
const CHUNKS_STORE_NAME = 'session_chunks'; // Store for batch chunks

export interface SessionMetadataStorage {
  id: string;
  timestamp: number;
  sessionStartTime: number;
  duration: number;
  // Analysis data
  avgStrokeRate: number;
  avgDrivePercent: number;
  maxSpeed: number;
  totalDistance: number;
  strokeCount: number;
  // Settings used during recording
  phoneOrientation?: 'rower' | 'coxswain';
  demoMode?: boolean;
  catchThreshold?: number;
  finishThreshold?: number;
  hasCalibrationData?: boolean;
  // Data size info
  sampleCount: number;
  dataSize: number; // Size in bytes
}

export interface SessionFullData extends SessionMetadataStorage {
  // Full data (stored in IndexedDB, not in localStorage)
  samples: any[];
  calibrationData?: any;
}

/**
 * IndexedDB wrapper for storing large session data
 */
export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private writer = new BinaryDataWriter();
  private reader = new BinaryDataReader();
  
  /**
   * Initialize the database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('Error opening IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Create chunks store for batch appends (version 2+)
        if (!db.objectStoreNames.contains(CHUNKS_STORE_NAME)) {
          const chunksStore = db.createObjectStore(CHUNKS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
          chunksStore.createIndex('sessionId', 'sessionId', { unique: false });
          chunksStore.createIndex('chunkIndex', 'chunkIndex', { unique: false });
        }
      };
    });
  }
  
  /**
   * Ensure database is initialized
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }
  
  /**
   * Process samples and create binary data (helper method)
   */
  private processSamplesToBinary(
    sessionData: Omit<SessionFullData, 'id' | 'timestamp' | 'sampleCount' | 'dataSize'>
  ): { binaryData: ArrayBuffer; imuSamples: IMUSample[]; gpsSamples: GPSSample[] } {
    // Separate IMU and GPS samples, merging magnetometer data with IMU samples by timestamp
    const imuSamples: IMUSample[] = [];
    const gpsSamples: GPSSample[] = [];
    
    // Collect all samples first, then merge by rounded timestamp
    // Round timestamps to 1ms resolution to merge samples from different sensors
    const TIMESTAMP_ROUNDING_MS = 1;
    const roundTimestamp = (t: number) => Math.round(t / TIMESTAMP_ROUNDING_MS) * TIMESTAMP_ROUNDING_MS;
    
    const imuMap = new Map<number, IMUSample>();
    const magnetometerSamples: Array<{ t: number; mx?: number; my?: number; mz?: number }> = [];
    
    // First pass: collect accel/gyro samples and magnetometer/orientation samples separately
    for (const sample of sessionData.samples) {
      if (sample.type === 'imu') {
        const timestamp = sample.timestamp || sample.t;
        const roundedTimestamp = roundTimestamp(timestamp);
        
        // Map orientation data (alpha, beta, gamma) to magnetometer fields (mx, my, mz)
        // This allows us to use the existing V3 binary format for orientation data
        // alpha (compass heading 0-360°) → mx
        // beta (front-back tilt) → my
        // gamma (left-right tilt) → mz
        const mx = sample.mx ?? (sample.alpha !== undefined ? sample.alpha : undefined);
        const my = sample.my ?? (sample.beta !== undefined ? sample.beta : undefined);
        const mz = sample.mz ?? (sample.gamma !== undefined ? sample.gamma : undefined);
        
        if (mx !== undefined || my !== undefined || mz !== undefined) {
          // Check if this is a magnetometer/orientation-only sample
          if (sample.ax === undefined && sample.ay === undefined && sample.az === undefined &&
              sample.gx === undefined && sample.gy === undefined && sample.gz === undefined) {
            // Pure magnetometer/orientation sample - store for merging
            magnetometerSamples.push({
              t: timestamp,
              mx,
              my,
              mz,
            });
          } else {
            // Combined sample (accel/gyro + magnetometer/orientation)
            const existing = imuMap.get(roundedTimestamp);
            if (existing) {
              // Merge magnetometer/orientation data into existing sample
              if (mx !== undefined) existing.mx = mx;
              if (my !== undefined) existing.my = my;
              if (mz !== undefined) existing.mz = mz;
            } else {
              // Create new IMU sample with all data
              imuMap.set(roundedTimestamp, {
                t: timestamp, // Keep original timestamp
                ax: sample.ax ?? 0,
                ay: sample.ay ?? 0,
                az: sample.az ?? 0,
                gx: sample.gx ?? 0,
                gy: sample.gy ?? 0,
                gz: sample.gz ?? 0,
                mx,
                my,
                mz,
              });
            }
          }
        } else if (sample.ax !== undefined || sample.ay !== undefined || sample.az !== undefined) {
          // Accel/gyro sample - check if we can merge with existing magnetometer
          const existing = imuMap.get(roundedTimestamp);
          if (existing) {
            // Update accel/gyro data if needed
            if (sample.ax !== undefined) existing.ax = sample.ax;
            if (sample.ay !== undefined) existing.ay = sample.ay;
            if (sample.az !== undefined) existing.az = sample.az;
            if (sample.gx !== undefined) existing.gx = sample.gx;
            if (sample.gy !== undefined) existing.gy = sample.gy;
            if (sample.gz !== undefined) existing.gz = sample.gz;
          } else {
            // Create new IMU sample with accel/gyro data
            imuMap.set(roundedTimestamp, {
              t: timestamp,
              ax: sample.ax ?? 0,
              ay: sample.ay ?? 0,
              az: sample.az ?? 0,
              gx: sample.gx ?? 0,
              gy: sample.gy ?? 0,
              gz: sample.gz ?? 0,
            });
          }
        }
      } else if (sample.type === 'gps') {
        gpsSamples.push({
          t: sample.timestamp || sample.t,
          lat: sample.lat ?? 0,
          lon: sample.lon ?? 0,
          speed: sample.speed ?? 0,
          heading: sample.heading ?? 0,
          accuracy: sample.accuracy ?? 0,
        });
      }
    }
    
    // Second pass: merge magnetometer/orientation-only samples with nearest accel/gyro samples
    // Use a time window of 50ms to find matching samples (orientation data may come at slightly different rate)
    const MAGNETOMETER_MERGE_WINDOW_MS = 50;
    let mergedCount = 0;
    let createdCount = 0;
    for (const magSample of magnetometerSamples) {
      const roundedTimestamp = roundTimestamp(magSample.t);
      
      // Try exact match first
      let target = imuMap.get(roundedTimestamp);
      
      // If no exact match, find nearest sample within window
      if (!target) {
        let nearestTimestamp: number | null = null;
        let nearestDistance = Infinity;
        
        for (const [timestamp, _] of imuMap.entries()) {
          const distance = Math.abs(timestamp - roundedTimestamp);
          if (distance < MAGNETOMETER_MERGE_WINDOW_MS && distance < nearestDistance) {
            nearestTimestamp = timestamp;
            nearestDistance = distance;
          }
        }
        
        if (nearestTimestamp !== null) {
          target = imuMap.get(nearestTimestamp)!;
        }
      }
      
      if (target) {
        // Merge magnetometer data into nearest accel/gyro sample
        if (magSample.mx !== undefined) target.mx = magSample.mx;
        if (magSample.my !== undefined) target.my = magSample.my;
        if (magSample.mz !== undefined) target.mz = magSample.mz;
        mergedCount++;
      } else {
        // No matching accel/gyro sample found - create IMU sample with only magnetometer
        // This should be rare, but can happen if sensors are out of sync
        imuMap.set(roundedTimestamp, {
          t: magSample.t,
          ax: 0,
          ay: 0,
          az: 0,
          gx: 0,
          gy: 0,
          gz: 0,
          mx: magSample.mx,
          my: magSample.my,
          mz: magSample.mz,
        });
        createdCount++;
      }
    }
    
    // Debug: Log merge statistics
    if (magnetometerSamples.length > 0) {
      const mergeMsg = `[Storage] Merged ${mergedCount} orientation samples, created ${createdCount} standalone orientation samples from ${magnetometerSamples.length} total orientation samples`;
      console.log(mergeMsg);
    }
    
    // Convert map to array and sort by timestamp
    imuSamples.push(...Array.from(imuMap.values()).sort((a, b) => a.t - b.t));
    
    // Debug: Count how many samples have orientation/magnetometer data
    const samplesWithOrientation = imuSamples.filter(s => s.mx !== undefined || s.my !== undefined || s.mz !== undefined).length;
    const msg = `[Storage] Processing samples: ${imuSamples.length} IMU samples, ${samplesWithOrientation} with orientation/magnetometer data`;
    console.log(msg);
    
    // Create binary data
    const metadata: SessionMetadata = {
      sessionStart: sessionData.sessionStartTime,
      phoneOrientation: sessionData.phoneOrientation,
      demoMode: sessionData.demoMode,
      catchThreshold: sessionData.catchThreshold,
      finishThreshold: sessionData.finishThreshold,
      calibration: sessionData.calibrationData,
    };
    
    const binaryData = this.writer.encode(imuSamples, gpsSamples, metadata);
    
    return { binaryData, imuSamples, gpsSamples };
  }
  
  /**
   * Save a session to IndexedDB
   */
  async saveSession(sessionData: Omit<SessionFullData, 'id' | 'timestamp' | 'sampleCount' | 'dataSize'>): Promise<SessionMetadataStorage> {
    const db = await this.ensureDB();
    
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    
    const { binaryData } = this.processSamplesToBinary(sessionData);
    
    // Create storage object
    const storageData = {
      id,
      timestamp,
      sessionStartTime: sessionData.sessionStartTime,
      duration: sessionData.duration,
      avgStrokeRate: sessionData.avgStrokeRate,
      avgDrivePercent: sessionData.avgDrivePercent,
      maxSpeed: sessionData.maxSpeed,
      totalDistance: sessionData.totalDistance,
      strokeCount: sessionData.strokeCount,
      phoneOrientation: sessionData.phoneOrientation,
      demoMode: sessionData.demoMode,
      catchThreshold: sessionData.catchThreshold,
      finishThreshold: sessionData.finishThreshold,
      hasCalibrationData: !!sessionData.calibrationData,
      sampleCount: sessionData.samples.length,
      dataSize: binaryData.byteLength,
      binaryData, // Store as ArrayBuffer
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(storageData);
      
      request.onsuccess = () => {
        // Return metadata only (without binaryData)
        const { binaryData, ...metadata } = storageData;
        resolve(metadata);
      };
      
      request.onerror = () => {
        console.error('Error saving session:', request.error);
        const error = request.error;
        // Check for quota exceeded error
        if (error && (error.name === 'QuotaExceededError' || (error as any).code === 22)) {
          reject(new Error('Storage full! Please delete some sessions.'));
        } else {
          reject(error);
        }
      };
    });
  }
  
  /**
   * Append samples to a session as a chunk (append-only, no read required)
   */
  async appendSessionChunk(
    sessionId: string,
    samples: any[]
  ): Promise<void> {
    const db = await this.ensureDB();
    
    if (samples.length === 0) return;
    
    // Process samples to binary
    const { binaryData } = this.processSamplesToBinary({
      sessionStartTime: 0, // Not used for chunks
      duration: 0,
      samples,
      avgStrokeRate: 0,
      avgDrivePercent: 0,
      maxSpeed: 0,
      totalDistance: 0,
      strokeCount: 0,
      phoneOrientation: undefined,
      demoMode: undefined,
      catchThreshold: undefined,
      finishThreshold: undefined,
      calibrationData: undefined,
    });
    
    // Get next chunk index for this session
    const chunkIndex = await this.getNextChunkIndex(db, sessionId);
    
    const chunkData = {
      id: `${sessionId}_chunk_${chunkIndex}`,
      sessionId,
      chunkIndex,
      timestamp: Date.now(),
      sampleCount: samples.length,
      binaryData,
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHUNKS_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CHUNKS_STORE_NAME);
      const request = store.add(chunkData);
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = () => {
        console.error('Error appending chunk:', request.error);
        const error = request.error;
        if (error && (error.name === 'QuotaExceededError' || (error as any).code === 22)) {
          reject(new Error('Storage full! Please delete some sessions.'));
        } else {
          reject(error);
        }
      };
    });
  }
  
  /**
   * Get next chunk index for a session
   */
  private async getNextChunkIndex(db: IDBDatabase, sessionId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHUNKS_STORE_NAME], 'readonly');
      const store = transaction.objectStore(CHUNKS_STORE_NAME);
      const index = store.index('sessionId');
      const request = index.getAll(sessionId);
      
      request.onsuccess = () => {
        const chunks = request.result;
        const maxIndex = chunks.length > 0 
          ? Math.max(...chunks.map((c: any) => c.chunkIndex || 0))
          : -1;
        resolve(maxIndex + 1);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  /**
   * Get all chunks for a session and merge them
   */
  private async getAllSessionChunks(sessionId: string): Promise<any[]> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHUNKS_STORE_NAME], 'readonly');
      const store = transaction.objectStore(CHUNKS_STORE_NAME);
      const index = store.index('sessionId');
      const request = index.getAll(sessionId);
      
      request.onsuccess = () => {
        const chunks = request.result.sort((a: any, b: any) => a.chunkIndex - b.chunkIndex);
        
        // Decode all chunks and merge samples
        const allSamples: any[] = [];
        for (const chunk of chunks) {
          const decoded = this.reader.decode(chunk.binaryData);
          
          // Convert to sample format
          for (const imu of decoded.imuSamples) {
            allSamples.push({
              type: 'imu',
              t: imu.t,
              ax: imu.ax,
              ay: imu.ay,
              az: imu.az,
              gx: imu.gx,
              gy: imu.gy,
              gz: imu.gz,
              mx: imu.mx,
              my: imu.my,
              mz: imu.mz,
            });
          }
          
          for (const gps of decoded.gpsSamples) {
            allSamples.push({
              type: 'gps',
              t: gps.t,
              lat: gps.lat,
              lon: gps.lon,
              speed: gps.speed,
              heading: gps.heading,
              accuracy: gps.accuracy,
            });
          }
        }
        
        // Sort by timestamp
        allSamples.sort((a, b) => (a.t || 0) - (b.t || 0));
        resolve(allSamples);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  /**
   * Delete all chunks for a session
   */
  private async deleteSessionChunks(sessionId: string): Promise<void> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHUNKS_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(CHUNKS_STORE_NAME);
      const index = store.index('sessionId');
      const request = index.openCursor(IDBKeyRange.only(sessionId));
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  /**
   * Get all session metadata (without full sample data)
   */
  async getAllSessionMetadata(): Promise<SessionMetadataStorage[]> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = async () => {
        // Return only metadata, excluding binaryData
        const sessions = await Promise.all(
          request.result.map(async (session: any) => {
            const { binaryData, ...metadata } = session;
            
            // If session uses chunks, update sample count from chunks
            try {
              const chunks = await this.getSessionChunksMetadata(db, metadata.id);
              if (chunks.length > 0) {
                metadata.sampleCount = chunks.reduce((sum, chunk) => sum + chunk.sampleCount, 0);
              }
            } catch (e) {
              // Ignore if chunks don't exist
            }
            
            return metadata;
          })
        );
        resolve(sessions);
      };
      
      request.onerror = () => {
        console.error('Error getting sessions:', request.error);
        reject(request.error);
      };
    });
  }
  
  /**
   * Get chunks metadata only (for counting samples)
   */
  private async getSessionChunksMetadata(db: IDBDatabase, sessionId: string): Promise<Array<{sampleCount: number}>> {
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([CHUNKS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CHUNKS_STORE_NAME);
        const index = store.index('sessionId');
        const request = index.getAll(sessionId);
        
        request.onsuccess = () => {
          const chunks = request.result || [];
          resolve(chunks.map((c: any) => ({ sampleCount: c.sampleCount || 0 })));
        };
        
        request.onerror = () => {
          // If store doesn't exist yet, return empty array (not an error)
          if (request.error?.name === 'NotFoundError' || !db.objectStoreNames.contains(CHUNKS_STORE_NAME)) {
            resolve([]);
          } else {
            reject(request.error);
          }
        };
      } catch (error) {
        // If chunks store doesn't exist, return empty array
        if (!db.objectStoreNames.contains(CHUNKS_STORE_NAME)) {
          resolve([]);
        } else {
          reject(error);
        }
      }
    });
  }
  
  /**
   * Get session metadata only (without samples)
   */
  private async getSessionMetadataOnly(sessionId: string): Promise<SessionMetadataStorage | null> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(sessionId);
      
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        
        const { binaryData, ...metadata } = request.result;
        resolve(metadata);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  /**
   * Update session metadata only (without reading/processing samples)
   * Used for batch saves to update metrics without loading all data
   */
  async updateSessionMetadata(
    sessionId: string,
    metadata: {
      sessionStartTime: number;
      duration: number;
      avgStrokeRate: number;
      avgDrivePercent: number;
      maxSpeed: number;
      totalDistance: number;
      strokeCount: number;
      phoneOrientation?: 'rower' | 'coxswain';
      demoMode?: boolean;
      catchThreshold?: number;
      finishThreshold?: number;
      calibrationData?: any;
    }
  ): Promise<SessionMetadataStorage> {
    const db = await this.ensureDB();
    
    return new Promise(async (resolve, reject) => {
      try {
        // Get existing session metadata
        const existing = await this.getSessionMetadataOnly(sessionId);
        
        // Calculate total sample count from chunks (if using chunks)
        let totalSampleCount = existing?.sampleCount || 0;
        try {
          const chunks = await this.getSessionChunksMetadata(db, sessionId);
          if (chunks && chunks.length > 0) {
            totalSampleCount = chunks.reduce((sum, chunk) => sum + (chunk.sampleCount || 0), 0);
          }
        } catch (e) {
          // If chunks don't exist or error reading, use existing count
          console.warn('Could not read chunks metadata, using existing count:', e);
        }
        
        const timestamp = existing?.timestamp || Date.now();
        const storageData = {
          id: sessionId,
          timestamp,
          sessionStartTime: metadata.sessionStartTime,
          duration: metadata.duration,
          avgStrokeRate: metadata.avgStrokeRate,
          avgDrivePercent: metadata.avgDrivePercent,
          maxSpeed: metadata.maxSpeed,
          totalDistance: metadata.totalDistance,
          strokeCount: metadata.strokeCount,
          phoneOrientation: metadata.phoneOrientation,
          demoMode: metadata.demoMode,
          catchThreshold: metadata.catchThreshold,
          finishThreshold: metadata.finishThreshold,
          hasCalibrationData: !!metadata.calibrationData,
          sampleCount: totalSampleCount,
          dataSize: existing?.dataSize || 0, // Will be updated on final save
        };
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(storageData);
        
        request.onsuccess = () => {
          const { binaryData, ...resultMetadata } = storageData as any;
          resolve(resultMetadata);
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Get full session data including samples
   * Reads from chunks if they exist, otherwise falls back to legacy format
   */
  async getSession(sessionId: string): Promise<SessionFullData | null> {
    const db = await this.ensureDB();
    
    return new Promise(async (resolve, reject) => {
      try {
        // First check if session has chunks (new format)
        const chunks = await this.getAllSessionChunks(sessionId);
        
        if (chunks.length > 0) {
          // New format: read from chunks
          const metadata = await this.getSessionMetadataOnly(sessionId);
          if (!metadata) {
            resolve(null);
            return;
          }
          
          const fullData: SessionFullData = {
            ...metadata,
            samples: chunks,
            calibrationData: undefined, // TODO: Store calibration in metadata
          };
          
          resolve(fullData);
        } else {
          // Legacy format: read from single binary blob
          const transaction = db.transaction([STORE_NAME], 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(sessionId);
          
          request.onsuccess = () => {
            if (!request.result) {
              resolve(null);
              return;
            }
            
            const { binaryData, ...metadata } = request.result;
            
            // Decode binary data back to samples
            const decoded = this.reader.decode(binaryData);
            
            // Convert back to original sample format
            const samples: any[] = [];
            
            for (const imu of decoded.imuSamples) {
              samples.push({
                type: 'imu',
                t: imu.t,
                ax: imu.ax,
                ay: imu.ay,
                az: imu.az,
                gx: imu.gx,
                gy: imu.gy,
                gz: imu.gz,
                mx: imu.mx,
                my: imu.my,
                mz: imu.mz,
              });
            }
            
            for (const gps of decoded.gpsSamples) {
              samples.push({
                type: 'gps',
                t: gps.t,
                lat: gps.lat,
                lon: gps.lon,
                speed: gps.speed,
                heading: gps.heading,
                accuracy: gps.accuracy,
              });
            }
            
            // Sort by timestamp
            samples.sort((a, b) => (a.t || 0) - (b.t || 0));
            
            const fullData: SessionFullData = {
              ...metadata,
              samples,
              calibrationData: decoded.calibration,
            };
            
            resolve(fullData);
          };
          
          request.onerror = () => {
            reject(request.error);
          };
        }
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Update session metadata (for final save - chunks stay as chunks, no merge!)
   * Note: This method is deprecated - use updateSessionMetadata instead
   * Kept for backwards compatibility but no longer merges chunks
   */
  async updateSession(
    sessionId: string,
    sessionData: Omit<SessionFullData, 'id' | 'timestamp' | 'sampleCount' | 'dataSize'>
  ): Promise<SessionMetadataStorage> {
    // Just update metadata - chunks stay as chunks!
    // They'll be merged on-demand when getSession() or getSessionBinary() is called
    return this.updateSessionMetadata(sessionId, {
      sessionStartTime: sessionData.sessionStartTime,
      duration: sessionData.duration,
      avgStrokeRate: sessionData.avgStrokeRate,
      avgDrivePercent: sessionData.avgDrivePercent,
      maxSpeed: sessionData.maxSpeed,
      totalDistance: sessionData.totalDistance,
      strokeCount: sessionData.strokeCount,
      phoneOrientation: sessionData.phoneOrientation,
      demoMode: sessionData.demoMode,
      catchThreshold: sessionData.catchThreshold,
      finishThreshold: sessionData.finishThreshold,
      calibrationData: sessionData.calibrationData,
    });
  }
  
  /**
   * Get binary data for a session (for export)
   * Merges chunks on-demand if session uses chunks
   */
  async getSessionBinary(sessionId: string): Promise<ArrayBuffer | null> {
    const db = await this.ensureDB();
    
    return new Promise(async (resolve, reject) => {
      try {
        // Check if session has chunks (new format)
        const chunks = await this.getAllSessionChunks(sessionId);
        
        if (chunks.length > 0) {
          // New format: merge chunks on-demand to create binary
          const metadata = await this.getSessionMetadataOnly(sessionId);
          if (!metadata) {
            resolve(null);
            return;
          }
          
          // Process all chunks into binary format
          const { binaryData } = this.processSamplesToBinary({
            sessionStartTime: metadata.sessionStartTime,
            duration: metadata.duration,
            samples: chunks,
            avgStrokeRate: metadata.avgStrokeRate,
            avgDrivePercent: metadata.avgDrivePercent,
            maxSpeed: metadata.maxSpeed,
            totalDistance: metadata.totalDistance,
            strokeCount: metadata.strokeCount,
            phoneOrientation: metadata.phoneOrientation,
            demoMode: metadata.demoMode,
            catchThreshold: metadata.catchThreshold,
            finishThreshold: metadata.finishThreshold,
            calibrationData: undefined, // TODO: Store calibration in metadata
          });
          
          resolve(binaryData);
        } else {
          // Legacy format: read from single binary blob
          const transaction = db.transaction([STORE_NAME], 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(sessionId);
          
          request.onsuccess = () => {
            if (!request.result || !request.result.binaryData) {
              resolve(null);
              return;
            }
            resolve(request.result.binaryData);
          };
          
          request.onerror = () => {
            reject(request.error);
          };
        }
      } catch (error) {
        console.error('Error getting session binary:', error);
        reject(error);
      }
    });
  }
  
  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const db = await this.ensureDB();
    
    // Delete chunks first
    await this.deleteSessionChunks(sessionId);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(sessionId);
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = () => {
        console.error('Error deleting session:', request.error);
        reject(request.error);
      };
    });
  }
  
  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<void> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = () => {
        console.error('Error clearing sessions:', request.error);
        reject(request.error);
      };
    });
  }
  
  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{ sessionCount: number; totalSize: number }> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const sessions = request.result;
        const totalSize = sessions.reduce((sum: number, session: any) => {
          return sum + (session.binaryData?.byteLength || 0);
        }, 0);
        
        resolve({
          sessionCount: sessions.length,
          totalSize,
        });
      };
      
      request.onerror = () => {
        console.error('Error getting storage stats:', request.error);
        reject(request.error);
      };
    });
  }
}

// Singleton instance
let storageInstance: IndexedDBStorage | null = null;

export function getIndexedDBStorage(): IndexedDBStorage {
  if (!storageInstance) {
    storageInstance = new IndexedDBStorage();
  }
  return storageInstance;
}

