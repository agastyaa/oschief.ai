import { useRecording } from "@/contexts/RecordingContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Square, FileText, ArrowRight } from "lucide-react";
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
      className="fixed top-4 left-1/2 z-[9999]"
      style={{
        transform: visible
          ? "translateX(-50%) translateY(0)"
          : "translateX(-50%) translateY(-20px)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
      }}
    >
      <div
        className={`rounded-2xl border border-border/50 bg-card/95 shadow-[0_8px_40px_rgba(0,0,0,0.15),0_2px_12px_rgba(0,0,0,0.08)] ${
          isExiting ? "animate-out slide-out-to-top-2 fade-out" : "animate-in slide-in-from-top-4 fade-in"
        } duration-300`}
        style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", minWidth: 340, maxWidth: 420 }}
      >
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className="relative flex items-center justify-center h-10 w-10 rounded-xl bg-destructive/10 flex-shrink-0 mt-0.5">
            <span className="absolute h-2.5 w-2.5 rounded-full bg-red-500 animate-ping opacity-50" />
            <span className="relative h-2 w-2 rounded-full bg-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                Recording in progress
              </span>
            </div>
            <h4 className="text-[14px] font-semibold text-foreground leading-tight truncate">
              {title}
            </h4>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Live transcript is being captured
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 pb-3.5 pt-0.5">
          <button
            onClick={handleGoToNote}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <FileText className="h-3.5 w-3.5" />
            Go to note
            <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-50" />
          </button>
          <button
            onClick={handleStop}
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-[13px] font-medium text-destructive hover:bg-destructive/20 transition-all flex items-center gap-1.5"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            End meeting
          </button>
        </div>
      </div>
    </div>
  );
}
