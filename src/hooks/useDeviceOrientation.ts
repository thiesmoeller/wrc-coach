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
}

/**
 * Hook to access device orientation/compass (available on all phones)
 * Uses DeviceOrientationEvent API which provides compass heading derived from magnetometer
 * Works on iOS Safari and Android Chrome without requiring Generic Sensor API
 */
export function useDeviceOrientation({ enabled, onOrientation }: UseDeviceOrientationOptions): boolean {
  const callbackRef = useRef(onOrientation);
  const permissionRequestedRef = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const hasReceivedDataRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

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
      return;
    }

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
  }, [enabled, handleOrientation]);

  return isActive;
}

