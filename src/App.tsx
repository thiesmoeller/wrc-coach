import { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { CircularBuffer } from './lib/data-storage/CircularBuffer';
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
  const { sessions, isLoading, saveSession, saveSessionIncremental, deleteSession, clearAllSessions, getSessionBinary } = useSessionStorage();
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false); // Ref to track isRunning for callbacks
  // Circular buffer: ~2-3 minutes of samples (roughly 6000-12000 samples at 50-100 Hz)
  const CIRCULAR_BUFFER_SIZE = 12000; // ~3 minutes at 100 Hz
  const BATCH_WRITE_SIZE_BYTES = 32 * 1024; // 32KB
  
  // UI samples: Keep only last 2 minutes for plots (sufficient for last N strokes)
  const [samples, setSamples] = useState<Sample[]>([]);
  const UI_SAMPLES_DURATION_MS = 2 * 60 * 1000; // 2 minutes
  
  // Total sample counter: Track total samples independently of UI samples
  const [totalSampleCount, setTotalSampleCount] = useState(0);
  
  // Circular buffer for samples
  const sampleBufferRef = useRef<CircularBuffer<Sample>>(new CircularBuffer(CIRCULAR_BUFFER_SIZE));
  
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null); // Ref to track session start time
  const [latestMotionData, setLatestMotionData] = useState<MotionData | null>(null);
  const currentSessionIdRef = useRef<string | null>(null); // Track current session ID for batch writes
  const writeCheckIntervalRef = useRef<number | null>(null); // Check for write every second
  
  // Keep sessionStartTime ref in sync with state
  useEffect(() => {
    sessionStartTimeRef.current = sessionStartTime;
  }, [sessionStartTime]);
  
  // Keep ref in sync with state
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);
  
  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (writeCheckIntervalRef.current !== null) {
        clearInterval(writeCheckIntervalRef.current);
        writeCheckIntervalRef.current = null;
      }
    };
  }, []);
  
  // Metrics
  const [strokeRate, setStrokeRate] = useState(0);
  const [drivePercent, setDrivePercent] = useState(0);
  const [fusedVelocity, setFusedVelocity] = useState(0);
  
  // Session metrics tracking
  const strokeRatesRef = useRef<number[]>([]);
  const drivePercentsRef = useRef<number[]>([]);
  const speedsRef = useRef<number[]>([]);
  
  // Helper: Limit UI samples to last 2 minutes
  const limitUISamples = useCallback((newSamples: Sample[]) => {
    if (!sessionStartTimeRef.current) return newSamples;
    
      const cutoffTime = Date.now() - UI_SAMPLES_DURATION_MS;
      return newSamples.filter(s => {
        const sampleTime = s.t || 0;
        // If sample time is relative (smaller than session start), convert to absolute
        const absoluteTime = sampleTime < sessionStartTimeRef.current! 
          ? sessionStartTimeRef.current! + sampleTime 
          : sampleTime;
        return absoluteTime >= cutoffTime;
      });
  }, []);
  
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

    // Add to circular buffer
    sampleBufferRef.current.push(sample);
    
    // Update UI samples from buffer (limited to last 2 minutes)
    const allBufferSamples = sampleBufferRef.current.getAllItems();
    setSamples(limitUISamples(allBufferSamples));
    
    // Increment total sample counter
    setTotalSampleCount(prev => prev + 1);
  }, [isRunning, settings.phoneOrientation, isCalibrated, applyCalibration, limitUISamples]);

  // Track orientation sample count for debugging
  const orientationSampleCountRef = useRef(0);
  
  // Handle Device Orientation data (compass/heading - available on all phones)
  const handleOrientation = useCallback((data: OrientationData) => {
    // Track sensor status
    orientationLastTimeRef.current = performance.now();
    
    // Use ref to check isRunning (avoids closure issues)
    const currentlyRunning = isRunningRef.current;
    
      // Log first few orientation samples for debugging
      orientationSampleCountRef.current++;
      if (orientationSampleCountRef.current <= 5) {
        const msg = `[Orientation] Sample ${orientationSampleCountRef.current}: alpha=${data.alpha.toFixed(1)}, beta=${data.beta.toFixed(1)}, gamma=${data.gamma.toFixed(1)}, isRunning=${currentlyRunning}`;
        console.log(msg);
      }
    
    if (!currentlyRunning) return;

    const sample: Sample = {
      t: data.t,
      type: 'imu',
      alpha: data.alpha, // Compass heading (0-360°)
      beta: data.beta,   // Front-back tilt
      gamma: data.gamma, // Left-right tilt
    };
    // Add to circular buffer
    sampleBufferRef.current.push(sample);
    
    // Update UI samples from buffer (limited to last 2 minutes)
    const allBufferSamples = sampleBufferRef.current.getAllItems();
    setSamples(limitUISamples(allBufferSamples));
    
    // Increment total sample counter
    setTotalSampleCount(prev => prev + 1);
    
    // Log when we store orientation samples during recording
    if (orientationSampleCountRef.current <= 10) {
      const storeMsg = `[App] Stored orientation sample ${orientationSampleCountRef.current} (total samples: ${totalSampleCount + 1})`;
      console.log(storeMsg);
    }
  }, []); // Empty deps - using ref instead

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

    // Add to circular buffer
    sampleBufferRef.current.push(sample);
    
    // Update UI samples from buffer (limited to last 2 minutes)
    const allBufferSamples = sampleBufferRef.current.getAllItems();
    setSamples(limitUISamples(allBufferSamples));
    
    // Increment total sample counter
    setTotalSampleCount(prev => prev + 1);
  }, [isRunning, limitUISamples]);

  // Setup sensors - always enabled for calibration
  // IMU/Gyro: Event-driven, typically 50-100 Hz (device dependent, includes 60 Hz)
  useDeviceMotion({ onMotion: handleMotion, enabled: true, demoMode: settings.demoMode });
  
  // Device Orientation: Compass/heading (available on all phones via DeviceOrientationEvent)
  const orientationActive = useDeviceOrientation({ onOrientation: handleOrientation, enabled: true, demoMode: settings.demoMode });
  
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
          mag: orientationActive, // Orientation is now simulated in demo mode
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

  // Helper function to calculate current session metrics
  // Uses accumulated refs (independent of samples in memory)
  const calculateCurrentMetrics = useCallback(() => {
    const startTime = sessionStartTimeRef.current;
    const duration = startTime ? Date.now() - startTime : 0;
    
    // Calculate average stroke rate from tracked strokes (accumulated)
    const avgStrokeRate = strokeRatesRef.current.length > 0
      ? strokeRatesRef.current.reduce((a, b) => a + b, 0) / strokeRatesRef.current.length
      : 0;
    
    // Calculate average drive percent (accumulated)
    const avgDrivePercent = drivePercentsRef.current.length > 0
      ? drivePercentsRef.current.reduce((a, b) => a + b, 0) / drivePercentsRef.current.length
      : 0;
    
    // Calculate max speed (accumulated)
    const maxSpeed = speedsRef.current.length > 0
      ? Math.max(...speedsRef.current)
      : 0;
    
    // Calculate total distance - approximate from GPS samples in memory
    // For accurate distance, would need all GPS samples, but this is sufficient for display
    // Use current samples state snapshot to avoid stale closure issues
    const currentSamples = samples; // Capture current value
    const gpsSamples = currentSamples.filter(s => s.type === 'gps');
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
    
    return {
      duration,
      avgStrokeRate,
      avgDrivePercent,
      maxSpeed,
      totalDistance,
      strokeCount: strokeRatesRef.current.length,
    };
  }, [samples]);

  // Estimate binary size for samples (rough estimate: ~32 bytes per IMU sample, ~36 bytes per GPS sample)
  const estimateBinarySize = useCallback((samples: Sample[]): number => {
    let size = 128; // Header size
    for (const sample of samples) {
      if (sample.type === 'imu') {
        size += 44; // V3 IMU sample size (with magnetometer)
      } else if (sample.type === 'gps') {
        size += 36; // GPS sample size
      }
    }
    return size;
  }, []);
  
  // Check if >= 32KB ready and write to flash
  const checkAndWrite = useCallback(async () => {
    if (!isRunningRef.current || !currentSessionIdRef.current) {
      return;
    }
    
    const readySamples = sampleBufferRef.current.getReadyItems();
    if (readySamples.length === 0) return;
    
    const estimatedSize = estimateBinarySize(readySamples);
    if (estimatedSize < BATCH_WRITE_SIZE_BYTES) {
      return; // Not enough data yet
    }
    
    try {
      // Calculate metrics from accumulated refs
      const metrics = calculateCurrentMetrics();
      
      // Write ready samples to flash
      await saveSessionIncremental(currentSessionIdRef.current, {
        sessionStartTime: sessionStartTimeRef.current!,
        duration: metrics.duration,
        samples: readySamples,
        avgStrokeRate: metrics.avgStrokeRate,
        avgDrivePercent: metrics.avgDrivePercent,
        maxSpeed: metrics.maxSpeed,
        totalDistance: metrics.totalDistance,
        strokeCount: metrics.strokeCount,
        phoneOrientation: settings.phoneOrientation,
        demoMode: settings.demoMode,
        catchThreshold: settings.catchThreshold,
        finishThreshold: settings.finishThreshold,
        calibrationData,
      });
      
      // Write finished - reposition pointers
      sampleBufferRef.current.clearReady();
      
      console.log(`[App] Wrote ${readySamples.length} samples (${(estimatedSize / 1024).toFixed(1)}KB) to flash`);
    } catch (error) {
      console.error('[App] Failed to write to flash:', error);
      // Don't clear on error - will retry
    }
  }, [saveSessionIncremental, calculateCurrentMetrics, settings, calibrationData, estimateBinarySize]);
  
  // Start session
  const handleStart = useCallback(async () => {
    setIsRunning(true);
    const startTime = Date.now();
    setSessionStartTime(startTime);
    sessionStartTimeRef.current = startTime;
    setSamples([]);
    setTotalSampleCount(0);
    sampleBufferRef.current.clear();
    
    // Create initial session ID
    const sessionId = `session_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    currentSessionIdRef.current = sessionId;
    
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
    
    // Start write check interval (every 1 second) - check if >= 32KB ready
    writeCheckIntervalRef.current = window.setInterval(() => {
      checkAndWrite();
    }, 1000);
    
    console.log(`[App] Recording started with session ID: ${sessionId}`);
  }, [checkAndWrite]);

  // Stop session and save
  const handleStop = useCallback(async () => {
    setIsRunning(false);
    lastIMUTimeRef.current = null;
    
    // Clear write check interval
    if (writeCheckIntervalRef.current !== null) {
      clearInterval(writeCheckIntervalRef.current);
      writeCheckIntervalRef.current = null;
    }
    
    // Mark session as inactive (allows app updates)
    sessionStorage.removeItem('wrc_recording_active');
    
    // Final save - write any remaining samples in buffer
    if (currentSessionIdRef.current) {
      try {
        const remainingSamples = sampleBufferRef.current.getReadyItems();
        if (remainingSamples.length > 0) {
          // Calculate final metrics from accumulated refs
          const metrics = calculateCurrentMetrics();
          
          // Write final samples
          await saveSessionIncremental(currentSessionIdRef.current, {
            duration: metrics.duration,
            samples: remainingSamples,
            sessionStartTime: sessionStartTime!,
            avgStrokeRate: metrics.avgStrokeRate,
            avgDrivePercent: metrics.avgDrivePercent,
            maxSpeed: metrics.maxSpeed,
            totalDistance: metrics.totalDistance,
            strokeCount: metrics.strokeCount,
            phoneOrientation: settings.phoneOrientation,
            demoMode: settings.demoMode,
            catchThreshold: settings.catchThreshold,
            finishThreshold: settings.finishThreshold,
            calibrationData,
          });
          
          // Reposition pointers
          sampleBufferRef.current.clearReady();
          
          console.log(`[App] Final save completed: wrote ${remainingSamples.length} samples`);
        }
      } catch (error) {
        console.error('Failed to save session:', error);
      } finally {
        // Clear session ID and buffers
        currentSessionIdRef.current = null;
        sampleBufferRef.current.clear();
        setTotalSampleCount(0);
      }
    } else {
      // Fallback: create new session if no session ID (shouldn't happen normally)
      try {
        const allSamples = sampleBufferRef.current.getAllItems();
        if (allSamples.length > 0) {
          const metrics = calculateCurrentMetrics();
        await saveSession({
          duration: metrics.duration,
          samples: allSamples,
          sessionStartTime: sessionStartTime!,
          avgStrokeRate: metrics.avgStrokeRate,
          avgDrivePercent: metrics.avgDrivePercent,
          maxSpeed: metrics.maxSpeed,
          totalDistance: metrics.totalDistance,
          strokeCount: metrics.strokeCount,
          phoneOrientation: settings.phoneOrientation,
          demoMode: settings.demoMode,
          catchThreshold: settings.catchThreshold,
          finishThreshold: settings.finishThreshold,
          calibrationData,
        });
          console.log('Session saved successfully!');
        }
      } catch (error) {
        console.error('Failed to save session:', error);
      } finally {
        sampleBufferRef.current.clear();
        setTotalSampleCount(0);
      }
    }
  }, [sessionStartTime, saveSessionIncremental, calculateCurrentMetrics, calibrationData, settings]);


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
          sampleCount={totalSampleCount}
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

