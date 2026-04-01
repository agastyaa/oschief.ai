import { useState, useEffect, useRef } from 'react';
import { useAppVisibility } from './useAppVisibility';

/**
 * Hook that derives elapsed seconds from a start time.
 * Only components that call this hook re-render on the timer tick —
 * isolating the timer from the global RecordingContext.
 *
 * Performance: when the app is hidden, the tick interval slows from 1s to 5s
 * to reduce CPU wakeups. The elapsed value is still correct (derived from
 * wall clock), just updates less frequently when nobody is looking.
 *
 * When `isActive` becomes false (paused) but `startTime` is still set,
 * the timer freezes at the last value instead of resetting.
 * Resets to 0 only when `startTime` becomes null.
 * After a pause, the parent should re-anchor `startTime` to `Date.now() - frozenElapsed * 1000`
 * on resume so wall time during the pause is not counted (see NewNotePage handleResume).
 */
export function useElapsedTime(startTime: number | null, isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { isAppHidden } = useAppVisibility();

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!startTime) {
      setElapsed(0);
      return;
    }

    // Compute current value (whether active or just-paused)
    setElapsed(Math.floor((Date.now() - startTime) / 1000));

    if (!isActive) {
      // Paused: freeze at the computed value above, no interval
      return;
    }

    // When hidden, tick every 5s instead of 1s to reduce CPU wakeups.
    // The elapsed value is still accurate (derived from wall clock).
    const tickMs = isAppHidden ? 5000 : 1000;

    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, tickMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [startTime, isActive, isAppHidden]);

  return elapsed;
}
