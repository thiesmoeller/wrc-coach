import { useEffect, useRef, useCallback } from 'react';

export interface MotionData {
  t: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export interface UseDeviceMotionOptions {
  onMotion: (data: MotionData) => void;
  enabled: boolean;
  demoMode?: boolean;
}

/**
 * Hook to access device motion sensor (accelerometer + gyroscope)
 * Supports demo mode for testing without actual sensors
 */
export function useDeviceMotion({ onMotion, enabled, demoMode = false }: UseDeviceMotionOptions) {
  const callbackRef = useRef(onMotion);
  callbackRef.current = onMotion;
  const demoIntervalRef = useRef<number | null>(null);

  const handleMotion = useCallback((event: DeviceMotionEvent) => {
    const t = performance.now();
    
    // Get acceleration
    const a = event.acceleration || event.accelerationIncludingGravity;
    const g = event.rotationRate;
    
    if (!a || a.x === null) return;
    
    const ax = a.x || 0;
    const ay = a.y || 0;
    const az = a.z || 0;
    const gx = g ? (g.alpha || 0) : 0;
    const gy = g ? (g.beta || 0) : 0;
    const gz = g ? (g.gamma || 0) : 0;
    
    callbackRef.current({
      t,
      ax,
      ay,
      az,
      gx,
      gy,
      gz,
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Demo mode: simulate realistic rowing motion at 25 SPM
    if (demoMode) {
      const strokeRate = 25; // SPM
      const strokePeriod = 60000 / strokeRate; // ms per stroke (2400ms)
      const sampleRate = 50; // Hz
      const dt = 1000 / sampleRate; // ms (20ms between samples)
      
      // Simulate phone mounted level (no offset) for normal demo use
      // For calibration testing, use Settings → Calibration with actual offset
      const mountingPitch = 0; // degrees (level)
      const mountingRoll = 0; // degrees (level)
      const pitchRad = mountingPitch * Math.PI / 180;
      const rollRad = mountingRoll * Math.PI / 180;
      
      let startTime = performance.now();
      
      demoIntervalRef.current = window.setInterval(() => {
        const t = performance.now();
        const elapsed = t - startTime;
        
        // Calculate position in stroke cycle (0 to 1)
        const cyclePosition = (elapsed % strokePeriod) / strokePeriod;
        
        // Research-based optimal rowing pattern
        // Based on Kleshnev, Holt et al. (2021), Greidanus studies
        let surge: number;
        
        if (cyclePosition < 0.05) {
          // PRE-CATCH CHECK: Minimal but unavoidable deceleration
          // "Check should be as narrow and shallow as possible" - PLOS
          const checkPhase = cyclePosition / 0.05;
          surge = -0.5 * Math.sin(checkPhase * Math.PI);
          
        } else if (cyclePosition < 0.08) {
          // CATCH TRANSITION: Rapid reversal from decel to accel
          // "Cross zero acceleration quickly" - rowinginmotion
          const transitionPhase = (cyclePosition - 0.05) / 0.03;
          surge = -0.5 + (3.5 * transitionPhase); // Sharp rise
          
        } else if (cyclePosition < 0.35) {
          // DRIVE PHASE: Smooth continuous positive acceleration
          // Dual-peak pattern (legs → back → arms) - Kleshnev
          const drivePhase = (cyclePosition - 0.08) / 0.27;
          
          if (drivePhase < 0.4) {
            // First peak (leg drive)
            surge = 3.2 * Math.sin(drivePhase * Math.PI / 0.4);
          } else if (drivePhase < 0.5) {
            // Transition (legs → back)
            surge = 2.8 - (drivePhase - 0.4) * 2.0;
          } else {
            // Second peak (back + arms)
            surge = 2.6 + 0.6 * Math.sin((drivePhase - 0.5) * Math.PI / 0.5);
          }
          
        } else if (cyclePosition < 0.40) {
          // FINISH/EXTRACTION: Clean taper, minimal reverse
          // "Finish cleanly, minimize losses" - Archinisis
          const finishPhase = (cyclePosition - 0.35) / 0.05;
          surge = 2.6 * (1 - finishPhase) - 0.3 * finishPhase;
          
        } else if (cyclePosition < 0.75) {
          // EARLY RECOVERY: Preserve forward velocity
          // "Minimal deceleration, smooth and controlled" - rowinginmotion
          const recoveryPhase = (cyclePosition - 0.40) / 0.35;
          surge = -0.25 * Math.sin(recoveryPhase * Math.PI);
          
        } else {
          // LATE RECOVERY: Approach to catch
          // "Soft approach, set up for clean catch" - Archinisis
          const approachPhase = (cyclePosition - 0.75) / 0.25;
          surge = -0.15 - 0.25 * Math.sin(approachPhase * Math.PI * 0.8);
        }
        
        // Add minimal realistic noise
        const noise = (Math.random() - 0.5) * 0.05;
        
        // Ideal sensor readings (boat frame)
        const surge_ideal = surge + noise;
        const sway_ideal = (Math.random() - 0.5) * 0.05; // minimal lateral
        const heave_ideal = (Math.random() - 0.5) * 0.1; // small vertical variations
        
        // Transform to phone frame (foot rest mounting)
        // In boat frame: surge (y), sway (x), heave (z)
        // Apply mounting rotation to get what phone sensors would read
        
        // First, compose boat acceleration with gravity
        const ax_boat = sway_ideal;
        const ay_boat = surge_ideal;
        const az_boat = heave_ideal - 9.8; // gravity in boat frame (pointing down)
        
        // Apply pitch rotation (phone tilted back 45°)
        const ax1 = ax_boat;
        const ay1 = ay_boat * Math.cos(pitchRad) + az_boat * Math.sin(pitchRad);
        const az1 = -ay_boat * Math.sin(pitchRad) + az_boat * Math.cos(pitchRad);
        
        // Apply roll rotation (slight port tilt)
        const ax = ax1 * Math.cos(rollRad) - az1 * Math.sin(rollRad);
        const ay = ay1;
        const az = ax1 * Math.sin(rollRad) + az1 * Math.cos(rollRad);
        
        // Simulate realistic rotational motion
        // More pronounced roll due to position at bow
        const gx = Math.sin(cyclePosition * Math.PI * 2) * 4 + (Math.random() - 0.5) * 0.8; // roll rate (amplified)
        const gy = Math.cos(cyclePosition * Math.PI * 2) * 2.5 + (Math.random() - 0.5) * 0.4; // pitch rate
        const gz = (Math.random() - 0.5) * 0.6; // yaw rate (minimal)
        
        callbackRef.current({
          t,
          ax,
          ay,
          az,
          gx,
          gy,
          gz,
        });
      }, dt);
      
      return () => {
        if (demoIntervalRef.current !== null) {
          clearInterval(demoIntervalRef.current);
        }
      };
    }

    // Real sensor mode
    async function setupMotion() {
      // Request permission on iOS
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function'
      ) {
        try {
          const response = await (DeviceMotionEvent as any).requestPermission();
          if (response !== 'granted') {
            console.error('Motion permission denied');
            return;
          }
        } catch (error) {
          console.error('Error requesting motion permission:', error);
          return;
        }
      }

      window.addEventListener('devicemotion', handleMotion);
    }

    setupMotion();

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [enabled, demoMode, handleMotion]);
}

