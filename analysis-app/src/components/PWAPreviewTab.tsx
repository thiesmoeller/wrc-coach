import React, { useState, useEffect } from 'react';
import type { SessionData, AnalysisResults } from '../types';
import { CartesianPlot } from '@wrc-coach/components/CartesianPlot';
import { StabilityPlot } from '@wrc-coach/components/StabilityPlot';
import { MetricsBar } from '@wrc-coach/components/MetricsBar';
import { ComplementaryFilter } from '@wrc-coach/lib/filters/ComplementaryFilter';
// Import shared CSS from PWA components
import '@wrc-coach/components/CartesianPlot.css';
import '@wrc-coach/components/StabilityPlot.css';
import '@wrc-coach/components/MetricsBar.css';
import './PWAPreviewTab.css';

interface Props {
  sessionData: SessionData;
  analysisResults: AnalysisResults;
}

/**
 * PWA Preview Tab
 * Shows how the data looks in the mobile PWA with shared components
 */
export const PWAPreviewTab: React.FC<Props> = ({ sessionData, analysisResults }) => {
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Simulate playback
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setPlaybackPosition(prev => {
        const next = prev + playbackSpeed;
        if (next >= sessionData.imuSamples.length) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
    }, 20); // 50 Hz simulation

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, sessionData.imuSamples.length]);

  // Prepare data for PWA components
  const currentSamples = sessionData.imuSamples.slice(
    Math.max(0, playbackPosition - 500), // Show last 10 seconds at 50Hz
    playbackPosition + 1
  );

  // Calculate orientation using complementary filter
  const orientationFilter = new ComplementaryFilter();
  const samplesWithOrientation = currentSamples.map((sample, i) => {
    const dt = i > 0 ? (sample.t - currentSamples[i - 1].t) / 1000 : 0.02;
    const orientation = orientationFilter.update(
      sample.ax,
      sample.ay,
      sample.az,
      sample.gx,
      sample.gy,
      sample.gz,
      dt
    );

    // Find corresponding analysis data
    const timeInSeconds = (sample.t - sessionData.imuSamples[0].t) / 1000;
    const analysisIndex = analysisResults.timeVector.findIndex(t => t >= timeInSeconds);
    
    return {
      t: sample.t,
      surgeHP: analysisIndex >= 0 ? analysisResults.filteredAcceleration[analysisIndex] : 0,
      inDrive: false, // Would need stroke detector state
      strokeAngle: 0, // Would need stroke angle calculation
      roll: orientation.roll,
    };
  });

  // Get current metrics
  const currentStroke = analysisResults.strokes.find(
    s => (s.catchTime - sessionData.imuSamples[0].t) / 1000 <= playbackPosition / 50
  );

  const strokeRate = currentStroke?.strokeRate || 0;
  const drivePercent = currentStroke?.drivePercent || 0;
  
  // Get GPS data
  const currentTime = sessionData.imuSamples[playbackPosition]?.t || 0;
  const gpsIndex = sessionData.gpsSamples.findIndex(s => s.t >= currentTime);
  const currentGPS = gpsIndex >= 0 ? sessionData.gpsSamples[gpsIndex] : null;
  const speed = currentGPS?.speed || 0;
  const splitSeconds = speed > 0 ? 500 / speed : 0;
  const splitTime = speed > 0 
    ? `${Math.floor(splitSeconds / 60)}:${Math.floor(splitSeconds % 60).toString().padStart(2, '0')}`
    : '--:--';

  const progress = (playbackPosition / sessionData.imuSamples.length) * 100;

  return (
    <div className="pwa-preview-tab">
      <h2>📱 PWA Live Preview</h2>
      <p className="preview-description">
        This shows how your data looks in the mobile app using the <strong>shared components</strong>.
        Any improvements you make here automatically improve the PWA!
      </p>

      {/* Playback Controls */}
      <div className="playback-controls">
        <button
          className="control-button"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        
        <button
          className="control-button"
          onClick={() => setPlaybackPosition(0)}
        >
          ⏮ Reset
        </button>

        <div className="speed-control">
          <label>Speed:</label>
          <select 
            value={playbackSpeed} 
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="5">5x</option>
            <option value="10">10x</option>
          </select>
        </div>

        <div className="progress-bar">
          <input
            type="range"
            min="0"
            max={sessionData.imuSamples.length}
            value={playbackPosition}
            onChange={(e) => setPlaybackPosition(Number(e.target.value))}
            className="progress-slider"
          />
          <div className="progress-label">
            {Math.floor(playbackPosition / 50)}s / {Math.floor(sessionData.imuSamples.length / 50)}s
            ({progress.toFixed(1)}%)
          </div>
        </div>
      </div>

      {/* Shared PWA Components */}
      <div className="pwa-preview-content">
        {/* Metrics Bar - Shared Component */}
        <div className="preview-section">
          <h3>Metrics Bar (Shared Component)</h3>
          <MetricsBar
            strokeRate={strokeRate}
            drivePercent={drivePercent}
            splitTime={splitTime}
            sampleCount={currentSamples.length}
          />
        </div>

        {/* Cartesian Plot - Shared Component */}
        <div className="preview-section">
          <h3>Acceleration Pattern (Shared Component)</h3>
          <div className="plot-wrapper mobile-size">
            <CartesianPlot
              samples={samplesWithOrientation}
              historyStrokes={3}
              trailOpacity={50}
              // Ensure absolute ms catch times for compatibility with shared component
              catchTimes={analysisResults.catches}
            />
          </div>
        </div>

        {/* Stability Plot - Shared Component */}
        <div className="preview-section">
          <h3>Boat Stability (Shared Component)</h3>
          <div className="plot-wrapper mobile-size">
            <StabilityPlot
              samples={samplesWithOrientation}
              catchTimes={analysisResults.catches}
            />
          </div>
        </div>
      </div>

      {/* Info Panel */}
      <div className="info-panel">
        <h3>💡 About This Preview</h3>
        <ul>
          <li>
            <strong>Shared Components:</strong> These are the <em>exact same components</em> used in the mobile PWA
          </li>
          <li>
            <strong>Real-Time Simulation:</strong> Playback simulates how data flows through the PWA
          </li>
          <li>
            <strong>Optimize Here:</strong> Any improvements to these components benefit both apps
          </li>
          <li>
            <strong>Code Location:</strong> <code>src/components/CartesianPlot.tsx</code>, <code>StabilityPlot.tsx</code>, <code>MetricsBar.tsx</code>
          </li>
        </ul>
      </div>
    </div>
  );
};

