import { useEffect, useRef, useState } from 'react';

export interface WakeLockState {
  /** Whether the Screen Wake Lock API is available in this browser. */
  isSupported: boolean;
  /** Whether the screen wake lock is currently held. */
  isActive: boolean;
}

/**
 * Hook to request and maintain a screen wake lock.
 *
 * Prevents the screen from dimming/auto-locking during a rowing session and
 * automatically re-acquires the lock when the page becomes visible again (the
 * browser releases screen wake locks whenever the page is hidden).
 *
 * Note: a screen wake lock only keeps the *foreground* page awake. It does not
 * enable background execution — if the athlete manually locks the phone or
 * switches apps, sensor delivery still stops. The returned `isSupported`/
 * `isActive` flags let the UI tell the athlete whether the screen is being kept
 * awake, and prompt them to keep the app open.
 */
export function useWakeLock(): WakeLockState {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!isSupported) return;

    let cancelled = false;

    async function requestWakeLock() {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release?.();
          return;
        }
        wakeLockRef.current = sentinel;
        setIsActive(true);
        console.debug('✅ Wake lock acquired');

        sentinel.addEventListener('release', () => {
          console.warn('⚠️ Wake lock released, will re-acquire on visibility change');
          wakeLockRef.current = null;
          setIsActive(false);
        });
      } catch (error) {
        // Silent fail - wake lock is optional.
        setIsActive(false);
        console.warn('❌ Wake lock request failed:', error);
      }
    }

    requestWakeLock();

    // Re-acquire the wake lock when the page becomes visible again.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        console.log('🔄 Page visible again, re-acquiring wake lock...');
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [isSupported]);

  return { isSupported, isActive };
}
