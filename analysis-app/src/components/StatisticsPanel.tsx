import React from 'react';
import type { SessionData, AnalysisResults } from '../types';
import './StatisticsPanel.css';

interface Props {
  sessionData: SessionData;
  analysisResults: AnalysisResults;
}

/**
 * Statistics summary panel
 * Shows key metrics from the session
 */
export const StatisticsPanel: React.FC<Props> = ({ sessionData, analysisResults }) => {
  const { metadata, imuSamples, gpsSamples } = sessionData;
  const duration = imuSamples.length > 0
    ? (imuSamples[imuSamples.length - 1].t - imuSamples[0].t) / 1000
    : 0;

  // Calculate GPS stats
  const validGPS = gpsSamples.filter(s => s.lat !== 0 && s.lon !== 0);
  const avgSpeed = validGPS.length > 0
    ? validGPS.reduce((sum, s) => sum + s.speed, 0) / validGPS.length
    : 0;
  
  const avgSplit = avgSpeed > 0 ? 500 / avgSpeed : 0;
  const avgSplitMin = Math.floor(avgSplit / 60);
  const avgSplitSec = Math.floor(avgSplit % 60);

  // Calculate distance
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dphi = ((lat2 - lat1) * Math.PI) / 180;
    const dlambda = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  let totalDistance = 0;
  for (let i = 0; i < validGPS.length - 1; i++) {
    totalDistance += haversineDistance(
      validGPS[i].lat,
      validGPS[i].lon,
      validGPS[i + 1].lat,
      validGPS[i + 1].lon
    );
  }

  const sessionDate = new Date(metadata.sessionStart);

  // Count orientation samples (V3 only)
  const orientationSamples = imuSamples.filter(
    s => (s.mx !== undefined && Number.isFinite(s.mx)) ||
         (s.my !== undefined && Number.isFinite(s.my)) ||
         (s.mz !== undefined && Number.isFinite(s.mz))
  ).length;

  return (
    <div className="statistics-panel">
      <h3>Session Summary</h3>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Date & Time</div>
          <div className="stat-value">{sessionDate.toLocaleString()}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Duration</div>
          <div className="stat-value">
            {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Phone Position</div>
          <div className="stat-value">{metadata.phoneOrientation}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Format Version</div>
          <div className="stat-value">V{metadata.version}</div>
        </div>
      </div>

      <h4>Stroke Metrics</h4>
      <div className="stats-grid">
        <div className="stat-card highlight">
          <div className="stat-label">Total Strokes</div>
          <div className="stat-value large">{analysisResults.totalStrokes}</div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-label">Avg Stroke Rate</div>
          <div className="stat-value large">{analysisResults.avgStrokeRate.toFixed(1)} SPM</div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-label">Avg Drive Ratio</div>
          <div className="stat-value large">{analysisResults.avgDrivePercent.toFixed(1)}%</div>
        </div>
      </div>

      <h4>Performance</h4>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Distance</div>
          <div className="stat-value">{(totalDistance / 1000).toFixed(2)} km</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg Split</div>
          <div className="stat-value">
            {avgSplitMin}:{avgSplitSec.toString().padStart(2, '0')} /500m
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg Speed</div>
          <div className="stat-value">{avgSpeed.toFixed(2)} m/s</div>
        </div>
      </div>

      <h4>Data Quality</h4>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">IMU Samples</div>
          <div className="stat-value">{imuSamples.length.toLocaleString()}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">GPS Samples</div>
          <div className="stat-value">{gpsSamples.length}</div>
        </div>

        {orientationSamples > 0 && (
          <div className="stat-card">
            <div className="stat-label">Orientation Samples</div>
            <div className="stat-value">{orientationSamples.toLocaleString()}</div>
          </div>
        )}

        <div className="stat-card">
          <div className="stat-label">IMU Rate</div>
          <div className="stat-value">
            {duration > 0 ? (imuSamples.length / duration).toFixed(0) : 0} Hz
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Demo Mode</div>
          <div className="stat-value">{metadata.demoMode ? 'Yes' : 'No'}</div>
        </div>
      </div>
    </div>
  );
};

