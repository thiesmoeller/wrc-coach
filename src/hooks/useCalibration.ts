import { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneCalibration, CalibrationData } from '../lib/calibration';

const CALIBRATION_STORAGE_KEY = 'wrc-phone-calibration';

/**
 * Hook for managing phone calibration
 */
export function useCalibration() {
  const calibrationRef = useRef(new PhoneCalibration());
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [calibrationData, setCalibrationData] = useState<CalibrationData | null>(null);
  
  // Load calibration from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored) as CalibrationData;
        calibrationRef.current.loadCalibration(data);
        setCalibrationData(data);
        console.log('📍 Calibration loaded from storage');
      } catch (error) {
        console.error('Failed to load calibration:', error);
      }
    }
  }, []);
  
  /**
   * Start calibration process
   */
  const startCalibration = useCallback(() => {
    calibrationRef.current.startCalibration();
    setIsCalibrating(true);
    setSampleCount(0);
  }, []);
  
  /**
   * Add a sample during calibration
   */
  const addSample = useCallback((ax: number, ay: number, az: number, gx: number, gy: number, gz: number) => {
    if (!calibrationRef.current.isCalibrationActive()) return;
    
    calibrationRef.current.addCalibrationSample(ax, ay, az, gx, gy, gz);
    setSampleCount(calibrationRef.current.getSampleCount());
  }, []);
  
  /**
   * Complete calibration
   */
  const completeCalibration = useCallback(() => {
    const data = calibrationRef.current.completeCalibration();
    setIsCalibrating(false);
    
    if (data) {
      setCalibrationData(data);
      
      // Save to localStorage
      try {
        localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(data));
        console.log('✅ Calibration saved to storage');
      } catch (error) {
        console.error('Failed to save calibration:', error);
      }
      
      return data;
    }
    
    return null;
  }, []);
  
  /**
   * Cancel calibration
   */
  const cancelCalibration = useCallback(() => {
    calibrationRef.current.cancelCalibration();
    setIsCalibrating(false);
    setSampleCount(0);
  }, []);
  
  /**
   * Clear calibration
   */
  const clearCalibration = useCallback(() => {
    calibrationRef.current.clearCalibration();
    setCalibrationData(null);
    localStorage.removeItem(CALIBRATION_STORAGE_KEY);
  }, []);
  
  /**
   * Apply calibration to sensor data
   */
  const applyCalibration = useCallback((ax: number, ay: number, az: number) => {
    return calibrationRef.current.applyCalibration(ax, ay, az);
  }, []);
  
  /**
   * Get calibration quality string
   */
  const getQuality = useCallback(() => {
    return calibrationRef.current.getQualityString();
  }, []);
  
  /**
   * Get calibration samples for export
   */
  const getCalibrationSamples = useCallback(() => {
    return calibrationRef.current.getCalibrationSamples();
  }, []);
  
  return {
    // State
    isCalibrating,
    isCalibrated: calibrationData !== null,
    sampleCount,
    calibrationData,
    quality: getQuality(),
    
    // Methods
    startCalibration,
    addSample,
    completeCalibration,
    cancelCalibration,
    clearCalibration,
    applyCalibration,
    getCalibrationSamples,
    
    // Direct access to calibration instance
    calibration: calibrationRef.current,
  };
}

