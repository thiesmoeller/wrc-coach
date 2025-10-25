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

        <div className="param-control">
          <label>
            Sample Rate (Hz)
            <span className="param-value">{params.sampleRate}</span>
          </label>
          <input
            type="range"
            min="20"
            max="100"
            step="5"
            value={params.sampleRate}
            onChange={(e) => handleChange('sampleRate', parseInt(e.target.value))}
          />
          <div className="param-hint">Assumed IMU sample rate (typical: 50 Hz)</div>
        </div>
      </div>

      <div className="param-section">
        <h4>Stroke Detection</h4>
        
        <div className="param-control">
          <label>
            Catch Threshold (m/s²)
            <span className="param-value">{params.catchThreshold.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.1"
            value={params.catchThreshold}
            onChange={(e) => handleChange('catchThreshold', parseFloat(e.target.value))}
          />
          <div className="param-hint">Detect catch when acceleration exceeds this</div>
        </div>

        <div className="param-control">
          <label>
            Finish Threshold (m/s²)
            <span className="param-value">{params.finishThreshold.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="-2.0"
            max="0.0"
            step="0.1"
            value={params.finishThreshold}
            onChange={(e) => handleChange('finishThreshold', parseFloat(e.target.value))}
          />
          <div className="param-hint">Detect finish when acceleration drops below this</div>
        </div>
      </div>

      <div className="param-section">
        <h4>Presets</h4>
        <div className="preset-buttons">
          <button
            onClick={() => onParamsChange({
              lowCutFreq: 0.3,
              highCutFreq: 1.2,
              sampleRate: 50,
              catchThreshold: 0.6,
              finishThreshold: -0.3,
            })}
          >
            Default
          </button>
          <button
            onClick={() => onParamsChange({
              lowCutFreq: 0.25,
              highCutFreq: 1.5,
              sampleRate: 50,
              catchThreshold: 0.8,
              finishThreshold: -0.4,
            })}
          >
            Sensitive
          </button>
          <button
            onClick={() => onParamsChange({
              lowCutFreq: 0.35,
              highCutFreq: 1.0,
              sampleRate: 50,
              catchThreshold: 0.4,
              finishThreshold: -0.2,
            })}
          >
            Relaxed
          </button>
        </div>
      </div>
    </div>
  );
};

