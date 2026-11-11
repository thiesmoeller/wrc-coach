import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDeviceMotion, type MotionData } from '../useDeviceMotion';
import { useGeolocation, type GPSData } from '../useGeolocation';
import { upInDevice } from '../../lib/sensors/AccelSignDetector';

const G = 9.81;
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

// A phone on a footstretcher: tilted well back, slightly rolled.
const BETA = 58;
const GAMMA = -7;
const UP = upInDevice(BETA, GAMMA);

function fireTilt(beta = BETA, gamma = GAMMA): void {
  window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 120, beta, gamma }));
}

/** One `devicemotion` event at rest; `platformSign` −1 mimics iOS. */
function fireMotion(platformSign: 1 | -1): void {
  window.dispatchEvent(
    Object.assign(new Event('devicemotion'), {
      accelerationIncludingGravity: {
        x: platformSign * G * UP.x,
        y: platformSign * G * UP.y,
        z: platformSign * G * UP.z,
      },
      acceleration: { x: 0, y: 0, z: 0 },
      rotationRate: { alpha: 1.5, beta: -2.5, gamma: 3.5 },
    }),
  );
}

const alongUp = (s: MotionData) => s.ax * UP.x + s.ay * UP.y + s.az * UP.z;

describe('useDeviceMotion (real sensors): accelerometer sign convention', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes W3C-convention samples through unchanged', () => {
    const samples: MotionData[] = [];
    renderHook(() => useDeviceMotion({ onMotion: (s) => samples.push(s), enabled: true }));
    for (let i = 0; i < 30; i++) {
      fireTilt();
      fireMotion(1);
    }
    expect(samples).toHaveLength(30);
    for (const s of samples) {
      expect(alongUp(s)).toBeCloseTo(G, 6);
      expect([s.gx, s.gy, s.gz]).toEqual([1.5, -2.5, 3.5]);
    }
  });

  it('flips an inverted platform to the W3C convention once the data has decided, and never the gyro', () => {
    const samples: MotionData[] = [];
    renderHook(() => useDeviceMotion({ onMotion: (s) => samples.push(s), enabled: true }));
    for (let i = 0; i < 40; i++) {
      fireTilt();
      fireMotion(-1);
    }
    // Not an Apple user agent, so the first window of samples still carries the platform's sign.
    expect(alongUp(samples[0])).toBeCloseTo(-G, 6);
    for (const s of samples.slice(12)) {
      expect(alongUp(s)).toBeCloseTo(G, 6);
      expect([s.gx, s.gy, s.gz]).toEqual([1.5, -2.5, 3.5]);
    }
  });

  it('uses the user agent before any orientation data: an iPhone is normalised from the first sample', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    const samples: MotionData[] = [];
    renderHook(() => useDeviceMotion({ onMotion: (s) => samples.push(s), enabled: true }));
    for (let i = 0; i < 5; i++) fireMotion(-1);
    expect(samples).toHaveLength(5);
    for (const s of samples) expect(alongUp(s)).toBeCloseTo(G, 6);
  });

  it('lets the data overrule a wrong user-agent guess', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    const samples: MotionData[] = [];
    renderHook(() => useDeviceMotion({ onMotion: (s) => samples.push(s), enabled: true }));
    for (let i = 0; i < 40; i++) {
      fireTilt();
      fireMotion(1);
    }
    for (const s of samples.slice(12)) expect(alongUp(s)).toBeCloseTo(G, 6);
  });

  it('does not change the sign during a recording; the decision applies once it ends', () => {
    const samples: MotionData[] = [];
    const { rerender } = renderHook(
      ({ recording }) => useDeviceMotion({ onMotion: (s) => samples.push(s), enabled: true, recording }),
      { initialProps: { recording: true } },
    );
    for (let i = 0; i < 60; i++) {
      fireTilt();
      fireMotion(-1);
    }
    expect(samples).toHaveLength(60);
    for (const s of samples) expect(alongUp(s)).toBeCloseTo(-G, 6);

    rerender({ recording: false });
    fireMotion(-1);
    expect(alongUp(samples[samples.length - 1])).toBeCloseTo(G, 6);

    rerender({ recording: true });
    fireMotion(-1);
    expect(alongUp(samples[samples.length - 1])).toBeCloseTo(G, 6);
  });

  it('ignores stale tilt readings', () => {
    const samples: MotionData[] = [];
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    renderHook(() => useDeviceMotion({ onMotion: (s) => samples.push(s), enabled: true }));
    fireTilt();
    now.mockReturnValue(5_000);
    for (let i = 0; i < 40; i++) fireMotion(-1);
    for (const s of samples) expect(alongUp(s)).toBeCloseTo(-G, 6);
  });

  it('stops listening when disabled', () => {
    const samples: MotionData[] = [];
    const { rerender } = renderHook(
      ({ enabled }) => useDeviceMotion({ onMotion: (s) => samples.push(s), enabled }),
      { initialProps: { enabled: true } },
    );
    fireMotion(1);
    rerender({ enabled: false });
    fireMotion(1);
    expect(samples).toHaveLength(1);
  });
});

describe('demo mode: motion and GPS hooks share one simulated boat', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('delivers evenly spaced IMU samples and GPS fixes on the performance clock', () => {
    const motion: MotionData[] = [];
    const fixes: GPSData[] = [];
    const hook = renderHook(() => {
      useDeviceMotion({ onMotion: (s) => motion.push(s), enabled: true, demoMode: true, demoScenario: 'skiffSteady' });
      useGeolocation({ onPosition: (p) => fixes.push(p), enabled: true, demoMode: true, demoScenario: 'skiffSteady' });
    });
    const startedAt = performance.now();
    vi.advanceTimersByTime(10_000);

    expect(motion.length).toBe(500);
    for (let i = 1; i < motion.length; i++) expect(motion[i].t - motion[i - 1].t).toBeCloseTo(20, 6);
    expect(motion[0].t).toBeGreaterThanOrEqual(startedAt);
    expect(motion[motion.length - 1].t).toBeLessThanOrEqual(performance.now());

    expect(fixes.length).toBeGreaterThanOrEqual(9);
    for (const fix of fixes) {
      expect(fix.t).toBeGreaterThanOrEqual(motion[0].t);
      expect(fix.t).toBeLessThanOrEqual(performance.now());
      expect(fix.speed).toBeGreaterThan(2.5);
      expect(fix.speed).toBeLessThan(5);
    }

    // Gravity is present with the W3C sign: the samples are a tilted phone, not a level one.
    const meanNorm = motion.reduce((sum, s) => sum + Math.hypot(s.ax, s.ay, s.az), 0) / motion.length;
    expect(meanNorm).toBeGreaterThan(9.5);
    expect(meanNorm).toBeLessThan(10.2);

    hook.unmount();
    const count = motion.length;
    vi.advanceTimersByTime(1_000);
    expect(motion.length).toBe(count);
  });

  it('restarts the simulated boat when the scenario setting changes', () => {
    // The fake performance clock starts again at 0 for each test; the shared
    // demo source expects a clock that never runs backwards, as the real one does.
    vi.advanceTimersByTime(60_000);
    const fixes: GPSData[] = [];
    const { rerender, unmount } = renderHook(
      ({ scenario }: { scenario: 'skiffSteady' | 'startFromRest' }) => {
        useDeviceMotion({ onMotion: () => {}, enabled: true, demoMode: true, demoScenario: scenario });
        useGeolocation({ onPosition: (p) => fixes.push(p), enabled: true, demoMode: true, demoScenario: scenario });
      },
      { initialProps: { scenario: 'skiffSteady' } },
    );
    vi.advanceTimersByTime(8_000);
    expect(fixes[fixes.length - 1].speed).toBeGreaterThan(2.5);

    fixes.length = 0;
    rerender({ scenario: 'startFromRest' });
    vi.advanceTimersByTime(1_500);
    expect(fixes.length).toBeGreaterThanOrEqual(1);
    expect(fixes[0].speed).toBeLessThan(0.5);
    unmount();
  });
});
