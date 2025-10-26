import React from 'react';
import type { AnalysisParams } from '../lib/DataAnalyzer';
import './ParameterPanel.css';

interface Props {
  params: AnalysisParams;
  onParamsChange: (params: AnalysisParams) => void;
}

/**
 * Parameter tuning panel
 * Allows real-time adjustment of filter and detection parameters
 */
export const ParameterPanel: React.FC<Props> = ({ params, onParamsChange }) => {
  const handleChange = (key: keyof AnalysisParams, value: number) => {
    onParamsChange({ ...params, [key]: value });
  };

  return (
    <div className="parameter-panel">
      <h3>Algorithm Parameters</h3>
      
      <div className="param-section">
        <h4>Band-Pass Filter</h4>
        
        <div className="param-control">
          <label>
            Low Cut Frequency (Hz)
            <span className="param-value">{params.lowCutFreq.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={params.lowCutFreq}
            onChange={(e) => handleChange('lowCutFreq', parseFloat(e.target.value))}
          />
          <div className="param-hint">Removes DC drift (typical: 0.3 Hz)</div>
        </div>

        <div className="param-control">
          <label>
            High Cut Frequency (Hz)
            <span className="param-value">{params.highCutFreq.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={params.highCutFreq}
            onChange={(e) => handleChange('highCutFreq', parseFloat(e.target.value))}
          />
          <div className="param-hint">Removes noise (typical: 1.2 Hz)</div>
        </div>
        
        <div className="info-box" style={{
          padding: '12px',
          backgroundColor: '#e8f4f8',
          borderLeft: '4px solid #2196F3',
          marginTop: '15px',
          borderRadius: '4px'
        }}>
          <strong>📊 Auto-Calculated Sample Rate</strong>
          <div style={{ fontSize: '13px', marginTop: '6px', color: '#555' }}>
            Sample rate is automatically calculated from timestamps in the recording.
            Check console for actual rate (typically ~50 Hz).
          </div>
        </div>
      </div>

      <div className="param-section">
        <h4>Stroke Detection</h4>
        
        <div className="info-box" style={{
          padding: '12px',
          backgroundColor: '#e8f4f8',
          borderLeft: '4px solid #2196F3',
          marginBottom: '15px',
          borderRadius: '4px'
        }}>
          <strong>🎯 Fully Automatic Detection</strong>
          <div style={{ fontSize: '13px', marginTop: '6px', color: '#555' }}>
            Automatically detects catch peaks and segments strokes catch-to-catch. 
            Uses adaptive thresholds based on signal statistics (90th percentile).
            No manual tuning required - adapts to fast and slow boats.
          </div>
        </div>
      </div>

      <div className="param-section">
        <h4>Presets</h4>
        <div className="preset-buttons">
          <button
            onClick={() => onParamsChange({
              lowCutFreq: 0.3,
              highCutFreq: 1.2,
            })}
          >
            Default
          </button>
          <button
            onClick={() => onParamsChange({
              lowCutFreq: 0.25,
              highCutFreq: 1.5,
            })}
          >
            Sensitive
          </button>
          <button
            onClick={() => onParamsChange({
              lowCutFreq: 0.35,
              highCutFreq: 1.0,
            })}
          >
            Relaxed
          </button>
        </div>
      </div>
    </div>
  );
};

