import './ControlPanel.css';

interface ControlPanelProps {
  isRunning: boolean;
  onSessions: () => void;
  onStart: () => void;
  onStop: () => void;
}

export function ControlPanel({
  isRunning,
  onSessions,
  onStart,
  onStop,
}: ControlPanelProps) {
  return (
    <div className="control-panel">
      <button
        className="btn btn-secondary"
        onClick={onSessions}
        disabled={isRunning}
      >
        <span className="btn-icon">📊</span>
        Sessions
      </button>
      
      <button
        className="btn btn-primary"
        onClick={onStart}
        disabled={isRunning}
      >
        <span className="btn-icon">▶</span>
        Start Session
      </button>
      
      <button
        className="btn btn-danger"
        onClick={onStop}
        disabled={!isRunning}
      >
        <span className="btn-icon">⏹</span>
        Stop
      </button>
    </div>
  );
}

