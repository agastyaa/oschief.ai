import { useRecording } from "@/contexts/RecordingContext";
import { useNavigate, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function LiveMeetingIndicator() {
  const { activeSession, clearSession } = useRecording();
  const navigate = useNavigate();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tick elapsed time
  useEffect(() => {
    if (!activeSession?.isRecording) return;
    setElapsed(activeSession.elapsedSeconds);
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [activeSession?.isRecording, activeSession?.elapsedSeconds]);

  const scheduleCollapse = useCallback(() => {
    collapseTimer.current = setTimeout(() => setExpanded(false), 3000);
  }, []);

  const cancelCollapse = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }, []);

  // Hide on recording page or no session
  if (!activeSession || location.pathname === "/new-note") return null;

  return (
    <>
      {/* Pulse ring keyframes */}
      <style>{`
        @keyframes indicator-pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>

      <div
        className="fixed right-0 top-1/2 -translate-y-1/2 z-[9999] flex items-center"
        style={{
          transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)",
          transform: expanded
            ? "translateX(0) translateY(-50%)"
            : "translateX(50%) translateY(-50%)",
        }}
        onMouseEnter={() => {
          cancelCollapse();
          setExpanded(true);
        }}
        onMouseLeave={() => {
          scheduleCollapse();
        }}
      >
        {/* Expanded card */}
        <div
          className="flex items-center rounded-l-2xl overflow-hidden"
          style={{
            width: expanded ? 240 : 44,
            height: 44,
            background: "hsl(var(--foreground) / 0.93)",
            backdropFilter: "blur(12px)",
            transition: "width 0.35s cubic-bezier(0.4,0,0.2,1)",
            cursor: "pointer",
          }}
          onClick={() => navigate(`/new-note?session=${activeSession.noteId}`)}
        >
          {/* Favicon circle with pulse ring */}
          <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 44, height: 44 }}>
            {/* Pulse ring */}
            <span
              className="absolute inset-0 rounded-full border-2 border-accent"
              style={{
                animation: "indicator-pulse-ring 2s cubic-bezier(0,0,0.2,1) infinite",
              }}
            />
            <img
              src="/favicon.png"
              alt="Syag"
              className="w-7 h-7 rounded-full object-cover relative z-10"
            />
          </div>

          {/* Expanded content */}
          <div
            className="flex items-center gap-2 pr-2 overflow-hidden"
            style={{
              opacity: expanded ? 1 : 0,
              transition: "opacity 0.2s ease 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {/* Red dot */}
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />
            <div className="flex flex-col min-w-0 leading-tight">
              <span className="text-xs font-medium text-background truncate max-w-[120px]">
                {activeSession.title || "Untitled"}
              </span>
              <span className="text-[10px] text-background/60 font-mono">
                {formatTime(elapsed)}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearSession();
              }}
              className="ml-auto rounded-full p-1 text-background/50 hover:text-background transition-colors flex-shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
