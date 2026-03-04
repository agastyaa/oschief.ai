import { useRecording } from "@/contexts/RecordingContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Play, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { loadPreferences } from "@/pages/SettingsPage";
import { cn } from "@/lib/utils";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function LiveMeetingIndicator() {
  const { activeSession, pauseAudioCapture } = useRecording();
  const navigate = useNavigate();
  const location = useLocation();
  const [manuallyHidden, setManuallyHidden] = useState(false);
  const [visible, setVisible] = useState(false);

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

  const handleTimerClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (activeSession?.isRecording) {
        pauseAudioCapture().then(() => {
          navigate(`/new-note?session=${activeSession?.noteId}`, {
            state: { triggerPauseAndSummarize: true },
          });
        });
      } else {
        handleGoToNote();
      }
    },
    [activeSession?.noteId, activeSession?.isRecording, navigate, pauseAudioCapture]
  );

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
  const elapsed = formatTime(activeSession.elapsedSeconds ?? 0);

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
        className="flex items-center gap-2 rounded-full border border-border/50 bg-card/95 shadow-lg px-3 py-2 min-w-[200px] max-w-[280px] animate-in fade-in duration-200"
        style={{
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        {isRecording && (
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        )}
        <span
          className="flex-1 min-w-0 truncate text-[12px] font-medium text-foreground"
          title={title}
        >
          {title}
        </span>
        <button
          onClick={handleTimerClick}
          className={cn(
            "flex items-center gap-1.5 rounded-full border shadow px-2.5 py-1.5 transition-colors",
            isRecording
              ? "border-border bg-card text-muted-foreground hover:text-foreground"
              : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
          )}
          title={isRecording ? "Pause and go to note" : "Go to note"}
        >
          {elapsed && <span className="text-[11px] font-medium">{elapsed}</span>}
          {isRecording ? (
            <svg
              className="h-3.5 w-3.5 text-accent"
              viewBox="0 0 18 16"
              fill="currentColor"
            >
              <rect x="1" y="6" width="2.5" height="7" rx="1">
                <animate
                  attributeName="height"
                  values="7;4;7"
                  dur="0.8s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y"
                  values="6;8;6"
                  dur="0.8s"
                  repeatCount="indefinite"
                />
              </rect>
              <rect x="5.5" y="3" width="2.5" height="10" rx="1">
                <animate
                  attributeName="height"
                  values="10;5;10"
                  dur="0.6s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y"
                  values="3;6;3"
                  dur="0.6s"
                  repeatCount="indefinite"
                />
              </rect>
              <rect x="10" y="5" width="2.5" height="8" rx="1">
                <animate
                  attributeName="height"
                  values="8;3;8"
                  dur="0.7s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y"
                  values="5;8;5"
                  dur="0.7s"
                  repeatCount="indefinite"
                />
              </rect>
              <rect x="14.5" y="4" width="2.5" height="9" rx="1">
                <animate
                  attributeName="height"
                  values="9;5;9"
                  dur="0.9s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y"
                  values="4;7;4"
                  dur="0.9s"
                  repeatCount="indefinite"
                />
              </rect>
            </svg>
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={() => setManuallyHidden(true)}
          className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
