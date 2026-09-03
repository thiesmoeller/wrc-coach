import { AppSettings } from '../hooks/useSettings';
import './SettingsPanel.css';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export function SettingsPanel({ isOpen, onClose, settings, updateSettings, resetSettings }: SettingsPanelProps) {

  if (!isOpen) return null;

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-panel open">
        <div className="settings-header">
          <h2>
            ⚙️ Settings
            <span className="keyboard-hint">ESC to close</span>
          </h2>
          <button className="close-settings" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <div className="settings-content">
          {/* Visualization Settings */}
          <div className="settings-section">
            <h3>Visualization</h3>

            <div className="setting-item">
              <label htmlFor="historyStrokes">Historical Strokes</label>
              <div className="setting-control">
                <input
                  type="range"
                  id="historyStrokes"
                  min="0"
                  max="5"
                  value={settings.historyStrokes}
                  step="1"
                  onChange={(e) => updateSettings({ historyStrokes: parseInt(e.target.value) })}
                />
                <span>{settings.historyStrokes}</span>
              </div>
              <p className="setting-help">Show fading history of previous strokes</p>
            </div>

            <div className="setting-item">
              <label htmlFor="trailOpacity">Trail Opacity</label>
              <div className="setting-control">
                <input
                  type="range"
                  id="trailOpacity"
                  min="10"
                  max="80"
                  value={settings.trailOpacity}
                  step="10"
                  onChange={(e) => updateSettings({ trailOpacity: parseInt(e.target.value) })}
                />
                <span>{settings.trailOpacity}%</span>
              </div>
              <p className="setting-help">Opacity of historical stroke trails</p>
            </div>

            <div className="setting-item">
              <label htmlFor="disablePlots" className="checkbox-label">
                <input
                  type="checkbox"
                  id="disablePlots"
                  className="toggle-checkbox"
                  checked={settings.disablePlots}
                  onChange={(e) => updateSettings({ disablePlots: e.target.checked })}
                />
                <span>Disable Plots</span>
              </label>
              <p className="setting-help">Turn off all plot rendering to reduce CPU/memory usage (useful on unstable devices)</p>
            </div>
          </div>

          {/* Data Settings */}
          <div className="settings-section">
            <h3>Data Recording</h3>

            <div className="setting-item">
              <label htmlFor="sampleRate">Display Sample Rate</label>
              <div className="setting-control">
                <input
                  type="range"
                  id="sampleRate"
                  min="10"
                  max="30"
                  value={settings.sampleRate}
                  step="5"
                  onChange={(e) => updateSettings({ sampleRate: parseInt(e.target.value) })}
                />
                <span>{settings.sampleRate} FPS</span>
              </div>
              <p className="setting-help">Chart update frequency (lower = better battery)</p>
            </div>

            <div className={`setting-item ${settings.demoMode ? 'demo-mode-highlight' : ''}`}>
              <label htmlFor="demoMode" className="checkbox-label">
                <input
                  type="checkbox"
                  id="demoMode"
                  className="toggle-checkbox"
                  checked={settings.demoMode}
                  onChange={(e) => updateSettings({ demoMode: e.target.checked })}
                />
                <span>Demo Mode (Simulated Data)</span>
              </label>
              <p className="setting-help">
                {settings.demoMode ? (
                  <strong style={{ color: '#dc2626' }}>
                    ⚠️ Currently using FAKE data! Uncheck this to use real sensors on the boat.
                  </strong>
                ) : (
                  <>
                    ✓ Using real phone sensors - perfect for on-water recording!
                    <br />
                    <em style={{ fontSize: '0.8rem', color: '#666' }}>
                      (Check the box above to enable demo mode for testing without sensors)
                    </em>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Reset Button */}
          <div className="settings-section">
            <button className="btn btn-secondary full-width" onClick={resetSettings}>
              <span className="btn-icon">🔄</span>
              Reset to Defaults
            </button>
          </div>

          {/* Version Info */}
          <div className="settings-section version-info">
            <h3>Version Information</h3>
            <div className="version-details">
              <div className="version-item">
                <span className="version-label">App Version:</span>
                <span className="version-value">{__APP_VERSION__}</span>
              </div>
              {__GIT_TAG__ && (
                <div className="version-item">
                  <span className="version-label">Git Tag:</span>
                  <span className="version-value">{__GIT_TAG__}</span>
                </div>
              )}
              <div className="version-item">
                <span className="version-label">Git Commit:</span>
                <span className="version-value">
                  {__GIT_COMMIT__}
                  {__GIT_DIRTY__ === 'true' && <span className="dirty-indicator"> (modified)</span>}
                </span>
              </div>
              <div className="version-item">
                <span className="version-label">Branch:</span>
                <span className="version-value">{__GIT_BRANCH__}</span>
              </div>
              <div className="version-item">
                <span className="version-label">Build Date:</span>
                <span className="version-value">{new Date().toISOString().split('T')[0]}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
