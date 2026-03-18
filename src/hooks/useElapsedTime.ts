import { useState, useEffect, useRef } from 'react';

/**
 * Hook that derives elapsed seconds from a start time.
 * Only components that call this hook re-render every second —
 * isolating the timer from the global RecordingContext.
 */
export function useElapsedTime(startTime: number | null, isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive || !startTime) {
      setElapsed(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Set initial value immediately
    setElapsed(Math.floor((Date.now() - startTime) / 1000));

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
