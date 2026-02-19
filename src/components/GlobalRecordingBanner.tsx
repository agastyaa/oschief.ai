import { useRecording } from "@/contexts/RecordingContext";
import { useNavigate } from "react-router-dom";
import { Mic } from "lucide-react";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function GlobalRecordingBanner() {
  const { activeSession } = useRecording();
  const navigate = useNavigate();

  if (!activeSession) return null;

  return (
    <button
      onClick={() => navigate("/new-note")}
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-destructive/90 px-4 py-1.5 text-destructive-foreground backdrop-blur-sm transition-all hover:bg-destructive"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive-foreground opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive-foreground" />
      </span>
      <Mic className="h-3 w-3" />
      <span className="text-xs font-medium">
        Recording in progress — {activeSession.title} · {formatTime(activeSession.elapsedSeconds)}
      </span>
    </button>
  );
}
