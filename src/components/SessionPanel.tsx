import { useState, useEffect } from 'react';
import { type SessionMetadataStorage } from '../lib/data-storage/IndexedDBStorage';
import { ConfirmDialog } from './ConfirmDialog';
import './SessionPanel.css';

interface SessionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNewSession: () => void;
  isRecording: boolean;
  sessions: SessionMetadataStorage[];
  deleteSession: (sessionId: string) => Promise<void>;
  clearAllSessions: () => Promise<void>;
  getSessionBinary: (sessionId: string) => Promise<ArrayBuffer | null>;
  isLoading?: boolean;
}

export function SessionPanel({ 
  isOpen, 
  onClose, 
  onNewSession, 
  isRecording, 
  sessions, 
  deleteSession, 
  clearAllSessions,
  getSessionBinary,
  isLoading = false,
}: SessionPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState<{ show: boolean; sessionId?: string }>({ show: false });
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [sessionVersions, setSessionVersions] = useState<Record<string, number>>({});

  // Helper function to detect file format version from binary data
  const detectVersion = (buffer: ArrayBuffer): number => {
    const view = new DataView(buffer);
    let magic = '';
    for (let i = 0; i < 16; i++) {
      const char = view.getUint8(i);
      if (char !== 0) magic += String.fromCharCode(char);
    }
    if (magic.startsWith('WRC_COACH_V3')) return 3;
    if (magic.startsWith('WRC_COACH_V2')) return 2;
    if (magic.startsWith('WRC_COACH_V1')) return 1;
    return 0; // Unknown
  };

  // Load versions for all sessions when panel opens
  // NOTE: This hook must be called BEFORE any early returns to follow Rules of Hooks
  useEffect(() => {
    if (!isOpen || sessions.length === 0) return;
    
    const loadVersions = async () => {
      const versions: Record<string, number> = {};
      for (const session of sessions) {
        try {
          const buffer = await getSessionBinary(session.id);
          if (buffer) {
            versions[session.id] = detectVersion(buffer);
          }
        } catch (error) {
          console.error(`Failed to detect version for session ${session.id}:`, error);
        }
      }
      setSessionVersions(versions);
    };
    
    loadVersions();
  }, [isOpen, sessions, getSessionBinary]);

  if (!isOpen) return null;

  const handleExport = async (session: SessionMetadataStorage) => {
    setExportingId(session.id);
    try {
      const timestamp = new Date(session.sessionStartTime).toISOString().replace(/[:.]/g, '-');
      const filename = `wrc_coach_${timestamp}.wrcdata`;
      
      // Get binary data directly from IndexedDB (no need to reconstruct)
      const buffer = await getSessionBinary(session.id);
      if (!buffer) {
        console.error('Failed to get session binary data');
        alert('Failed to export session. Please try again.');
        return;
      }

      const blob = new Blob([buffer], { type: 'application/octet-stream' });
    
      // Try Web Share API first (mobile)
      if (navigator.share) {
        console.log('Web Share API available, attempting to share...');
        try {
          const file = new File([blob], filename, { type: 'application/octet-stream' });
          
          // Debug: Check if canShare exists and what it reports
          if (navigator.canShare) {
            const canShareResult = navigator.canShare({ files: [file] });
            console.log('navigator.canShare result:', canShareResult);
          } else {
            console.log('navigator.canShare not available, trying share anyway...');
          }
          
          // Try to share the file
          // Note: Some browsers support file sharing but report false for canShare
          // So we try regardless and handle failures gracefully
          await navigator.share({
            files: [file],
            title: 'WRC Coach Session Data',
            text: `Session from ${new Date(session.sessionStartTime).toLocaleString()}`,
          });
          console.log('Share successful!');
          return;
        } catch (err: any) {
          // User cancelled the share (AbortError) - don't fall back to download
          if (err.name === 'AbortError') {
            console.log('Share cancelled by user');
            return;
          }
          // Actual error - log and fall back to download
          console.log('Share failed:', err.name, err.message);
          console.log('Falling back to download...');
        }
      } else {
        console.log('Web Share API not available, using download fallback');
      }
      
      // Fallback to traditional download (desktop or if share fails)
      console.log('Triggering download...');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting session:', error);
      alert('Failed to export session. Please try again.');
    } finally {
      setExportingId(null);
    }
  };

  const handleDelete = (sessionId: string) => {
    setConfirmDelete({ show: true, sessionId });
  };

  const handleConfirmDelete = async () => {
    if (confirmDelete.sessionId) {
      await deleteSession(confirmDelete.sessionId);
      setConfirmDelete({ show: false });
    }
  };

  const handleClearAll = () => {
    setConfirmClearAll(true);
  };
  
  const handleConfirmClearAll = async () => {
    await clearAllSessions();
    setConfirmClearAll(false);
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

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
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
          {isLoading ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏳</div>
              <p><strong>Loading sessions...</strong></p>
            </div>
          ) : sortedSessions.length === 0 ? (
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
                      <div className="meta-item">
                        <span className="meta-label">Size</span>
                        <span className="meta-value">{formatSize(session.dataSize)}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Format</span>
                        <span className="meta-value">
                          {sessionVersions[session.id] !== undefined 
                            ? `V${sessionVersions[session.id]}` 
                            : '...'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="session-actions">
                    <button
                      className="session-btn export"
                      onClick={() => handleExport(session)}
                      title="Share/Export session data"
                      disabled={exportingId === session.id}
                    >
                      {exportingId === session.id ? '⏳ Exporting...' : '📤 Share'}
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
              onClick={handleClearAll}
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

      <ConfirmDialog
        isOpen={confirmDelete.show}
        title="Delete Session?"
        message="Are you sure you want to delete this session? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ show: false })}
      />

      <ConfirmDialog
        isOpen={confirmClearAll}
        title="Clear All Sessions?"
        message="Are you sure you want to delete all sessions? This will permanently remove all recorded data and cannot be undone."
        confirmText="Clear All"
        cancelText="Cancel"
        danger={true}
        onConfirm={handleConfirmClearAll}
        onCancel={() => setConfirmClearAll(false)}
      />
    </div>
  );
}

