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
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsActive(false);
      return;
    }

    // Feature-detect Magnetometer (Generic Sensor API). Not available on iOS Safari.
    const MagnetometerCtor: any = (window as any).Magnetometer;
    if (!MagnetometerCtor) {
      console.log('[Magnetometer] Not supported on this platform');
      setIsActive(false);
      return; // no-op if unsupported
    }

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
        let hasReceivedData = false;

        sensor.addEventListener('reading', () => {
          const t = performance.now();
          const mx = Number.isFinite(sensor.x) ? sensor.x : 0;
          const my = Number.isFinite(sensor.y) ? sensor.y : 0;
          const mz = Number.isFinite(sensor.z) ? sensor.z : 0;
          
          // Mark as active only after we receive actual data
          if (!hasReceivedData) {
            hasReceivedData = true;
            setIsActive(true);
            console.log('[Magnetometer] First reading received, sensor is active');
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
          setIsActive(false);
          
          // Common error: permission denied
          if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
            console.error('[Magnetometer] Permission denied or security error. Ensure:');
            console.error('  1. Site is served over HTTPS (or localhost)');
            console.error('  2. Permissions-Policy header/meta tag allows magnetometer');
            console.error('  3. User has granted sensor permissions');
          } else if (error?.name === 'NotReadableError') {
            console.error('[Magnetometer] Sensor not readable. May be in use by another app or hardware issue.');
          }
        });

        sensor.addEventListener('activate', () => {
          console.log('[Magnetometer] Sensor activated');
          // Don't mark as active yet - wait for first reading
        });

        try {
          sensor.start();
          console.log(`[Magnetometer] Start requested (frequency: ${safeFrequency}Hz)`);
          // Don't mark as active yet - wait for first reading or activation event
        } catch (startErr: any) {
          console.error('[Magnetometer] Failed to start sensor:', startErr);
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


