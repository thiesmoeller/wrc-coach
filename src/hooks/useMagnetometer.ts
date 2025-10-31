import { useEffect, useRef } from 'react';

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
 */
export function useMagnetometer({ enabled, frequency = 60, onMagnetometer }: UseMagnetometerOptions) {
  const sensorRef = useRef<any | null>(null);
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Feature-detect Magnetometer (Generic Sensor API). Not available on iOS Safari.
    const MagnetometerCtor: any = (window as any).Magnetometer;
    if (!MagnetometerCtor) {
      console.log('[Magnetometer] Not supported on this platform');
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

        const sensor = new MagnetometerCtor({ frequency });
        sensorRef.current = sensor;
        
        let sampleCount = 0;

        sensor.addEventListener('reading', () => {
          const t = performance.now();
          const mx = Number.isFinite(sensor.x) ? sensor.x : 0;
          const my = Number.isFinite(sensor.y) ? sensor.y : 0;
          const mz = Number.isFinite(sensor.z) ? sensor.z : 0;
          
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
          
          // Common error: permission denied
          if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
            console.error('[Magnetometer] Permission denied or security error. Ensure HTTPS and proper Permissions-Policy header.');
          }
        });

        sensor.start();
        console.log('[Magnetometer] Started successfully');
      } catch (err: any) {
        console.error('[Magnetometer] Failed to start:', err);
        
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
      if (sensorRef.current) {
        try {
          sensorRef.current.stop();
          console.log('[Magnetometer] Stopped');
        } catch {}
        sensorRef.current = null;
      }
    };
  }, [enabled, frequency, onMagnetometer]);
}


