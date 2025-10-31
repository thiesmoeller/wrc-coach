import { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { MetricsBar } from './components/MetricsBar';
import { ControlPanel } from './components/ControlPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { SessionPanel } from './components/SessionPanel';
import { PolarPlot } from './components/PolarPlot';
import { StabilityPlot } from './components/StabilityPlot';
import { UpdateNotification } from './components/UpdateNotification';
import { useSettings, useDeviceMotion, useDeviceOrientation, useGeolocation, useWakeLock, useCalibration, useSessionStorage, type MotionData, type GPSData, type OrientationData } from './hooks';
import {
  ComplementaryFilter,
  KalmanFilterGPS,
  BandPassFilter,
  LowPassFilter,
} from './lib/filters';
import { StrokeDetector, BaselineCorrector } from './lib/stroke-detection';
import { transformToBoatFrame } from './lib/transforms';
import { convertToSplitTime } from './utils/conversions';
import './App.css';

interface Sample {
  t: number;
  type: 'imu' | 'gps';
  ax?: number;
  ay?: number;
  az?: number;
  gx?: number;
  gy?: number;
  gz?: number;
  mx?: number;
  my?: number;
  mz?: number;
  alpha?: number; // Compass heading from DeviceOrientationEvent
  beta?: number;  // Front-back tilt
  gamma?: number; // Left-right tilt
  lat?: number;
  lon?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  surgeHP?: number;
  inDrive?: boolean;
  strokeAngle?: number;
  roll?: number;
}

function App() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { applyCalibration, isCalibrated, calibrationData } = useCalibration();
  const { sessions, isLoading, saveSession, deleteSession, clearAllSessions, getSessionBinary } = useSessionStorage();
  const [isRunning, setIsRunning] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [latestMotionData, setLatestMotionData] = useState<MotionData | null>(null);
  
  // Metrics
  const [strokeRate, setStrokeRate] = useState(0);
  const [drivePercent, setDrivePercent] = useState(0);
  const [fusedVelocity, setFusedVelocity] = useState(0);
  
  // Session metrics tracking
  const strokeRatesRef = useRef<number[]>([]);
  const drivePercentsRef = useRef<number[]>([]);
  const speedsRef = useRef<number[]>([]);
  
  // Sensor status tracking
  const imuLastTimeRef = useRef<number | null>(null);
  const gyroLastTimeRef = useRef<number | null>(null);
  const orientationLastTimeRef = useRef<number | null>(null);
  const orientationActivatedTimeRef = useRef<number | null>(null);
  const gpsLastTimeRef = useRef<number | null>(null);
  const [sensorStatus, setSensorStatus] = useState({
    imu: false,
    gyro: false,
    mag: false,
    gps: false,
  });
  
  // UI State
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setSettingsPanelOpen(true);
      } else if (e.key === 'Escape') {
        setSettingsPanelOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filters and detectors (using refs to persist across renders)
  const complementaryFilterRef = useRef(new ComplementaryFilter(0.98));
  const kalmanFilterRef = useRef(new KalmanFilterGPS());
  const bandPassFilterRef = useRef(new BandPassFilter(0.3, 1.2, 50));
  const lowPassFilterRef = useRef(new LowPassFilter(0.85));
  const strokeDetectorRef = useRef(new StrokeDetector({
    catchThreshold: settings.catchThreshold,
    finishThreshold: settings.finishThreshold,
  }));
  const baselineCorrectorRef = useRef(new BaselineCorrector(3000));
  
  const lastIMUTimeRef = useRef<number | null>(null);

  // Enable wake lock
  useWakeLock();

  // Monitor visibility changes during recording to detect background interruptions
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isRunning) {
        if (document.hidden) {
          console.warn('⚠️ App went to background during recording!');
          console.warn('💡 Sensor data may be interrupted. Keep app visible during recording.');
        } else {
          console.log('✅ App is visible again, sensors should resume');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRunning]);

  // Update detector thresholds when settings change
  useEffect(() => {
    strokeDetectorRef.current.setThresholds({
      catchThreshold: settings.catchThreshold,
      finishThreshold: settings.finishThreshold,
    });
  }, [settings.catchThreshold, settings.finishThreshold]);

  // Handle IMU data
  const handleMotion = useCallback((data: MotionData) => {
    // Always store latest motion data for calibration
    setLatestMotionData(data);
    
    // Track sensor status
    const now = performance.now();
    imuLastTimeRef.current = now;
    gyroLastTimeRef.current = now; // Gyro comes with accel in DeviceMotion
    
    if (!isRunning) return;

    const dt = lastIMUTimeRef.current ? (data.t - lastIMUTimeRef.current) / 1000 : 0.02;
    lastIMUTimeRef.current = data.t;

    // Apply calibration if available
    const corrected = isCalibrated 
      ? applyCalibration(data.ax, data.ay, data.az)
      : { ax: data.ax, ay: data.ay, az: data.az };

    // Update orientation
    const orientation = complementaryFilterRef.current.update(
      corrected.ax, corrected.ay, corrected.az,
      data.gx, data.gy, data.gz,
      dt
    );

    // Transform to boat frame
    const boatAccel = transformToBoatFrame(
      corrected.ax, corrected.ay, corrected.az,
      orientation,
      settings.phoneOrientation
    );

    // Filter the surge acceleration
    const surgeBP = bandPassFilterRef.current.process(boatAccel.surge);
    const surgeSmooth = lowPassFilterRef.current.process(surgeBP);

    // Detect strokes
    const completedStroke = strokeDetectorRef.current.process(data.t, surgeSmooth);
    if (completedStroke) {
      const sr = completedStroke.strokeRate || 0;
      const dp = completedStroke.drivePercent || 0;
      setStrokeRate(sr);
      setDrivePercent(dp);
      
      // Track metrics for session analysis
      if (sr > 0) {
        strokeRatesRef.current.push(sr);
      }
      if (dp > 0) {
        drivePercentsRef.current.push(dp);
      }
    }

    // Update baseline
    baselineCorrectorRef.current.update(
      data.t,
      surgeSmooth,
      strokeDetectorRef.current.isInDrive()
    );

    // Store sample
    const sample: Sample = {
      ...data,
      type: 'imu',
      surgeHP: surgeSmooth,
      inDrive: strokeDetectorRef.current.isInDrive(),
      strokeAngle: strokeDetectorRef.current.getStrokeAngle(data.t),
      roll: orientation.roll,
    };

    setSamples((prev) => [...prev, sample]);
  }, [isRunning, settings.phoneOrientation, isCalibrated, applyCalibration]);

  // Track orientation sample count for debugging
  const orientationSampleCountRef = useRef(0);
  
  // Handle Device Orientation data (compass/heading - available on all phones)
  const handleOrientation = useCallback((data: OrientationData) => {
    // Track sensor status
    orientationLastTimeRef.current = performance.now();
    
    // Log first few orientation samples for debugging (use console.error for better visibility in adb logcat)
    orientationSampleCountRef.current++;
    if (orientationSampleCountRef.current <= 5) {
      const msg = `[Orientation] Sample ${orientationSampleCountRef.current}: alpha=${data.alpha.toFixed(1)}, beta=${data.beta.toFixed(1)}, gamma=${data.gamma.toFixed(1)}, isRunning=${isRunning}`;
      console.log(msg);
      console.error(msg); // Also log as error for better visibility in adb logcat
    }
    
    if (!isRunning) return;

    const sample: Sample = {
      t: data.t,
      type: 'imu',
      alpha: data.alpha, // Compass heading (0-360°)
      beta: data.beta,   // Front-back tilt
      gamma: data.gamma, // Left-right tilt
    };
    setSamples((prev) => {
      const newSamples = [...prev, sample];
      // Log when we store orientation samples during recording
      if (orientationSampleCountRef.current <= 10) {
        const storeMsg = `[App] Stored orientation sample ${orientationSampleCountRef.current} (total samples: ${newSamples.length})`;
        console.log(storeMsg);
        console.error(storeMsg);
      }
      return newSamples;
    });
  }, [isRunning]);

  // Handle GPS data
  const handlePosition = useCallback((data: GPSData) => {
    // Track sensor status
    gpsLastTimeRef.current = performance.now();
    
    if (!isRunning) return;

    // Update Kalman filter with GPS measurement
    kalmanFilterRef.current.updateGPS(data.speed);
    const velocity = kalmanFilterRef.current.getVelocity();
    setFusedVelocity(velocity);
    
    // Track speeds for session analysis
    if (data.speed > 0) {
      speedsRef.current.push(data.speed);
    }

    // Store sample
    const sample: Sample = {
      ...data,
      type: 'gps',
    };

    setSamples((prev) => [...prev, sample]);
  }, [isRunning]);

  // Setup sensors - always enabled for calibration
  // IMU/Gyro: Event-driven, typically 50-100 Hz (device dependent, includes 60 Hz)
  useDeviceMotion({ onMotion: handleMotion, enabled: true, demoMode: settings.demoMode });
  
  // Device Orientation: Compass/heading (available on all phones via DeviceOrientationEvent)
  const orientationActive = useDeviceOrientation({ onOrientation: handleOrientation, enabled: true });
  
  // GPS: Event-driven, typically ~1 Hz (browser/device controlled)
  useGeolocation({ onPosition: handlePosition, enabled: isRunning, demoMode: settings.demoMode });

  // Track when device orientation becomes active
  useEffect(() => {
    if (orientationActive && orientationActivatedTimeRef.current === null) {
      orientationActivatedTimeRef.current = performance.now();
    } else if (!orientationActive) {
      orientationActivatedTimeRef.current = null;
      orientationLastTimeRef.current = null;
    }
  }, [orientationActive]);

  // Update sensor status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      const TIMEOUT_MS = 2000; // Consider sensor inactive if no data for 2 seconds
      const ACTIVATION_GRACE_MS = 3000; // Show as active for 3 seconds after activation even without data
      
      // In demo mode, all sensors are simulated so show as active
      if (settings.demoMode) {
        setSensorStatus({
          imu: true,
          gyro: true,
          mag: false, // Magnetometer not simulated in demo mode
          gps: isRunning, // GPS only active when recording in demo mode
        });
      } else {
        // For orientation/compass: show active if sensor is running AND either:
        // - we received data recently (within timeout)
        // - sensor just activated and we're within grace period (even without data yet)
        const orientationActiveStatus = orientationActive && (
          (orientationLastTimeRef.current !== null && (now - orientationLastTimeRef.current) < TIMEOUT_MS) ||
          (orientationActivatedTimeRef.current !== null && (now - orientationActivatedTimeRef.current) < ACTIVATION_GRACE_MS)
        );
        
        setSensorStatus({
          imu: imuLastTimeRef.current !== null && (now - imuLastTimeRef.current) < TIMEOUT_MS,
          gyro: gyroLastTimeRef.current !== null && (now - gyroLastTimeRef.current) < TIMEOUT_MS,
          mag: orientationActiveStatus, // Using orientation/compass for mag indicator
          gps: gpsLastTimeRef.current !== null && (now - gpsLastTimeRef.current) < TIMEOUT_MS,
        });
      }
    }, 500); // Check every 500ms
    
    return () => clearInterval(interval);
  }, [settings.demoMode, isRunning, orientationActive]);

  // Start session
  const handleStart = useCallback(() => {
    setIsRunning(true);
    setSessionStartTime(Date.now());
    setSamples([]);
    
    // Reset orientation sample counter for debugging
    orientationSampleCountRef.current = 0;
    
    // Mark session as active (prevents app updates during recording)
    sessionStorage.setItem('wrc_recording_active', 'true');
    
    // Reset filters
    complementaryFilterRef.current.reset();
    kalmanFilterRef.current.reset();
    bandPassFilterRef.current.reset();
    lowPassFilterRef.current.reset();
    strokeDetectorRef.current.reset();
    baselineCorrectorRef.current.reset();
    
    // Reset metrics tracking
    strokeRatesRef.current = [];
    drivePercentsRef.current = [];
    speedsRef.current = [];
    
    setStrokeRate(0);
    setDrivePercent(0);
    setFusedVelocity(0);
  }, []);

  // Stop session and save
  const handleStop = useCallback(async () => {
    setIsRunning(false);
    lastIMUTimeRef.current = null;
    
    // Mark session as inactive (allows app updates)
    sessionStorage.removeItem('wrc_recording_active');
    
    // Calculate session statistics
    const duration = sessionStartTime ? Date.now() - sessionStartTime : 0;
    
    // Calculate average stroke rate
    const avgStrokeRate = strokeRatesRef.current.length > 0
      ? strokeRatesRef.current.reduce((a, b) => a + b, 0) / strokeRatesRef.current.length
      : 0;
    
    // Calculate average drive percent
    const avgDrivePercent = drivePercentsRef.current.length > 0
      ? drivePercentsRef.current.reduce((a, b) => a + b, 0) / drivePercentsRef.current.length
      : 0;
    
    // Calculate max speed
    const maxSpeed = speedsRef.current.length > 0
      ? Math.max(...speedsRef.current)
      : 0;
    
    // Calculate total distance (approximate using GPS samples)
    const gpsSamples = samples.filter(s => s.type === 'gps');
    let totalDistance = 0;
    for (let i = 1; i < gpsSamples.length; i++) {
      const prev = gpsSamples[i - 1];
      const curr = gpsSamples[i];
      if (prev.lat && prev.lon && curr.lat && curr.lon) {
        // Simple distance calculation (Haversine formula)
        const R = 6371000; // Earth's radius in meters
        const dLat = (curr.lat - prev.lat) * Math.PI / 180;
        const dLon = (curr.lon - prev.lon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(prev.lat * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        totalDistance += R * c;
      }
    }
    
    // Save session if we have data
    if (samples.length > 0) {
      try {
        // Debug: Count orientation samples before saving
        const orientationSamples = samples.filter(s => s.type === 'imu' && (s.alpha !== undefined || s.beta !== undefined || s.gamma !== undefined));
        const imuOnlySamples = samples.filter(s => s.type === 'imu' && (s.ax !== undefined || s.gx !== undefined));
        const saveMsg = `[App] Saving session: ${samples.length} total samples, ${orientationSamples.length} orientation samples, ${imuOnlySamples.length} IMU samples`;
        console.log(saveMsg);
        console.error(saveMsg);
        
        await saveSession({
          duration,
          samples,
          sessionStartTime: sessionStartTime!,
          avgStrokeRate,
          avgDrivePercent,
          maxSpeed,
          totalDistance,
          strokeCount: strokeRatesRef.current.length,
          phoneOrientation: settings.phoneOrientation,
          demoMode: settings.demoMode,
          catchThreshold: settings.catchThreshold,
          finishThreshold: settings.finishThreshold,
          calibrationData,
        });
        console.log('Session saved successfully!');
      } catch (error) {
        console.error('Failed to save session:', error);
      }
    }
  }, [samples, sessionStartTime, saveSession, calibrationData, settings]);


  const splitTime = convertToSplitTime(fusedVelocity);

  return (
    <div className="app">
      <Header
        isRecording={isRunning}
        isDemoMode={settings.demoMode}
        sensorStatus={sensorStatus}
        onMenuClick={() => setSettingsPanelOpen(true)}
      />

      {settings.demoMode && (
        <div className="demo-mode-warning">
          ⚠️ DEMO MODE ACTIVE - Using simulated data, not real sensors!
          <button 
            className="disable-demo-btn"
            onClick={() => updateSettings({ demoMode: false })}
          >
            Switch to Real Sensors
          </button>
        </div>
      )}

      <main className="main-content">
        <MetricsBar
          strokeRate={strokeRate}
          drivePercent={drivePercent}
          splitTime={splitTime}
          sampleCount={samples.length}
        />

        {!settings.disablePlots && (
          <>
            <div className="chart-container">
              <h2 className="chart-title">Stroke Cycle Analysis</h2>
              <PolarPlot 
                samples={samples}
                historyStrokes={settings.historyStrokes}
                trailOpacity={settings.trailOpacity}
              />
            </div>

            <div className="chart-container">
              <h2 className="chart-title">Boat Stability (Roll) - Stroke Cycle</h2>
              <StabilityPlot samples={samples} />
            </div>
          </>
        )}
      </main>

      <ControlPanel
        isRunning={isRunning}
        onSessions={() => setSessionPanelOpen(true)}
        onStart={handleStart}
        onStop={handleStop}
      />

      <SessionPanel
        isOpen={sessionPanelOpen}
        onClose={() => setSessionPanelOpen(false)}
        onNewSession={handleStart}
        isRecording={isRunning}
        sessions={sessions}
        deleteSession={deleteSession}
        clearAllSessions={clearAllSessions}
        getSessionBinary={getSessionBinary}
        isLoading={isLoading}
      />

      <SettingsPanel 
        isOpen={settingsPanelOpen} 
        onClose={() => setSettingsPanelOpen(false)}
        motionData={latestMotionData}
        settings={settings}
        updateSettings={updateSettings}
        resetSettings={resetSettings}
      />

      <UpdateNotification />
    </div>
  );
}

export default App;

