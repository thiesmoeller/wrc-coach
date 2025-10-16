import { useState, useCallback } from 'react';

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
  catchThreshold?: number;
  finishThreshold?: number;
  calibrationData?: any;
}

const STORAGE_KEY = 'wrc_coach_sessions';

export function useSessionStorage() {
  const [sessions, setSessions] = useState<SessionData[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading sessions:', error);
      return [];
    }
  });

  const saveSession = useCallback((sessionData: Omit<SessionData, 'id' | 'timestamp'>) => {
    const newSession: SessionData = {
      ...sessionData,
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    setSessions(prev => {
      const updated = [...prev, newSession];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Error saving session:', error);
        // If storage is full, remove oldest session and try again
        const trimmed = updated.slice(1);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
          return trimmed;
        } catch {
          alert('Storage full! Please delete some sessions.');
          return prev;
        }
      }
      return updated;
    });

    return newSession;
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Error deleting session:', error);
      }
      return updated;
    });
  }, []);

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing sessions:', error);
    }
  }, []);

  const getSession = useCallback((sessionId: string) => {
    return sessions.find(s => s.id === sessionId);
  }, [sessions]);

  return {
    sessions,
    saveSession,
    deleteSession,
    clearAllSessions,
    getSession,
  };
}

