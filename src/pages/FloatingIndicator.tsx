import { useState, useEffect, useCallback } from "react";
import { getElectronAPI } from "@/lib/electron-api";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type MeetingState = { title: string; startTime: number; isRecording: boolean } | null;

export default function FloatingIndicator() {
  const [state, setState] = useState<MeetingState>(null);
  const [elapsed, setElapsed] = useState(0);
  const api = getElectronAPI();

  useEffect(() => {
    if (!api?.floating?.onState) return;
    const unsub = api.floating.onState((s: MeetingState) => {
      setState(s);
    });
    return unsub;
  }, [api]);

  useEffect(() => {
    if (!state?.startTime) {
      setElapsed(0);
      return;
    }
    setElapsed(Math.floor((Date.now() - state.startTime) / 1000));
    if (!state.isRecording) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - state.startTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [state?.startTime, state?.isRecording]);

  const handleClick = useCallback(() => {
    api?.floating?.focusMain?.();
  }, [api]);

  if (!state) {
    return <div style={{ width: "100%", height: "100%", WebkitAppRegion: "drag" } as React.CSSProperties} />;
  }

  const title = state.title || "Recording";

  return (
    <div
      onClick={handleClick}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 14px",
        borderRadius: 24,
        background: "rgba(30, 28, 25, 0.92)",
        color: "#fff",
        cursor: "pointer",
        WebkitAppRegion: "drag",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 12,
        fontWeight: 500,
        userSelect: "none",
        overflow: "hidden",
      } as React.CSSProperties}
    >
      {state.isRecording ? (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#ef4444",
            flexShrink: 0,
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ) : (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#f59e0b",
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          opacity: 0.8,
          flexShrink: 0,
        }}
      >
        {formatTime(elapsed)}
      </span>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
