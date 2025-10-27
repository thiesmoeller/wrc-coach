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
 * Main application component
 * Provides desktop/tablet interface for analyzing rowing data
 */
function App() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
  const [params, setParams] = useState<AnalysisParams>({
    lowCutFreq: 0.3,
    highCutFreq: 1.2,
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'strokes' | 'gps' | 'raw' | 'pwa-preview'>('overview');
  const [fileName, setFileName] = useState<string>('');
  const [showBoatCoordinates, setShowBoatCoordinates] = useState(false);

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
                  <div className="raw-tab-header">
                    <h2>Raw Sensor Data</h2>
                    <div className="coordinate-toggle">
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          checked={showBoatCoordinates}
                          onChange={(e) => setShowBoatCoordinates(e.target.checked)}
                        />
                        <span className="toggle-text">
                          {showBoatCoordinates ? 'Boat Coordinates' : 'Raw IMU Data'}
                        </span>
                      </label>
                      <div className="coordinate-info">
                        {showBoatCoordinates ? (
                          <div>
                            <div>+X = Starboard (right)</div>
                            <div>-X = Port (left)</div>
                            <div>+Y = Bow (forward)</div>
                            <div>-Y = Stern (backward)</div>
                            <div>+Z = Up</div>
                            <div>-Z = Down</div>
                          </div>
                        ) : (
                          <div>
                            <div>X = Lateral (phone frame)</div>
                            <div>Y = Fore-aft (phone frame)</div>
                            <div>Z = Vertical (phone frame)</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="plot-section">
                    <TimeSeriesPlot
                      title={showBoatCoordinates ? "Boat Coordinate System" : "Raw IMU Accelerometer Data"}
                      timeVector={analysisResults.timeVector}
                      series={showBoatCoordinates ? [
                        {
                          name: 'Surge (bow-stern)',
                          data: analysisResults.boatAccelerations.surge,
                          color: '#4ecdc4',
                          width: 1.5,
                        },
                        {
                          name: 'Sway (port-starboard)',
                          data: analysisResults.boatAccelerations.sway,
                          color: '#ff6b6b',
                          width: 1.5,
                        },
                        {
                          name: 'Heave (up-down)',
                          data: analysisResults.boatAccelerations.heave,
                          color: '#45b7d1',
                          width: 1.5,
                        },
                      ] : [
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
                    />
                  </div>

                  {sessionData.gpsSamples.length > 0 && (
                    <div className="plot-section">
                      <TimeSeriesPlot
                        title="GPS Speed"
                        timeVector={sessionData.gpsSamples.map(
                          (s, i) => i < analysisResults.timeVector.length 
                            ? (s.t - sessionData.imuSamples[0].t) / 1000 
                            : 0
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

