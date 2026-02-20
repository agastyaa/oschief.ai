import { useRecording } from "@/contexts/RecordingContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Square, FileText } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { loadPreferences } from "@/pages/SettingsPage";

export function LiveMeetingIndicator() {
  const { activeSession, clearSession, stopAudioCapture } = useRecording();
  const navigate = useNavigate();
  const location = useLocation();
  const [manuallyHidden, setManuallyHidden] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

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

  const handleStop = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExiting(true);
    await stopAudioCapture();
    clearSession();
    setTimeout(() => setIsExiting(false), 300);
  }, [stopAudioCapture, clearSession]);

  const prefs = loadPreferences();

  // Only show when actively recording; hide when paused so it doesn't persist
  if (
    !activeSession ||
    !activeSession.isRecording ||
    location.pathname === "/new-note" ||
    !prefs.showRecordingIndicator ||
    manuallyHidden
  ) return null;

  const title = activeSession.title || "Recording";

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
        className={`flex items-center gap-2 rounded-full border border-border/50 bg-card/95 shadow-lg px-3 py-2 min-w-[200px] max-w-[280px] ${
          isExiting ? "animate-out fade-out" : "animate-in fade-in"
        } duration-200`}
        style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      >
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        <span className="flex-1 min-w-0 truncate text-[12px] font-medium text-foreground" title={title}>
          {title}
        </span>
        <button
          onClick={handleGoToNote}
          className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accent-foreground hover:opacity-90 transition-opacity"
        >
          <FileText className="h-3 w-3" />
          Go to note
        </button>
        <button
          onClick={handleStop}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
          title="End meeting"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
      </div>
    </div>
  );
}
