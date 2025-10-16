import { type SessionData } from '../hooks';
import { BinaryDataWriter, type IMUSample, type GPSSample } from '../lib/data-storage';
import './SessionPanel.css';

interface SessionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNewSession: () => void;
  isRecording: boolean;
  sessions: SessionData[];
  deleteSession: (sessionId: string) => void;
  clearAllSessions: () => void;
}

export function SessionPanel({ isOpen, onClose, onNewSession, isRecording, sessions, deleteSession, clearAllSessions }: SessionPanelProps) {

  if (!isOpen) return null;

  const handleExport = async (session: SessionData) => {
    const timestamp = new Date(session.sessionStartTime).toISOString().replace(/[:.]/g, '-');
    const filename = `wrc_coach_${timestamp}.wrcdata`;
    
    // Separate IMU and GPS samples
    const imuSamples: IMUSample[] = session.samples
      .filter((s) => s.type === 'imu')
      .map((s) => ({
        t: s.t,
        ax: s.ax!,
        ay: s.ay!,
        az: s.az!,
        gx: s.gx!,
        gy: s.gy!,
        gz: s.gz!,
      }));

    const gpsSamples: GPSSample[] = session.samples
      .filter((s) => s.type === 'gps')
      .map((s) => ({
        t: s.t,
        lat: s.lat!,
        lon: s.lon!,
        speed: s.speed!,
        heading: s.heading!,
        accuracy: s.accuracy!,
      }));

    // Export binary
    const writer = new BinaryDataWriter();
    const buffer = writer.encode(imuSamples, gpsSamples, {
      sessionStart: session.sessionStartTime,
      phoneOrientation: session.phoneOrientation || 'rower',
      demoMode: session.demoMode || false,
      catchThreshold: session.catchThreshold || 0.3,
      finishThreshold: session.finishThreshold || 0.8,
      calibration: session.calibrationData,
      calibrationSamples: [],
    });

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    
    // Try Web Share API first (mobile)
    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: 'application/octet-stream' });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'WRC Coach Session Data',
            text: `Session from ${new Date(session.sessionStartTime).toLocaleString()}`,
          });
          return;
        }
      } catch (err) {
        // If share fails or is cancelled, fall through to download
        console.log('Share failed, falling back to download:', err);
      }
    }
    
    // Fallback to traditional download (desktop or if share fails)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = (sessionId: string) => {
    if (confirm('Are you sure you want to delete this session?')) {
      deleteSession(sessionId);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  const sortedSessions = [...sessions].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="session-panel-overlay" onClick={onClose}>
      <div className="session-panel" onClick={(e) => e.stopPropagation()}>
        <div className="session-panel-header">
          <h2>Sessions</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="session-panel-content">
          {sortedSessions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <p><strong>No sessions recorded yet</strong></p>
              <p>Start a new session to begin recording data</p>
            </div>
          ) : (
            <div className="session-list">
              {sortedSessions.map((session) => (
                <div key={session.id} className="session-item">
                  <div className="session-info">
                    <div className="session-title">
                      {formatDate(session.sessionStartTime)}
                    </div>
                    <div className="session-meta">
                      <div className="meta-item">
                        <span className="meta-label">Duration</span>
                        <span className="meta-value">{formatDuration(session.duration)}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Strokes</span>
                        <span className="meta-value">{session.strokeCount}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Avg SR</span>
                        <span className="meta-value">{session.avgStrokeRate.toFixed(1)} SPM</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Avg Drive</span>
                        <span className="meta-value">{session.avgDrivePercent.toFixed(0)}%</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Max Speed</span>
                        <span className="meta-value">{session.maxSpeed.toFixed(1)} m/s</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Distance</span>
                        <span className="meta-value">{formatDistance(session.totalDistance)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="session-actions">
                    <button
                      className="session-btn export"
                      onClick={() => handleExport(session)}
                      title="Share/Export session data"
                    >
                      📤 Share
                    </button>
                    <button
                      className="session-btn delete"
                      onClick={() => handleDelete(session.id)}
                      title="Delete session"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="session-panel-footer">
          {sessions.length > 0 && (
            <button
              className="clear-all-btn"
              onClick={clearAllSessions}
              disabled={isRecording}
            >
              Clear All
            </button>
          )}
          <button
            className="new-session-btn"
            onClick={() => {
              onNewSession();
              onClose();
            }}
            disabled={isRecording}
          >
            ▶ New Session
          </button>
        </div>
      </div>
    </div>
  );
}

