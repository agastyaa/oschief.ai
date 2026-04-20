import { useRecordingSession } from "@/contexts/RecordingContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { loadPreferences } from "@/pages/SettingsPage";
import { SYAG_PREFS_UPDATED } from "@/lib/preferences-events";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { useSTTHealth } from "@/hooks/useSTTHealth";
import { MeetingIndicatorPill } from "@/components/MeetingIndicatorPill";

export function LiveMeetingIndicator() {
  const { activeSession } = useRecordingSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [manuallyHidden, setManuallyHidden] = useState(false);
  const [visible, setVisible] = useState(false);
  const [, prefsBump] = useState(0);

  useEffect(() => {
    const onPrefs = () => prefsBump((n) => n + 1);
    window.addEventListener(SYAG_PREFS_UPDATED, onPrefs);
    return () => window.removeEventListener(SYAG_PREFS_UPDATED, onPrefs);
  }, []);

  const elapsedSeconds = useElapsedTime(
    activeSession?.startTime ?? null,
    activeSession?.isRecording ?? false,
  );
  const sttHealth = useSTTHealth(activeSession?.isRecording ?? false);

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
    if (activeSession?.noteId) {
      navigate(`/new-note?session=${activeSession.noteId}`);
    } else {
      navigate('/new-note');
    }
  }, [activeSession?.noteId, navigate]);

  const prefs = loadPreferences();

  if (
    !activeSession ||
    !activeSession.isRecording ||
    location.pathname === "/new-note" ||
    !prefs.showRecordingIndicator ||
    manuallyHidden
  )
    return null;

  return (
    <div
      className="fixed top-3 right-4 z-[9999]"
      onClick={handleGoToNote}
      style={{
        cursor: "pointer",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-8px)",
        transition: "transform 0.25s ease, opacity 0.2s ease",
        ...({ WebkitAppRegion: "no-drag" } as React.CSSProperties),
      }}
    >
      <MeetingIndicatorPill
        title={activeSession.title || "Recording"}
        isRecording={activeSession.isRecording}
        elapsedSeconds={elapsedSeconds}
        onPillClick={handleGoToNote}
        onDismiss={() => setManuallyHidden(true)}
        sttHealth={sttHealth}
      />
    </div>
  );
}
