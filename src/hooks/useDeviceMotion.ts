import { useEffect, useRef, useCallback } from 'react';
import { demoSource, DEFAULT_DEMO_SCENARIO, type DemoScenario } from '../lib/demo';
import { AccelSignDetector, isAppleMobile } from '../lib/sensors/AccelSignDetector';

/**
 * One IMU sample as the rest of the app sees it.
 *
 * `ax/ay/az` (m/s²) include gravity and follow the W3C convention on every
 * platform: about +9.81 along the device axis that points up. `gx/gy/gz`
 * (deg/s) are the rotation rates about the device x/y/z axes. `t` is on the
 * `performance.now()` clock.
 */
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
  demoScenario?: DemoScenario;
  /** A recording is running: the accelerometer sign convention in use must not change. */
  recording?: boolean;
}

/** A tilt reading older than this is not paired with an accelerometer sample. */
const TILT_MAX_AGE_MS = 500;

/**
 * Hook to access device motion sensor (accelerometer + gyroscope)
 * Supports demo mode for testing without actual sensors
 */
export function useDeviceMotion({
  onMotion,
  enabled,
  demoMode = false,
  demoScenario = DEFAULT_DEMO_SCENARIO,
  recording = false,
}: UseDeviceMotionOptions) {
  const callbackRef = useRef(onMotion);
  callbackRef.current = onMotion;

  const signRef = useRef<AccelSignDetector | null>(null);
  if (signRef.current === null) {
    signRef.current = new AccelSignDetector({
      fallbackInverted: isAppleMobile(typeof navigator !== 'undefined' ? navigator : undefined),
    });
  }
  signRef.current.setLocked(recording);

  const tiltRef = useRef<{ beta: number; gamma: number; at: number } | null>(null);
  const signReportedRef = useRef(false);

  const handleTilt = useCallback((event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return;
    tiltRef.current = { beta: event.beta, gamma: event.gamma, at: performance.now() };
  }, []);

  const handleMotion = useCallback((event: DeviceMotionEvent) => {
    const t = performance.now();
    
    // Get acceleration.
    //
    // The orientation filter (AHRS) needs the FULL specific force — i.e.
    // acceleration INCLUDING gravity — to observe the gravity direction and
    // remove it correctly downstream. Prefer `accelerationIncludingGravity`
    // and only fall back to `acceleration` (linear/gravity-removed) if the
    // device does not provide it. The legacy code preferred the gravity-removed
    // channel, which left the old tilt estimator with no usable reference.
    const withGravity = event.accelerationIncludingGravity;
    const a = withGravity || event.acceleration;
    const g = event.rotationRate;
    
    if (!a || a.x === null) return;
    
    const rawX = a.x || 0;
    const rawY = a.y || 0;
    const rawZ = a.z || 0;

    // iOS reports the accelerometer with the opposite sign to the W3C
    // convention. Normalise here so everything downstream, including stored
    // recordings, sees one convention.
    const detector = signRef.current!;
    const tilt = tiltRef.current;
    if (withGravity && !detector.isDecided && tilt && t - tilt.at <= TILT_MAX_AGE_MS) {
      detector.observe(rawX, rawY, rawZ, tilt.beta, tilt.gamma);
    }
    if (detector.isDecided && !signReportedRef.current) {
      signReportedRef.current = true;
      console.info(
        `[DeviceMotion] Accelerometer sign from sensor data: ${detector.decidedInverted ? 'inverted (iOS)' : 'W3C'} convention` +
          (detector.pending ? '; differs from the sign in use, applied once this recording ends' : ''),
      );
    }
    const sign = detector.sign;

    callbackRef.current({
      t,
      ax: sign * rawX,
      ay: sign * rawY,
      az: sign * rawZ,
      gx: g ? (g.alpha || 0) : 0,
      gy: g ? (g.beta || 0) : 0,
      gz: g ? (g.gamma || 0) : 0,
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (demoMode) {
      return demoSource.subscribe(demoScenario, {
        onMotion: (sample) => callbackRef.current(sample),
      });
    }

    // Real sensor mode
    let cancelled = false;

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

      if (cancelled) return;
      window.addEventListener('devicemotion', handleMotion);
    }

    setupMotion();
    // Device tilt, used only to tell which accelerometer sign convention the platform has.
    window.addEventListener('deviceorientation', handleTilt);

    return () => {
      cancelled = true;
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('deviceorientation', handleTilt);
    };
  }, [enabled, demoMode, demoScenario, handleMotion, handleTilt]);
}
