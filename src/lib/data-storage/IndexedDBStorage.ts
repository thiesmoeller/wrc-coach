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
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

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
  // Data size info
  sampleCount: number;
  dataSize: number; // Size in bytes
}

export interface SessionFullData extends SessionMetadataStorage {
  // Full data (stored in IndexedDB, not in localStorage)
  samples: any[];
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
   * Save a session to IndexedDB
   */
  async saveSession(sessionData: Omit<SessionFullData, 'id' | 'timestamp' | 'sampleCount' | 'dataSize'>): Promise<SessionMetadataStorage> {
    const db = await this.ensureDB();
    
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    
    // Separate IMU and GPS samples
    const imuSamples: IMUSample[] = [];
    const gpsSamples: GPSSample[] = [];
    
    for (const sample of sessionData.samples) {
      if (sample.type === 'imu') {
        imuSamples.push({
          t: sample.timestamp,
          ax: sample.ax,
          ay: sample.ay,
          az: sample.az,
          gx: sample.gx,
          gy: sample.gy,
          gz: sample.gz,
        });
      } else if (sample.type === 'gps') {
        gpsSamples.push({
          t: sample.timestamp,
          lat: sample.lat,
          lon: sample.lon,
          speed: sample.speed,
          heading: sample.heading,
          accuracy: sample.accuracy,
        });
      }
    }
    
    // Create binary data (V3 format - no calibration, no thresholds)
    const metadata: SessionMetadata = {
      sessionStart: sessionData.sessionStartTime,
      phoneOrientation: sessionData.phoneOrientation,
      demoMode: sessionData.demoMode,
    };
    
    const binaryData = this.writer.encode(imuSamples, gpsSamples, metadata);
    
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
      
      request.onsuccess = () => {
        // Return only metadata, excluding binaryData
        const sessions = request.result.map((session: any) => {
          const { binaryData, ...metadata } = session;
          return metadata;
        });
        resolve(sessions);
      };
      
      request.onerror = () => {
        console.error('Error getting sessions:', request.error);
        reject(request.error);
      };
    });
  }
  
  /**
   * Get full session data including samples
   */
  async getSession(sessionId: string): Promise<SessionFullData | null> {
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
        
        // Decode binary data back to samples
        const decoded = this.reader.decode(binaryData);
        
        // Convert back to original sample format
        const samples: any[] = [];
        
        for (const imu of decoded.imuSamples) {
          samples.push({
            type: 'imu',
            timestamp: imu.t,
            ax: imu.ax,
            ay: imu.ay,
            az: imu.az,
            gx: imu.gx,
            gy: imu.gy,
            gz: imu.gz,
          });
        }
        
        for (const gps of decoded.gpsSamples) {
          samples.push({
            type: 'gps',
            timestamp: gps.t,
            lat: gps.lat,
            lon: gps.lon,
            speed: gps.speed,
            heading: gps.heading,
            accuracy: gps.accuracy,
          });
        }
        
        // Sort by timestamp
        samples.sort((a, b) => a.timestamp - b.timestamp);
        
        const fullData: SessionFullData = {
          ...metadata,
          samples,
          calibrationData: decoded.calibration,
        };
        
        resolve(fullData);
      };
      
      request.onerror = () => {
        console.error('Error getting session:', request.error);
        reject(request.error);
      };
    });
  }
  
  /**
   * Get binary data for a session (for export)
   */
  async getSessionBinary(sessionId: string): Promise<ArrayBuffer | null> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
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
        console.error('Error getting session binary:', request.error);
        reject(request.error);
      };
    });
  }
  
  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const db = await this.ensureDB();
    
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

