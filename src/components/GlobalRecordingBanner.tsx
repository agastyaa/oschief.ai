import { useRecording } from "@/contexts/RecordingContext";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";

export function GlobalRecordingBanner() {
  const { activeSession, clearSession } = useRecording();
  const navigate = useNavigate();

  if (!activeSession) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-full bg-foreground/90 pl-4 pr-2 py-2 shadow-lg backdrop-blur-sm">
      <button
        onClick={() => navigate("/new-note")}
        className="flex items-center gap-2.5"
      >
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse [animation-delay:300ms]" />
        </span>
        <span className="text-sm font-medium text-background">
          {activeSession.title || "Untitled"}
        </span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          clearSession();
        }}
        className="rounded-full p-1 text-background/60 hover:text-background transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
