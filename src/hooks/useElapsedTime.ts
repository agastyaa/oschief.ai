import { useState, useEffect, useRef } from 'react';

/**
 * Hook that derives elapsed seconds from a start time.
 * Only components that call this hook re-render every second —
 * isolating the timer from the global RecordingContext.
 *
 * When `isActive` becomes false (paused) but `startTime` is still set,
 * the timer freezes at the last value instead of resetting.
 * Resets to 0 only when `startTime` becomes null.
 */
export function useElapsedTime(startTime: number | null, isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [startTime, isActive]);

  return elapsed;
}
