import { useEffect, useRef, useState, useCallback } from 'react';

export interface OrientationData {
  t: number;
  alpha: number; // Compass heading (0-360° around z-axis)
  beta: number;  // Front-back tilt (-180 to 180°)
  gamma: number; // Left-right tilt (-90 to 90°)
}

export interface UseDeviceOrientationOptions {
  enabled: boolean;
  onOrientation: (data: OrientationData) => void;
  demoMode?: boolean;
}

/**
 * Hook to access device orientation/compass (available on all phones)
 * Uses DeviceOrientationEvent API which provides compass heading derived from magnetometer
 * Works on iOS Safari and Android Chrome without requiring Generic Sensor API
 * Supports demo mode for testing without actual device orientation
 */
export function useDeviceOrientation({ enabled, onOrientation, demoMode = false }: UseDeviceOrientationOptions): boolean {
  const callbackRef = useRef(onOrientation);
  const permissionRequestedRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const hasReceivedDataRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const demoIntervalRef = useRef<number | null>(null);

  callbackRef.current = onOrientation;

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const t = performance.now();
    
    // alpha: compass heading (0-360°), beta: front-back tilt, gamma: left-right tilt
    const alpha = event.alpha !== null ? event.alpha : 0;
    const beta = event.beta !== null ? event.beta : 0;
    const gamma = event.gamma !== null ? event.gamma : 0;
    
    // Mark as active after first reading
    if (!hasReceivedDataRef.current) {
      hasReceivedDataRef.current = true;
      setIsActive(true);
      console.log('[DeviceOrientation] First reading received, compass is active');
      
      // Clear timeout if set
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
    
    callbackRef.current({
      t,
      alpha,
      beta,
      gamma,
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsActive(false);
      hasReceivedDataRef.current = false;
      // Clear demo interval if disabled
      if (demoIntervalRef.current !== null) {
        clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
      return;
    }

    // Demo mode: simulate orientation data
    if (demoMode) {
      // Clear any existing interval first
      if (demoIntervalRef.current !== null) {
        clearInterval(demoIntervalRef.current);
        demoIntervalRef.current = null;
      }
      
      // Simulate realistic orientation data
      // Alpha (compass heading): slowly rotating around (0-360°)
      // Beta (front-back tilt): slight variations during rowing motion
      // Gamma (left-right tilt): boat roll during strokes
      let alpha = 90; // Start facing east
      let alphaDirection = 1; // Rotate slowly
      let beta = 0; // Level
      let gamma = 0; // No roll
      
      hasReceivedDataRef.current = false;
      setIsActive(false);
      
      // Orientation updates at ~10 Hz (similar to real device)
      const sampleRate = 10; // Hz
      const dt = 1000 / sampleRate; // ms between samples
      
      demoIntervalRef.current = window.setInterval(() => {
        const t = performance.now();
        
        // Slowly rotate compass heading (1 degree per second)
        alpha += alphaDirection * (360 / (60 * sampleRate)); // 1 deg/sec
        if (alpha >= 360) alpha -= 360;
        if (alpha < 0) alpha += 360;
        
        // Simulate slight tilt variations (boat rocking)
        const strokePhase = (t / 2400) % 1; // 2400ms = 25 SPM stroke period
        beta = Math.sin(strokePhase * Math.PI * 2) * 2; // ±2° front-back tilt
        gamma = Math.sin(strokePhase * Math.PI * 2 + Math.PI / 2) * 1.5; // ±1.5° left-right roll
        
        // Mark as active after first reading
        if (!hasReceivedDataRef.current) {
          hasReceivedDataRef.current = true;
          setIsActive(true);
          console.log('[DeviceOrientation] Demo mode: Compass is active');
        }
        
        callbackRef.current({
          t,
          alpha,
          beta,
          gamma,
        });
      }, dt);
      
      return () => {
        if (demoIntervalRef.current !== null) {
          clearInterval(demoIntervalRef.current);
          demoIntervalRef.current = null;
        }
        setIsActive(false);
        hasReceivedDataRef.current = false;
      };
    }

    // Real device orientation mode
    // Check if DeviceOrientationEvent is available
    if (typeof DeviceOrientationEvent === 'undefined') {
      console.log('[DeviceOrientation] Not supported on this platform');
      setIsActive(false);
      return;
    }

    async function setupOrientation() {
      try {
        // Request permission on iOS Safari (required since iOS 13)
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
          if (!permissionRequestedRef.current) {
            try {
              const response = await (DeviceOrientationEvent as any).requestPermission();
              permissionRequestedRef.current = true;
              
              if (response !== 'granted') {
                console.warn('[DeviceOrientation] Permission denied');
                setIsActive(false);
                return;
              }
            } catch (error) {
              console.error('[DeviceOrientation] Error requesting permission:', error);
              setIsActive(false);
              return;
            }
          }
        }

        // Reset state
        hasReceivedDataRef.current = false;
        setIsActive(false);

        // Add event listener
        window.addEventListener('deviceorientation', handleOrientation);
        console.log('[DeviceOrientation] Event listener added, waiting for data...');

        // Set timeout to detect if no data arrives
        timeoutRef.current = window.setTimeout(() => {
          if (!hasReceivedDataRef.current) {
            console.warn('[DeviceOrientation] No readings received after 5 seconds');
            console.warn('[DeviceOrientation] Check browser permissions and device support');
          }
        }, 5000);
      } catch (err: any) {
        console.error('[DeviceOrientation] Failed to setup:', err);
        setIsActive(false);
      }
    }

    setupOrientation();

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      window.removeEventListener('deviceorientation', handleOrientation);
      setIsActive(false);
      hasReceivedDataRef.current = false;
    };
  }, [enabled, demoMode, handleOrientation]);

  return isActive;
}

