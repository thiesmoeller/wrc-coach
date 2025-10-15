import { useEffect, useRef } from 'react';

/**
 * Hook to request and maintain screen wake lock
 * Prevents the screen from dimming during rowing sessions
 */
export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.debug('Wake lock acquired');
        }
      } catch (error) {
        // Silent fail - wake lock is optional
        console.warn('Wake lock request failed:', error);
      }
    }

    requestWakeLock();

    // Release wake lock on cleanup
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, []);

  return wakeLockRef.current;
}

