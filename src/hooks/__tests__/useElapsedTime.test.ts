import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElapsedTime } from '../useElapsedTime';

describe('useElapsedTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 when inactive', () => {
    const { result } = renderHook(() => useElapsedTime(null, false));
    expect(result.current).toBe(0);
  });

  it('returns 0 when no start time', () => {
    const { result } = renderHook(() => useElapsedTime(null, true));
    expect(result.current).toBe(0);
  });

  it('computes elapsed seconds from startTime', () => {
    const startTime = Date.now() - 5000; // 5 seconds ago
    const { result } = renderHook(() => useElapsedTime(startTime, true));
    expect(result.current).toBe(5);
  });

  it('increments every second when active', () => {
    const startTime = Date.now();
    const { result } = renderHook(() => useElapsedTime(startTime, true));
    expect(result.current).toBe(0);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(1);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(3);
  });

  it('resets to 0 when deactivated', () => {
    const startTime = Date.now() - 10000;
    const { result, rerender } = renderHook(
      ({ start, active }) => useElapsedTime(start, active),
      { initialProps: { start: startTime as number | null, active: true } }
    );
    expect(result.current).toBe(10);

    rerender({ start: null, active: false });
    expect(result.current).toBe(0);
  });

  it('cleans up interval on unmount', () => {
    const startTime = Date.now();
    const { unmount } = renderHook(() => useElapsedTime(startTime, true));
    unmount();
    // Should not throw or leave dangling timers
    act(() => { vi.advanceTimersByTime(5000); });
  });
});
