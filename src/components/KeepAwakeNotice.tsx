import './KeepAwakeNotice.css';

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

/**
 * On-screen guidance shown while recording. Because a backgrounded web app can't
 * read the phone's sensors, the athlete must keep WRC Coach open. This notice
 * (1) tells them the screen is being kept awake and to keep the app in the
 * foreground, and (2) flags any interruptions that already happened so missing
 * data is visible rather than silent.
 */
export function KeepAwakeNotice({
  recording,
  wakeLockSupported,
  wakeLockActive,
  interruptionCount,
  totalHiddenMs,
}: KeepAwakeNoticeProps) {
  if (!recording) return null;

  const statusClass = wakeLockActive ? 'ok' : 'warn';
  const statusText = wakeLockActive
    ? 'Screen kept awake'
    : wakeLockSupported
      ? 'Keeping screen awake…'
      : 'Screen-awake unavailable — keep your screen on';

  return (
    <div className="keep-awake-notice" role="status" aria-live="polite">
      <div className="keep-awake-row">
        <span className={`keep-awake-dot ${statusClass}`} aria-hidden="true" />
        <span className="keep-awake-status">{statusText}</span>
        <span className="keep-awake-hint">
          Keep WRC Coach open — locking the screen or switching apps pauses recording.
        </span>
      </div>

      {interruptionCount > 0 && (
        <div className="keep-awake-alert" role="alert">
          ⚠️ Recording interrupted {interruptionCount}{' '}
          {interruptionCount === 1 ? 'time' : 'times'} ({formatDuration(totalHiddenMs)} in the
          background). Sensor data is missing for those gaps.
        </div>
      )}
    </div>
  );
}
