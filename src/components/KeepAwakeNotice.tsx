import { useCallback, useState } from 'react';
import './KeepAwakeNotice.css';

export const KEEP_AWAKE_INTRO_KEY = 'wrc_keep_awake_intro_seen';

interface KeepAwakeNoticeProps {
  recording: boolean;
  wakeLockSupported: boolean;
  wakeLockActive: boolean;
  interruptionCount: number;
  totalHiddenMs: number;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(KEEP_AWAKE_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen(): void {
  try {
    localStorage.setItem(KEEP_AWAKE_INTRO_KEY, '1');
  } catch {
    // Private mode — the intro will reappear next visit.
  }
}

/**
 * First-run keep-awake help, plus a compact alert if a recording is interrupted.
 *
 * The keep-awake guidance used to sit in the live layout on every session and
 * stole vertical space on phones. It now shows once per device as an intro.
 * Interruption alerts still appear when sensor data was actually lost.
 */
export function KeepAwakeNotice({
  recording,
  wakeLockSupported,
  interruptionCount,
  totalHiddenMs,
}: KeepAwakeNoticeProps) {
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro());

  const dismissIntro = useCallback(() => {
    markIntroSeen();
    setShowIntro(false);
  }, []);

  const showInterruption = recording && interruptionCount > 0;

  if (!showIntro && !showInterruption) return null;

  return (
    <>
      {showIntro && (
        <div className="keep-awake-intro-overlay" role="dialog" aria-labelledby="keep-awake-intro-title" aria-modal="true">
          <div className="keep-awake-intro">
            <h2 id="keep-awake-intro-title">Keep WRC Coach open</h2>
            <p>
              {wakeLockSupported
                ? 'This app keeps the screen awake while you row so sensors stay live.'
                : 'This phone cannot keep the screen awake automatically — leave the screen on while you row.'}
            </p>
            <p>
              Locking the phone or switching apps pauses recording and leaves gaps in the data.
              Keep WRC Coach in the foreground for the whole session.
            </p>
            <button type="button" className="keep-awake-intro-btn" onClick={dismissIntro}>
              Got it
            </button>
          </div>
        </div>
      )}

      {showInterruption && (
        <div className="keep-awake-notice" role="status" aria-live="polite">
          <div className="keep-awake-alert" role="alert">
            ⚠️ Recording interrupted {interruptionCount}{' '}
            {interruptionCount === 1 ? 'time' : 'times'} ({formatDuration(totalHiddenMs)} in the
            background). Sensor data is missing for those gaps.
          </div>
        </div>
      )}
    </>
  );
}
