import { useRecording } from "@/contexts/RecordingContext";
import { useNavigate, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { loadPreferences } from "@/pages/SettingsPage";
import { useElapsedTime } from "@/hooks/useElapsedTime";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LiveMeetingIndicator() {
  const { activeSession } = useRecording();
  const navigate = useNavigate();
  const location = useLocation();
  const [manuallyHidden, setManuallyHidden] = useState(false);
  const [visible, setVisible] = useState(false);

  const elapsedSeconds = useElapsedTime(
    activeSession?.startTime ?? null,
    activeSession?.isRecording ?? false,
  );

  useEffect(() => {
    setManuallyHidden(false);
  }, [activeSession?.noteId]);

  useEffect(() => {
    if (activeSession && location.pathname !== "/new-note") {
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [activeSession, location.pathname]);

  const handleGoToNote = useCallback(() => {
    navigate(`/new-note?session=${activeSession?.noteId}`);
  }, [activeSession?.noteId, navigate]);

  const prefs = loadPreferences();

  if (
    !activeSession ||
    location.pathname === "/new-note" ||
    !prefs.showRecordingIndicator ||
    manuallyHidden
  )
    return null;

  const title = activeSession.title || "Recording";
  const isRecording = activeSession.isRecording;
  const elapsed = formatTime(elapsedSeconds);

  return (
    <div
      className="fixed top-3 right-4 z-[9999]"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-8px)",
        transition: "transform 0.25s ease, opacity 0.2s ease",
      }}
    >
      <div
        onClick={handleGoToNote}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 24,
          background: "rgba(30, 28, 25, 0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          color: "#fff",
          cursor: "pointer",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 12,
          fontWeight: 500,
          userSelect: "none",
          overflow: "hidden",
          minWidth: 200,
          maxWidth: 280,
          boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
        }}
      >
        {isRecording ? (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#ef4444",
              flexShrink: 0,
              animation: "live-indicator-pulse 1.5s ease-in-out infinite",
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
          title={title}
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
          {elapsed}
        </span>
        <span
          onClick={(e) => { e.stopPropagation(); setManuallyHidden(true); }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            cursor: "pointer",
            flexShrink: 0,
            opacity: 0.5,
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.5"; }}
          title="Dismiss"
        >
          <X style={{ width: 12, height: 12 }} />
        </span>
      </div>
      <style>{`
        @keyframes live-indicator-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
