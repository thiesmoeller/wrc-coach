import { useEffect } from 'react';
import { useCalibration } from '../hooks/useCalibration';
import { MotionData } from '../hooks/useDeviceMotion';
import './CalibrationPanel.css';

interface CalibrationPanelProps {
  motionData: MotionData | null;
  onCalibrationComplete?: () => void;
}

export function CalibrationPanel({ motionData, onCalibrationComplete }: CalibrationPanelProps) {
  const {
    isCalibrating,
    isCalibrated,
    sampleCount,
    calibrationData,
    quality,
    startCalibration,
    addSample,
    completeCalibration,
    cancelCalibration,
    clearCalibration,
  } = useCalibration();
  
  // Add samples during calibration
  useEffect(() => {
    if (isCalibrating && motionData) {
      addSample(
        motionData.ax,
        motionData.ay,
        motionData.az,
        motionData.gx,
        motionData.gy,
        motionData.gz
      );
    }
  }, [isCalibrating, motionData, addSample]);
  
  // Auto-complete after 250 samples (5 seconds at 50Hz)
  useEffect(() => {
    if (isCalibrating && sampleCount >= 250) {
      const data = completeCalibration();
      if (data && onCalibrationComplete) {
        onCalibrationComplete();
      }
    }
  }, [isCalibrating, sampleCount, completeCalibration, onCalibrationComplete]);
  
  const handleStart = () => {
    startCalibration();
  };
  
  const handleCancel = () => {
    cancelCalibration();
  };
  
  const handleClear = () => {
    if (confirm('Are you sure you want to clear calibration? You will need to recalibrate.')) {
      clearCalibration();
    }
  };
  
  const progress = Math.min((sampleCount / 250) * 100, 100);
  
  return (
    <div className="calibration-panel">
      <h3>📍 Phone Calibration</h3>
      
      <div className="calibration-info">
        <p className="calibration-description">
          Calibrate to compensate for phone mounting angle. Keep the boat steady for 5 seconds.
        </p>
      </div>
      
      {!isCalibrating && !isCalibrated && (
        <div className="calibration-not-started">
          <p className="calibration-status">⚠️ Not calibrated</p>
          <p className="calibration-help">
            For accurate measurements, calibrate the phone mounting position.
          </p>
          <button className="btn btn-primary" onClick={handleStart}>
            <span className="btn-icon">🎯</span>
            Start Calibration
          </button>
        </div>
      )}
      
      {isCalibrating && (
        <div className="calibration-active">
          <p className="calibration-status">🔄 Calibrating...</p>
          <p className="calibration-instruction">Keep boat steady!</p>
          
          <div className="calibration-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="progress-text">
              {sampleCount} / 250 samples ({progress.toFixed(0)}%)
            </p>
          </div>
          
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      )}
      
      {isCalibrated && calibrationData && (
        <div className="calibration-complete">
          <p className="calibration-status">✅ Calibrated</p>
          
          <div className="calibration-details">
            <div className="calibration-metric">
              <span className="metric-label">Pitch:</span>
              <span className="metric-value">{calibrationData.pitchOffset.toFixed(1)}°</span>
            </div>
            <div className="calibration-metric">
              <span className="metric-label">Roll:</span>
              <span className="metric-value">{calibrationData.rollOffset.toFixed(1)}°</span>
            </div>
            <div className="calibration-metric">
              <span className="metric-label">Gravity:</span>
              <span className="metric-value">{calibrationData.gravityMagnitude.toFixed(2)} m/s²</span>
            </div>
            <div className="calibration-metric">
              <span className="metric-label">Quality:</span>
              <span className={`metric-value quality-${quality.toLowerCase()}`}>
                {quality}
              </span>
            </div>
            <div className="calibration-metric">
              <span className="metric-label">Date:</span>
              <span className="metric-value">
                {new Date(calibrationData.timestamp).toLocaleString()}
              </span>
            </div>
          </div>
          
          <div className="calibration-actions">
            <button className="btn btn-primary" onClick={handleStart}>
              <span className="btn-icon">🔄</span>
              Recalibrate
            </button>
            <button className="btn btn-secondary" onClick={handleClear}>
              <span className="btn-icon">🗑️</span>
              Clear
            </button>
          </div>
        </div>
      )}
      
      <div className="calibration-tips">
        <p className="tips-title">💡 Tips:</p>
        <ul className="tips-list">
          <li>Calibrate in calm water or at the dock</li>
          <li>Keep the boat as still as possible</li>
          <li>Recalibrate if phone position changes</li>
          <li>Better quality = more accurate measurements</li>
        </ul>
      </div>
    </div>
  );
}

