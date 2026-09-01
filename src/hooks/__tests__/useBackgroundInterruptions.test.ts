import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBackgroundInterruptions } from '../useBackgroundInterruptions';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

afterEach(() => {
  setVisibility('visible');
});

describe('useBackgroundInterruptions', () => {
  it('does not track while inactive', () => {
    const { result } = renderHook(() => useBackgroundInterruptions(false));
    setVisibility('hidden');
    expect(result.current.count).toBe(0);
    expect(result.current.wasInterrupted).toBe(false);
  });

  it('records a background interruption while active', () => {
    const { result } = renderHook((active: boolean) => useBackgroundInterruptions(active), {
      initialProps: true,
    });

    expect(result.current.isHidden).toBe(false);

    setVisibility('hidden');
    expect(result.current.isHidden).toBe(true);
    expect(result.current.count).toBe(1);
    expect(result.current.wasInterrupted).toBe(true);

    setVisibility('visible');
    expect(result.current.isHidden).toBe(false);
    expect(result.current.count).toBe(1);
    expect(result.current.totalHiddenMs).toBeGreaterThanOrEqual(0);
  });

  it('counts multiple interruptions', () => {
    const { result } = renderHook(() => useBackgroundInterruptions(true));
    setVisibility('hidden');
    setVisibility('visible');
    setVisibility('hidden');
    setVisibility('visible');
    expect(result.current.count).toBe(2);
  });

  it('resets when a new session starts (active toggles true)', () => {
    const { result, rerender } = renderHook(
      (active: boolean) => useBackgroundInterruptions(active),
      { initialProps: true },
    );

    setVisibility('hidden');
    setVisibility('visible');
    expect(result.current.count).toBe(1);

    // Session ends.
    rerender(false);
    expect(result.current.count).toBe(0);

    // New session begins → tracker reset, counting starts fresh.
    rerender(true);
    expect(result.current.count).toBe(0);
    setVisibility('hidden');
    expect(result.current.count).toBe(1);
  });
});
