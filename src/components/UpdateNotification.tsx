import { useState, useEffect } from 'react';
import './UpdateNotification.css';

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    // Check for update waiting flag
    const checkUpdate = () => {
      const recording = sessionStorage.getItem('wrc_recording_active') === 'true';
      setIsRecording(recording);
      
      // Check if there's an update waiting (communicated via sessionStorage)
      const updateWaiting = sessionStorage.getItem('wrc_update_waiting') === 'true';
      setUpdateAvailable(updateWaiting);
    };

    // Check immediately
    checkUpdate();

    // Check every 2 seconds
    const interval = setInterval(checkUpdate, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleApplyNow = () => {
    if (window.confirm('This will reload the app and apply the update. Continue?')) {
      sessionStorage.removeItem('wrc_recording_active');
      sessionStorage.removeItem('wrc_update_waiting');
      window.location.reload();
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="update-notification">
      <div className="update-content">
        <span className="update-icon">🔄</span>
        <div className="update-text">
          <strong>Update Available</strong>
          {isRecording ? (
            <span className="update-detail">Will apply when you stop recording</span>
          ) : (
            <span className="update-detail">Ready to install</span>
          )}
        </div>
        {!isRecording && (
          <button className="update-btn" onClick={handleApplyNow}>
            Update Now
          </button>
        )}
      </div>
    </div>
  );
}

