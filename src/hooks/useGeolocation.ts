import { useEffect, useRef, useCallback } from 'react';

export interface GPSData {
  t: number;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  accuracy: number;
}

export interface UseGeolocationOptions {
  onPosition: (data: GPSData) => void;
  enabled: boolean;
  demoMode?: boolean;
}

/**
 * Hook to access device GPS
 * Supports demo mode for testing without actual GPS
 */
export function useGeolocation({ onPosition, enabled, demoMode = false }: UseGeolocationOptions) {
  const callbackRef = useRef(onPosition);
  const watchIdRef = useRef<number | null>(null);
  const demoIntervalRef = useRef<number | null>(null);

  callbackRef.current = onPosition;

  const handlePosition = useCallback((position: GeolocationPosition) => {
    const t = position.timestamp;
    const { latitude, longitude, speed, heading, accuracy } = position.coords;
    
    callbackRef.current({
      t,
      lat: latitude,
      lon: longitude,
      speed: speed || 0,
      heading: heading || 0,
      accuracy: accuracy || 0,
    });
  }, []);

  const handleError = useCallback((error: GeolocationPositionError) => {
    console.warn('GPS error:', error.message);
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Clear existing watch if disabling
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (demoIntervalRef.current !== null) {
        clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
      return;
    }

    // Demo mode: simulate GPS at typical rowing speed
    if (demoMode) {
      // Clear any existing GPS watch first
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      // Clear any existing interval
      if (demoIntervalRef.current !== null) {
        clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
      
      // Hamburg, Wilhelmsburg area starting point
      let lat = 53.5;
      let lon = 10.0;
      const speed = 4.0; // m/s (~14 km/h, typical rowing speed)
      const heading = 90; // East
      
      // Update at ~1 Hz like real GPS
      demoIntervalRef.current = window.setInterval(() => {
        const t = performance.now();
        
        // Simulate movement (very rough approximation)
        // 1 degree latitude ≈ 111 km, longitude varies by latitude
        const deltaLat = 0;
        const deltaLon = (speed * 0.001) / (111 * Math.cos(lat * Math.PI / 180)); // Convert m/s to degrees
        
        lat += deltaLat;
        lon += deltaLon;
        
        // Add small random variations to speed
        const speedVariation = speed + (Math.random() - 0.5) * 0.3;
        
        callbackRef.current({
          t,
          lat,
          lon,
          speed: speedVariation,
          heading,
          accuracy: 5.0, // Good accuracy
        });
      }, 1000); // 1 Hz
      
      return () => {
        if (demoIntervalRef.current !== null) {
          clearInterval(demoIntervalRef.current);
          demoIntervalRef.current = null;
        }
      };
    }

    // Real GPS mode
    // Clear any existing interval first
    if (demoIntervalRef.current !== null) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }
    
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, demoMode, handlePosition, handleError]);
}

