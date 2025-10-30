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

  useEffect(() => {
    if (!enabled) return;

    // Feature-detect Magnetometer (Generic Sensor API). Not available on iOS Safari.
    const MagnetometerCtor: any = (window as any).Magnetometer;
    if (!MagnetometerCtor) {
      return; // no-op if unsupported
    }

    try {
      const sensor = new MagnetometerCtor({ frequency });
      sensorRef.current = sensor;

      sensor.addEventListener('reading', () => {
        const t = performance.now();
        const mx = Number.isFinite(sensor.x) ? sensor.x : 0;
        const my = Number.isFinite(sensor.y) ? sensor.y : 0;
        const mz = Number.isFinite(sensor.z) ? sensor.z : 0;
        onMagnetometer({ t, mx, my, mz });
      });

      sensor.addEventListener('error', (event: any) => {
        console.error('Magnetometer error:', event?.error || event);
      });

      sensor.start();
    } catch (err) {
      console.error('Failed to start Magnetometer:', err);
    }

    return () => {
      if (sensorRef.current) {
        try { sensorRef.current.stop(); } catch {}
        sensorRef.current = null;
      }
    };
  }, [enabled, frequency, onMagnetometer]);
}


