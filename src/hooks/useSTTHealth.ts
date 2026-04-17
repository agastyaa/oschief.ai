import { useEffect, useState } from "react";

export type STTHealth = "healthy" | "restarting" | "fallback" | "unknown";

/**
 * R7 — poll STT worker health so the UI can surface degraded states in the
 * status bar. `stt:get-health` is cheap (reads two in-memory flags); polling
 * at 2s is plenty responsive without burning cycles.
 *
 * Returns "unknown" until the first successful poll. The underlying IPC
 * exists in the Electron preload as `window.electronAPI.recording.getSTTHealth`.
 */
export function useSTTHealth(
  active: boolean,
  intervalMs = 2000,
): STTHealth {
  const [health, setHealth] = useState<STTHealth>("unknown");

  useEffect(() => {
    if (!active) {
      setHealth("unknown");
      return;
    }
    const api = (window as any).electronAPI?.recording?.getSTTHealth as
      | (() => Promise<STTHealth>)
      | undefined;
    if (!api) {
      setHealth("unknown");
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const v = await api();
        if (!cancelled) setHealth(v);
      } catch {
        if (!cancelled) setHealth("unknown");
      }
    };
    poll();
    const id = window.setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, intervalMs]);

  return health;
}
