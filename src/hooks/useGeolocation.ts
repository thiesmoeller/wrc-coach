import { useEffect, useRef, useCallback } from 'react';
import { demoSource, DEFAULT_DEMO_SCENARIO, type DemoScenario } from '../lib/demo';
import { gpsFixTimeOnImuClock } from '../lib/sensors/gpsFixTime';

export interface GPSData {
  /** Time of the fix on the `performance.now()` clock, the same clock as the IMU samples. */
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
  demoScenario?: DemoScenario;
}

/**
 * Hook to access device GPS
 * Supports demo mode for testing without actual GPS
 */
export function useGeolocation({
  onPosition,
  enabled,
  demoMode = false,
  demoScenario = DEFAULT_DEMO_SCENARIO,
}: UseGeolocationOptions) {
  const callbackRef = useRef(onPosition);
  const watchIdRef = useRef<number | null>(null);

  callbackRef.current = onPosition;

  const handlePosition = useCallback((position: GeolocationPosition) => {
    const t = gpsFixTimeOnImuClock(position.timestamp, Date.now(), performance.now());
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
    if (!enabled) return;

    if (demoMode) {
      return demoSource.subscribe(demoScenario, {
        onGps: (fix) =>
          callbackRef.current({
            t: fix.t,
            lat: fix.lat,
            lon: fix.lon,
            speed: fix.speed,
            heading: fix.heading,
            accuracy: fix.accuracy,
          }),
      });
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
  }, [enabled, demoMode, demoScenario, handlePosition, handleError]);
}
