import { useState, useCallback, useEffect } from 'react';
import { getIndexedDBStorage, SessionMetadataStorage, SessionFullData } from '../lib/data-storage/IndexedDBStorage';

export interface SessionData {
  id: string;
  timestamp: number;
  duration: number;
  samples: any[];
  sessionStartTime: number;
  // Analysis data
  avgStrokeRate: number;
  avgDrivePercent: number;
  maxSpeed: number;
  totalDistance: number;
  strokeCount: number;
  // Settings used during recording
  phoneOrientation?: 'rower' | 'coxswain';
  demoMode?: boolean;
  // Size info
  sampleCount?: number;
  dataSize?: number;
}

const OLD_STORAGE_KEY = 'wrc_coach_sessions';
const MIGRATION_KEY = 'wrc_coach_migrated_to_indexeddb';

export function useSessionStorage() {
  const [sessions, setSessions] = useState<SessionMetadataStorage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const storage = getIndexedDBStorage();

  // Load sessions from IndexedDB on mount
  useEffect(() => {
    async function loadSessions() {
      try {
        // Initialize IndexedDB
        await storage.init();
        
        // Check if we need to migrate from localStorage
        const alreadyMigrated = localStorage.getItem(MIGRATION_KEY);
        if (!alreadyMigrated) {
          await migrateFromLocalStorage();
          localStorage.setItem(MIGRATION_KEY, 'true');
        }
        
        // Load sessions from IndexedDB
        const metadata = await storage.getAllSessionMetadata();
        setSessions(metadata);
      } catch (error) {
        console.error('Error loading sessions:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadSessions();
  }, []);

  // Migrate old localStorage sessions to IndexedDB
  const migrateFromLocalStorage = async () => {
    try {
      const oldData = localStorage.getItem(OLD_STORAGE_KEY);
      if (!oldData) return;
      
      const oldSessions: SessionData[] = JSON.parse(oldData);
      console.log(`Migrating ${oldSessions.length} sessions from localStorage to IndexedDB...`);
      
      for (const oldSession of oldSessions) {
        try {
          await storage.saveSession({
            sessionStartTime: oldSession.sessionStartTime,
            duration: oldSession.duration,
            samples: oldSession.samples,
            avgStrokeRate: oldSession.avgStrokeRate,
            avgDrivePercent: oldSession.avgDrivePercent,
            maxSpeed: oldSession.maxSpeed,
            totalDistance: oldSession.totalDistance,
            strokeCount: oldSession.strokeCount,
            phoneOrientation: oldSession.phoneOrientation,
            demoMode: oldSession.demoMode,
          });
        } catch (error) {
          console.error('Error migrating session:', error);
        }
      }
      
      // Clear old localStorage data
      localStorage.removeItem(OLD_STORAGE_KEY);
      console.log('Migration complete!');
    } catch (error) {
      console.error('Error during migration:', error);
    }
  };

  const saveSession = useCallback(async (sessionData: Omit<SessionData, 'id' | 'timestamp'>) => {
    try {
      const metadata = await storage.saveSession({
        sessionStartTime: sessionData.sessionStartTime,
        duration: sessionData.duration,
        samples: sessionData.samples,
        avgStrokeRate: sessionData.avgStrokeRate,
        avgDrivePercent: sessionData.avgDrivePercent,
        maxSpeed: sessionData.maxSpeed,
        totalDistance: sessionData.totalDistance,
        strokeCount: sessionData.strokeCount,
        phoneOrientation: sessionData.phoneOrientation,
        demoMode: sessionData.demoMode,
      });

      setSessions(prev => [...prev, metadata]);
      return { ...metadata, samples: [] };
    } catch (error) {
      console.error('Error saving session:', error);
      alert('Error saving session. Please try again or delete old sessions.');
      throw error;
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await storage.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }, []);

  const clearAllSessions = useCallback(async () => {
    try {
      await storage.clearAllSessions();
      setSessions([]);
    } catch (error) {
      console.error('Error clearing sessions:', error);
    }
  }, []);

  const getSession = useCallback(async (sessionId: string): Promise<SessionFullData | null> => {
    try {
      return await storage.getSession(sessionId);
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }, []);

  const getSessionBinary = useCallback(async (sessionId: string): Promise<ArrayBuffer | null> => {
    try {
      return await storage.getSessionBinary(sessionId);
    } catch (error) {
      console.error('Error getting session binary:', error);
      return null;
    }
  }, []);

  const getStorageStats = useCallback(async () => {
    try {
      return await storage.getStorageStats();
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { sessionCount: 0, totalSize: 0 };
    }
  }, []);

  return {
    sessions,
    isLoading,
    saveSession,
    deleteSession,
    clearAllSessions,
    getSession,
    getSessionBinary,
    getStorageStats,
  };
}

