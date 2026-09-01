import { useCallback, useEffect, useRef, useState } from 'react';
import { InterruptionTracker, type Interruption } from '../lib/session';

export interface BackgroundInterruptionsState {
  /** Number of times the page went to the background during the session. */
  count: number;
  /** Total time (ms) the page spent hidden during the session. */
  totalHiddenMs: number;
  /** True while the page is currently hidden. */
  isHidden: boolean;
  /** True once at least one interruption has occurred. */
  wasInterrupted: boolean;
  interruptions: Interruption[];
}

const EMPTY: BackgroundInterruptionsState = {
  count: 0,
  totalHiddenMs: 0,
  isHidden: false,
  wasInterrupted: false,
  interruptions: [],
};

/**
 * Tracks page-visibility interruptions while `active` (i.e. while recording).
 *
 * Because a backgrounded PWA cannot read the motion/orientation/GPS sensors,
 * any time spent hidden during a session is a gap in the data. This hook
 * surfaces those gaps to the UI so the athlete knows their recording was
 * interrupted and by how much. It resets automatically each time a session
 * starts (`active` transitions to true).
 */
export function useBackgroundInterruptions(active: boolean): BackgroundInterruptionsState {
  const trackerRef = useRef(new InterruptionTracker());
  const [state, setState] = useState<BackgroundInterruptionsState>(EMPTY);

  const sync = useCallback(() => {
    const t = trackerRef.current;
    setState({
      count: t.getCount(),
      totalHiddenMs: t.getTotalHiddenMs(Date.now()),
      isHidden: t.isHidden(),
      wasInterrupted: t.getCount() > 0,
      interruptions: t.getInterruptions(),
    });
  }, []);

  // Reset the tracker whenever a new session begins.
  useEffect(() => {
    if (active) {
      trackerRef.current.reset();
      sync();
    }
  }, [active, sync]);

  useEffect(() => {
    if (!active) return;

    const handleVisibility = () => {
      const hidden =
        (typeof document !== 'undefined' &&
          (document.visibilityState === 'hidden' || document.hidden)) === true;
      if (hidden) {
        trackerRef.current.markHidden(Date.now());
      } else {
        trackerRef.current.markVisible(Date.now());
      }
      sync();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [active, sync]);

  return active ? state : EMPTY;
}
