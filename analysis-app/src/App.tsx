import React, { useState, useCallback } from 'react';
import type { SessionData, AnalysisResults } from './types';
import type { AnalysisParams } from './lib/DataAnalyzer';
import { BinaryDataReader } from './lib/BinaryDataReader';
import { DataAnalyzer } from './lib/DataAnalyzer';
import { TimeSeriesPlot } from './components/TimeSeriesPlot';
import { GPSMapPlot } from './components/GPSMapLeaflet';
import { ParameterPanel } from './components/ParameterPanel';
import { StatisticsPanel } from './components/StatisticsPanel';
import { PWAPreviewTab } from './components/PWAPreviewTab';
import { CacheInfoPanel } from './components/CacheInfoPanel';
import './App.css';

/**
 * Interpolate NaN values in an array using linear interpolation
 * Handles edges by extending from nearest valid value
 * @param values Array of values that may contain NaN
 * @param isAngle If true, handles angular wrapping (0-360 degrees)
 */
function interpolateNaN(values: number[], isAngle = false): number[] {
  if (values.length === 0) return values;
  
  const result = [...values];
  
  // Find first and last valid indices
  let firstValid = -1;
  let lastValid = -1;
  
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) {
      if (firstValid === -1) firstValid = i;
      lastValid = i;
    }
  }
  
  // If no valid values, return as-is
  if (firstValid === -1) return result;
  
  // Fill leading NaNs with first valid value
  for (let i = 0; i < firstValid; i++) {
    result[i] = values[firstValid];
  }
  
  // Fill trailing NaNs with last valid value
  for (let i = lastValid + 1; i < values.length; i++) {
    result[i] = values[lastValid];
  }
  
  // Interpolate gaps between valid values
  let i = firstValid;
  while (i < lastValid) {
    if (Number.isFinite(result[i])) {
      // Find next valid value
      let j = i + 1;
      while (j <= lastValid && !Number.isFinite(result[j])) {
        j++;
      }
      
      if (j <= lastValid && Number.isFinite(result[j])) {
        // Interpolate between result[i] and result[j]
        let startValue = result[i];
        let endValue = result[j];
        const gap = j - i;
        
        if (isAngle) {
          // Handle angular wrapping - find shortest path around circle
          const diff = endValue - startValue;
          let adjustedDiff = diff;
          
          // Normalize to -180 to 180 range
          if (Math.abs(diff) > 180) {
            if (diff > 0) {
              adjustedDiff = diff - 360;
            } else {
              adjustedDiff = diff + 360;
            }
          }
          
          for (let k = i + 1; k < j; k++) {
            const t = (k - i) / gap;
            let interpolated = startValue + t * adjustedDiff;
            // Normalize to 0-360
            while (interpolated < 0) interpolated += 360;
            while (interpolated >= 360) interpolated -= 360;
            result[k] = interpolated;
          }
        } else {
          // Regular linear interpolation
          for (let k = i + 1; k < j; k++) {
            const t = (k - i) / gap;
            result[k] = startValue + t * (endValue - startValue);
          }
        }
        
        i = j;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  
  return result;
}

/**
 * Main application component
 * Provides desktop/tablet interface for analyzing rowing data
 */
function App() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
  const [params, setParams] = useState<AnalysisParams>({
    lowCutFreq: 0.3,
    highCutFreq: 1.2,
    sampleRate: 50,
    catchThreshold: 0.6,
    finishThreshold: -0.3,
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'strokes' | 'gps' | 'raw' | 'pwa-preview'>('overview');
  const [fileName, setFileName] = useState<string>('');
  
  // Zoom state for synchronized x-axis zooming across plots within the same tab
  // Each tab has its own independent zoom state
  const [xZoomRanges, setXZoomRanges] = useState<Record<string, { min: number | null; max: number | null }>>({
    overview: { min: null, max: null },
    strokes: { min: null, max: null },
    raw: { min: null, max: null },
    gps: { min: null, max: null },
    'pwa-preview': { min: null, max: null },
  });

  // Handle file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      try {
        const binaryReader = new BinaryDataReader();
        const data = binaryReader.decode(buffer);
        setSessionData(data);

        // Reset zoom when loading new file
        setXZoomRanges({
          overview: { min: null, max: null },
          strokes: { min: null, max: null },
          raw: { min: null, max: null },
          gps: { min: null, max: null },
          'pwa-preview': { min: null, max: null },
        });

        // Perform initial analysis
        const results = DataAnalyzer.analyze(data, params);
        setAnalysisResults(results);
      } catch (error) {
        alert(`Error reading file: ${error}`);
        console.error(error);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [params]);

  // Re-analyze when parameters change
  const handleParamsChange = useCallback((newParams: AnalysisParams) => {
    setParams(newParams);
    if (sessionData) {
      const results = DataAnalyzer.analyze(sessionData, newParams);
      setAnalysisResults(results);
    }
  }, [sessionData]);

  // Handle zoom change from plots
  const handleZoomChange = useCallback((min: number | null, max: number | null) => {
    setXZoomRanges(prev => ({
      ...prev,
      [activeTab]: { min, max },
    }));
  }, [activeTab]);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1>🚣 WRC Coach - Data Analysis</h1>
          <p className="subtitle">Desktop/Tablet Analysis Tool for Rowing Data</p>
        </div>
      </header>

      {/* File Loader */}
      <div className="file-loader-section">
        <div className="file-loader">
          <input
            type="file"
            id="file-input"
            accept=".wrcdata"
            onChange={handleFileUpload}
            className="file-input"
          />
          <label htmlFor="file-input" className="file-label">
            📁 Load .wrcdata File
          </label>
          {fileName && <span className="file-name">Loaded: {fileName}</span>}
        </div>
      </div>

      {/* Main Content */}
      {sessionData && analysisResults ? (
        <div className="main-content">
          {/* Sidebar */}
          <aside className="sidebar">
            <ParameterPanel params={params} onParamsChange={handleParamsChange} />
            <div style={{ marginTop: '20px' }}>
              <CacheInfoPanel />
            </div>
          </aside>

          {/* Content Area */}
          <main className="content-area">
            {/* Tabs */}
            <nav className="tabs">
              <button
                className={activeTab === 'overview' ? 'active' : ''}
                onClick={() => setActiveTab('overview')}
              >
                📊 Overview
              </button>
              <button
                className={activeTab === 'strokes' ? 'active' : ''}
                onClick={() => setActiveTab('strokes')}
              >
                🎯 Stroke Analysis
              </button>
              <button
                className={activeTab === 'gps' ? 'active' : ''}
                onClick={() => setActiveTab('gps')}
              >
                🗺️ GPS Map
              </button>
              <button
                className={activeTab === 'raw' ? 'active' : ''}
                onClick={() => setActiveTab('raw')}
              >
                📈 Raw Data
              </button>
              <button
                className={activeTab === 'pwa-preview' ? 'active' : ''}
                onClick={() => setActiveTab('pwa-preview')}
              >
                📱 PWA Preview
              </button>
            </nav>

            {/* Tab Content */}
            <div className="tab-content">
              {activeTab === 'overview' && (
                <div className="overview-tab">
                  <StatisticsPanel
                    sessionData={sessionData}
                    analysisResults={analysisResults}
                  />
                  
                  <div className="plot-section">
                    <TimeSeriesPlot
                      title="Stroke Detection"
                      timeVector={analysisResults.timeVector}
                      series={[
                        {
                          name: 'Raw',
                          data: analysisResults.rawAcceleration,
                          color: '#ccc',
                          width: 1,
                        },
                        {
                          name: 'Filtered',
                          data: analysisResults.filteredAcceleration,
                          color: '#0066cc',
                          width: 2,
                        },
                      ]}
                      markers={[
                        {
                          name: 'Catch',
                          positions: analysisResults.catches,
                          color: '#00AA00',
                          shape: 'triangle-up',
                        },
                        {
                          name: 'Finish',
                          positions: analysisResults.finishes,
                          color: '#DD0000',
                          shape: 'triangle-down',
                        },
                      ]}
                      yLabel="Fore-aft Acceleration (m/s²)"
                      height={350}
                      xRange={xZoomRanges.overview}
                      onZoomChange={handleZoomChange}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'strokes' && (
                <div className="strokes-tab">
                  <h2>Stroke-by-Stroke Analysis</h2>
                  
                  <div className="plot-section">
                    <TimeSeriesPlot
                      title="Filtered Acceleration with Stroke Markers"
                      timeVector={analysisResults.timeVector}
                      series={[
                        {
                          name: 'Filtered ay',
                          data: analysisResults.filteredAcceleration,
                          color: '#0066cc',
                          width: 2,
                        },
                      ]}
                      markers={[
                        {
                          name: 'Catch',
                          positions: analysisResults.catches,
                          color: '#00AA00',
                          shape: 'triangle-up',
                        },
                        {
                          name: 'Finish',
                          positions: analysisResults.finishes,
                          color: '#DD0000',
                          shape: 'triangle-down',
                        },
                      ]}
                      yLabel="Acceleration (m/s²)"
                      height={400}
                      xRange={xZoomRanges.strokes}
                      onZoomChange={handleZoomChange}
                    />
                  </div>

                  {analysisResults.strokes.length > 0 && (
                    <div className="strokes-table-section">
                      <h3>Stroke Details</h3>
                      <div className="table-container">
                        <table className="strokes-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Time (s)</th>
                              <th>Drive Time (ms)</th>
                              <th>Recovery Time (ms)</th>
                              <th>Stroke Rate (SPM)</th>
                              <th>Drive %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysisResults.strokes.map((stroke, i) => (
                              <tr key={i}>
                                <td>{i + 1}</td>
                                <td>{((stroke.catchTime - sessionData.imuSamples[0].t) / 1000).toFixed(1)}</td>
                                <td>{stroke.driveTime.toFixed(0)}</td>
                                <td>{stroke.recoveryTime.toFixed(0)}</td>
                                <td>{stroke.strokeRate}</td>
                                <td>{stroke.drivePercent}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'gps' && (
                <div className="gps-tab">
                  <h2>GPS Visualization</h2>
                  <div className="plot-section">
                    <GPSMapPlot gpsSamples={sessionData.gpsSamples} height={500} />
                  </div>
                </div>
              )}

              {activeTab === 'raw' && (
                <div className="raw-tab">
                  <h2>Raw Sensor Data</h2>
                  
                  <div className="plot-section">
                    <TimeSeriesPlot
                      title="Accelerometer Data"
                      timeVector={analysisResults.timeVector}
                      series={[
                        {
                          name: 'ax (lateral)',
                          data: sessionData.imuSamples.map(s => s.ax),
                          color: '#ff6b6b',
                          width: 1.5,
                        },
                        {
                          name: 'ay (fore-aft)',
                          data: sessionData.imuSamples.map(s => s.ay),
                          color: '#4ecdc4',
                          width: 1.5,
                        },
                        {
                          name: 'az (vertical)',
                          data: sessionData.imuSamples.map(s => s.az),
                          color: '#45b7d1',
                          width: 1.5,
                        },
                      ]}
                      yLabel="Acceleration (m/s²)"
                      height={350}
                      xRange={xZoomRanges.raw}
                      onZoomChange={handleZoomChange}
                    />
                  </div>

                  <div className="plot-section">
                    <TimeSeriesPlot
                      title="Gyroscope Data"
                      timeVector={analysisResults.timeVector}
                      series={[
                        {
                          name: 'gx (roll rate)',
                          data: sessionData.imuSamples.map(s => s.gx),
                          color: '#ff6b6b',
                          width: 1.5,
                        },
                        {
                          name: 'gy (pitch rate)',
                          data: sessionData.imuSamples.map(s => s.gy),
                          color: '#4ecdc4',
                          width: 1.5,
                        },
                        {
                          name: 'gz (yaw rate)',
                          data: sessionData.imuSamples.map(s => s.gz),
                          color: '#45b7d1',
                          width: 1.5,
                        },
                      ]}
                      yLabel="Angular Velocity (deg/s)"
                      height={350}
                      xRange={xZoomRanges.raw}
                      onZoomChange={handleZoomChange}
                    />
                  </div>

                  {/* Orientation Data (V3 only) */}
                  {sessionData.imuSamples.some(s => 
                    (s.mx !== undefined && Number.isFinite(s.mx)) ||
                    (s.my !== undefined && Number.isFinite(s.my)) ||
                    (s.mz !== undefined && Number.isFinite(s.mz))
                  ) && (
                    <div className="plot-section">
                      <TimeSeriesPlot
                        title="Orientation Data"
                        timeVector={analysisResults.timeVector}
                        series={[
                          {
                            name: 'alpha (compass heading)',
                            data: interpolateNaN(sessionData.imuSamples.map(s => s.mx ?? NaN), true),
                            color: '#ff6b6b',
                            width: 1.5,
                          },
                          {
                            name: 'beta (front-back tilt)',
                            data: interpolateNaN(sessionData.imuSamples.map(s => s.my ?? NaN)),
                            color: '#4ecdc4',
                            width: 1.5,
                          },
                          {
                            name: 'gamma (left-right tilt)',
                            data: interpolateNaN(sessionData.imuSamples.map(s => s.mz ?? NaN)),
                            color: '#45b7d1',
                            width: 1.5,
                          },
                        ]}
                        yLabel="Orientation (degrees)"
                        height={350}
                        xRange={xZoomRanges.raw}
                        onZoomChange={handleZoomChange}
                      />
                    </div>
                  )}

                  {sessionData.gpsSamples.length > 0 && (
                    <div className="plot-section">
                      <TimeSeriesPlot
                        title="GPS Speed"
                        timeVector={sessionData.gpsSamples.map(
                          (s) => (s.t - sessionData.imuSamples[0].t) / 1000
                        )}
                        series={[
                          {
                            name: 'Speed',
                            data: sessionData.gpsSamples.map(s => s.speed),
                            color: '#9b59b6',
                            width: 2,
                          },
                        ]}
                        yLabel="Speed (m/s)"
                        height={300}
                        xRange={xZoomRanges.raw}
                        onZoomChange={handleZoomChange}
                      />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pwa-preview' && (
                <PWAPreviewTab
                  sessionData={sessionData}
                  analysisResults={analysisResults}
                />
              )}
            </div>
          </main>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-content">
            <h2>👋 Welcome to WRC Coach Data Analysis</h2>
            <p>Load a <code>.wrcdata</code> file to get started with analyzing your rowing session data.</p>
            <ul>
              <li>📊 View comprehensive stroke analysis</li>
              <li>🎯 Tune filter and detection parameters in real-time</li>
              <li>🗺️ Visualize GPS routes with speed coloring</li>
              <li>📈 Explore raw sensor data</li>
            </ul>
            <p className="hint">
              Tip: Export your session data from the WRC Coach PWA mobile app to get <code>.wrcdata</code> files.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

