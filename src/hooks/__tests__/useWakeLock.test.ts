import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWakeLock } from '../useWakeLock';

afterEach(() => {
  // Remove any mocked wakeLock so other tests see the real (absent) API.
  if ('wakeLock' in navigator) {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  }
});

describe('useWakeLock', () => {
  it('reports unsupported when the API is absent (jsdom default)', () => {
    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.isActive).toBe(false);
  });

  it('acquires the lock and reports active when supported', async () => {
    const listeners: Record<string, () => void> = {};
    const sentinel = {
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: (type: string, cb: () => void) => {
        listeners[type] = cb;
      },
    };
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });

    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isSupported).toBe(true);

    await waitFor(() => expect(result.current.isActive).toBe(true));
    expect(request).toHaveBeenCalledWith('screen');

    // Simulate the browser releasing the lock (e.g. page hidden).
    await waitFor(() => expect(typeof listeners.release).toBe('function'));
    listeners.release();
    await waitFor(() => expect(result.current.isActive).toBe(false));
  });

  it('stays inactive if the request rejects', async () => {
    const request = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });

    const { result } = renderHook(() => useWakeLock());
    expect(result.current.isSupported).toBe(true);
    // Give the rejected promise a tick to settle.
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(result.current.isActive).toBe(false);
  });
});
