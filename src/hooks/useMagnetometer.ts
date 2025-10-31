import { useEffect, useRef, useState } from 'react';

export interface MagnetometerData {
  t: number;
  mx: number; // microtesla
  my: number;
  mz: number;
}

export interface UseMagnetometerOptions {
  enabled: boolean;
  frequency?: number; // Hz
  onMagnetometer: (data: MagnetometerData) => void;
}

/**
 * Hook to read magnetometer on platforms that support Generic Sensor API (Android/Chrome).
 * On iOS/Safari (no Magnetometer API), this will safely no-op.
 * Returns true if the magnetometer is active and running.
 */
export function useMagnetometer({ enabled, frequency = 60, onMagnetometer }: UseMagnetometerOptions): boolean {
  const sensorRef = useRef<any | null>(null);
  const permissionRequestedRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const hasReceivedDataRef = useRef(false);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsActive(false);
      return;
    }

    // Feature-detect Magnetometer (Generic Sensor API). Not available on iOS Safari.
    const MagnetometerCtor: any = (window as any).Magnetometer;
    
    console.log('[Magnetometer] Feature detection:', {
      Magnetometer: typeof MagnetometerCtor !== 'undefined',
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    });
    
    if (!MagnetometerCtor) {
      console.log('[Magnetometer] Generic Sensor API not available on this platform');
      console.log('[Magnetometer] This may be due to:');
      console.log('  - Browser not supporting Generic Sensor API');
      console.log('  - Device not having a magnetometer');
      console.log('  - Chrome version too old (< 67)');
      setIsActive(false);
      return; // no-op if unsupported
    }

    // Reset state for new setup
    hasReceivedDataRef.current = false;
    
    async function setupMagnetometer() {
      try {
        // Request permission if needed (Generic Sensor API may require permissions)
        if (navigator.permissions && !permissionRequestedRef.current) {
          try {
            // Check if permission is already granted
            const status = await navigator.permissions.query({ name: 'magnetometer' as PermissionName });
            permissionRequestedRef.current = true;
            
            if (status.state === 'denied') {
              console.warn('[Magnetometer] Permission denied');
              setIsActive(false);
              return;
            }
            
            if (status.state === 'prompt') {
              console.log('[Magnetometer] Permission prompt will appear');
            }
          } catch (permErr) {
            // Permission API might not be available or magnetometer permission not queryable
            // This is OK - some browsers handle permissions differently
            console.log('[Magnetometer] Permission check not available, proceeding anyway');
          }
        }

        // Chrome limits magnetometer to 10Hz max for privacy reasons
        // Using higher frequencies may cause errors or be silently clamped
        const safeFrequency = Math.min(frequency, 10);
        if (frequency > 10) {
          console.warn(`[Magnetometer] Requested frequency ${frequency}Hz exceeds Chrome's 10Hz limit. Using 10Hz.`);
        }

        const sensor = new MagnetometerCtor({ frequency: safeFrequency });
        sensorRef.current = sensor;
        
        let sampleCount = 0;

        sensor.addEventListener('reading', () => {
          const t = performance.now();
          const mx = Number.isFinite(sensor.x) ? sensor.x : 0;
          const my = Number.isFinite(sensor.y) ? sensor.y : 0;
          const mz = Number.isFinite(sensor.z) ? sensor.z : 0;
          
          // Mark as active only after we receive actual data
          if (!hasReceivedDataRef.current) {
            hasReceivedDataRef.current = true;
            setIsActive(true);
            console.log('[Magnetometer] First reading received, sensor is active');
            // Clear timeout if set
            if (timeoutRef.current !== null) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
          }
          
          // Log first few samples for debugging
          if (sampleCount < 3) {
            console.log(`[Magnetometer] Sample ${sampleCount + 1}: mx=${mx.toFixed(2)}, my=${my.toFixed(2)}, mz=${mz.toFixed(2)} µT`);
            sampleCount++;
          }
          
          onMagnetometer({ t, mx, my, mz });
        });

        sensor.addEventListener('error', (event: any) => {
          const error = event?.error || event;
          console.error('[Magnetometer] Sensor error:', error);
          console.error('[Magnetometer] Error details:', {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            stack: error?.stack,
          });
          setIsActive(false);
          
          // Common error: permission denied
          if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
            console.error('[Magnetometer] Permission denied or security error. Ensure:');
            console.error('  1. Site is served over HTTPS (or localhost)');
            console.error('  2. Permissions-Policy header/meta tag allows magnetometer');
            console.error('  3. User has granted sensor permissions');
          } else if (error?.name === 'NotReadableError') {
            console.error('[Magnetometer] Sensor not readable. May be in use by another app or hardware issue.');
          } else if (error?.name === 'NotSupportedError') {
            console.error('[Magnetometer] Sensor not supported. Device may not have a magnetometer.');
          } else {
            console.error('[Magnetometer] Unknown error. Check browser console for details.');
          }
        });

        sensor.addEventListener('activate', () => {
          console.log('[Magnetometer] Sensor activated - waiting for first reading...');
          // Don't mark as active yet - wait for first reading
        });

        try {
          sensor.start();
          console.log(`[Magnetometer] Start requested (frequency: ${safeFrequency}Hz)`);
          console.log('[Magnetometer] Waiting for sensor activation and first reading...');
          
          // Set a timeout to detect if sensor starts but never sends data
          timeoutRef.current = window.setTimeout(() => {
            if (!hasReceivedDataRef.current) {
              console.warn('[Magnetometer] Sensor started but no readings received after 5 seconds');
              console.warn('[Magnetometer] This may indicate:');
              console.warn('  - Device does not have a magnetometer');
              console.warn('  - Sensor is disabled in device settings');
              console.warn('  - Chrome does not expose magnetometer on this device');
              console.warn('  - Permissions issue preventing sensor activation');
            }
          }, 5000);
        } catch (startErr: any) {
          console.error('[Magnetometer] Failed to start sensor:', startErr);
          console.error('[Magnetometer] Error details:', {
            name: startErr?.name,
            message: startErr?.message,
            stack: startErr?.stack,
          });
          setIsActive(false);
        }
      } catch (err: any) {
        console.error('[Magnetometer] Failed to start:', err);
        setIsActive(false);
        
        // Provide helpful error messages
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          console.error('[Magnetometer] Permission denied. Ensure:');
          console.error('  1. Site is served over HTTPS');
          console.error('  2. Permissions-Policy header allows magnetometer');
          console.error('  3. User has granted sensor permissions');
        }
      }
    }

    setupMagnetometer();

    return () => {
      setIsActive(false);
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (sensorRef.current) {
        try {
          sensorRef.current.stop();
          console.log('[Magnetometer] Stopped');
        } catch {}
        sensorRef.current = null;
      }
    };
  }, [enabled, frequency, onMagnetometer]);

  return isActive;
}


