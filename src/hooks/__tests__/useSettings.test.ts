import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from '../useSettings';

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads without catch/finish thresholds or phone orientation', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings).not.toHaveProperty('catchThreshold');
    expect(result.current.settings).not.toHaveProperty('finishThreshold');
    expect(result.current.settings).not.toHaveProperty('phoneOrientation');
    expect(result.current.settings.demoMode).toBe(false);
  });

  it('strips legacy inferred keys from stored settings', () => {
    localStorage.setItem(
      'strokeCoachSettings',
      JSON.stringify({
        historyStrokes: 4,
        catchThreshold: 0.9,
        finishThreshold: -0.5,
        phoneOrientation: 'coxswain',
        demoMode: true,
      }),
    );

    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.historyStrokes).toBe(4);
    expect(result.current.settings.demoMode).toBe(true);
    expect(result.current.settings).not.toHaveProperty('catchThreshold');
    expect(result.current.settings).not.toHaveProperty('finishThreshold');
    expect(result.current.settings).not.toHaveProperty('phoneOrientation');
  });

  it('persists visualization updates without reintroducing legacy keys', () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.updateSettings({ trailOpacity: 70 });
    });
    const stored = JSON.parse(localStorage.getItem('strokeCoachSettings')!);
    expect(stored.trailOpacity).toBe(70);
    expect(stored.catchThreshold).toBeUndefined();
    expect(stored.phoneOrientation).toBeUndefined();
  });
});
