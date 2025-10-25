import { useEffect, useRef } from 'react';

/**
 * Hook to request and maintain screen wake lock
 * Prevents the screen from dimming during rowing sessions
 * Automatically re-acquires wake lock if it's released (e.g., when user switches tabs)
 */
export function useWakeLock() {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          console.debug('✅ Wake lock acquired');
          
          // Re-acquire wake lock if it's released
          wakeLockRef.current.addEventListener('release', () => {
            console.warn('⚠️ Wake lock released, will re-acquire on visibility change');
            wakeLockRef.current = null;
          });
        }
      } catch (error) {
        // Silent fail - wake lock is optional
        console.warn('❌ Wake lock request failed:', error);
      }
    }

    // Initial wake lock request
    requestWakeLock();

    // Re-acquire wake lock when page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        console.log('🔄 Page visible again, re-acquiring wake lock...');
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Release wake lock on cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, []);

  return wakeLockRef.current;
}

