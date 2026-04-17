import { Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRecording } from "@/contexts/RecordingContext";
import { useElapsedTime } from "@/hooks/useElapsedTime";

/**
 * Compact recording status strip rendered in AppShell's top area on the
 * recording page. Fills the previously-empty ContentHeader spacer with
 * useful context: meeting title, live elapsed timer, REC/Paused badge,
 * and pause/resume + stop controls. Self-contained — pulls state and
 * handlers from the Recording context directly so callers don't need
 * to thread props through.
 */
export function RecordingStatusStrip() {
  const { activeSession, pauseAudioCapture, resumeAudioCapture, stopAudioCapture } = useRecording();
  const isRecording = !!activeSession?.isRecording;
  const elapsed = useElapsedTime(activeSession?.startTime ?? null, isRecording);

  if (!activeSession) return null;

  const handlePause = () => {
    pauseAudioCapture().catch((err) => {
      console.error("Pause failed:", err);
      toast.error("Pause failed");
    });
  };

  const handleResume = () => {
    resumeAudioCapture().catch((err) => {
      console.error("Resume failed:", err);
      toast.error("Resume failed");
    });
  };

  const handleStop = () => {
    if (!confirm("Stop recording? This will end the meeting capture.")) return;
    stopAudioCapture().catch((err) => {
      console.error("Stop failed:", err);
      toast.error("Stop failed");
    });
  };

  const mm = Math.floor(elapsed / 60);
  const ss = elapsed % 60;
  const timeStr = `${mm}:${String(ss).padStart(2, "0")}`;
  const title = activeSession.title || "New note";

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-card/80 backdrop-blur pl-2 pr-1 py-1 shadow-sm">
      {/* REC / Paused indicator */}
      <span
        className={cn(
          "flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider shrink-0",
          isRecording ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isRecording ? "bg-destructive animate-pulse" : "bg-muted-foreground",
          )}
        />
        {isRecording ? "REC" : "Paused"}
      </span>

      {/* Title */}
      <span className="text-xs font-medium text-foreground truncate max-w-[200px]" title={title}>
        {title}
      </span>

      {/* Elapsed */}
      <span className="text-xs tabular-nums text-muted-foreground shrink-0">{timeStr}</span>

      {/* Controls */}
      <div className="flex items-center gap-0.5 shrink-0 ml-1">
        {isRecording ? (
          <button
            onClick={handlePause}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Pause"
            aria-label="Pause recording"
          >
            <Pause className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={handleResume}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Resume"
            aria-label="Resume recording"
          >
            <Play className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={handleStop}
          className="flex h-6 w-6 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 transition-colors"
          title="Stop & save"
          aria-label="Stop recording"
        >
          <Square className="h-3 w-3 fill-current" />
        </button>
      </div>
    </div>
  );
}
