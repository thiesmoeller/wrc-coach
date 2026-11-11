import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGeolocation, type GPSData } from '../useGeolocation';

type Success = (position: GeolocationPosition) => void;

function position(timestamp: number, speed: number | null = 4.1): GeolocationPosition {
  return {
    timestamp,
    coords: {
      latitude: 53.5,
      longitude: 10,
      speed,
      heading: 87,
      accuracy: 4,
      altitude: null,
      altitudeAccuracy: null,
    },
  } as GeolocationPosition;
}

describe('useGeolocation (real GPS): fixes are stamped on the IMU clock', () => {
  let success: Success | null = null;
  const clearWatch = vi.fn();
  const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');

  beforeEach(() => {
    success = null;
    clearWatch.mockClear();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (onSuccess: Success) => {
          success = onSuccess;
          return 42;
        },
        clearWatch,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (original) Object.defineProperty(navigator, 'geolocation', original);
    else delete (navigator as unknown as { geolocation?: unknown }).geolocation;
  });

  it('uses performance.now() minus the age of the fix, not the epoch timestamp', () => {
    const epochNow = 1_762_862_400_000;
    vi.spyOn(Date, 'now').mockReturnValue(epochNow);
    vi.spyOn(performance, 'now').mockReturnValue(73_500);

    const fixes: GPSData[] = [];
    const { unmount } = renderHook(() => useGeolocation({ onPosition: (p) => fixes.push(p), enabled: true }));
    success!(position(epochNow - 350));
    success!(position(epochNow + 2_000));
    success!(position(epochNow - 45_000, null));
    unmount();

    expect(fixes.map((f) => f.t)).toEqual([73_150, 73_500, 63_500]);
    expect(fixes[0]).toEqual({ t: 73_150, lat: 53.5, lon: 10, speed: 4.1, heading: 87, accuracy: 4 });
    expect(fixes[2].speed).toBe(0);
  });

  it('clears the watch when disabled', () => {
    const { rerender, unmount } = renderHook(
      ({ enabled }) => useGeolocation({ onPosition: () => {}, enabled }),
      { initialProps: { enabled: true } },
    );
    expect(success).not.toBeNull();
    rerender({ enabled: false });
    expect(clearWatch).toHaveBeenCalledWith(42);
    unmount();
  });
});
