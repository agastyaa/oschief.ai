import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getElectronAPI, isElectron } from "@/lib/electron-api";
import { useCalendar } from "@/contexts/CalendarContext";
import { X, Mic, Video, ArrowRight } from "lucide-react";

interface DetectionData {
  app: string;
  title?: string;
  startTime?: number;
  calendarEvent?: { id?: string; title: string; start?: number; end?: number; joinLink?: string } | null;
}

export function MeetingDetectionHandler() {
  const api = getElectronAPI();
  const navigate = useNavigate();
  const { events } = useCalendar();
  const [detection, setDetection] = useState<DetectionData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Forward calendar events to main process for correlation and "starting soon"
  useEffect(() => {
    if (!api) return;
    const mapped = events.map((e) => ({
      id: e.id,
      title: e.title || "Meeting",
      start: new Date(e.start).getTime(),
      end: new Date(e.end).getTime(),
      joinLink: e.joinLink,
    }));
    api.app.setCalendarEvents?.(mapped);
  }, [events, api]);

  // Listen for meeting detections — system notification only (main process shows native notification).
  // No in-app popup; user clicks the system notification to open app and start note (tray:start-recording).
  useEffect(() => {
    if (!api) return;

    const cleanupDetected = api.app.onMeetingDetected((_data: DetectionData) => {
      // No-op: system notification is shown by main process.
    });

    const cleanupEnded = api.app.onMeetingEnded(() => {
      dismissWithAnimation();
    });

    return () => {
      cleanupDetected();
      cleanupEnded();
    };
  }, [api]);

  // "Meeting starting soon" — open note for this event
  useEffect(() => {
    if (!api?.app?.onMeetingStartingSoon) return;
    const cleanup = api.app.onMeetingStartingSoon((data) => {
      navigate("/new-note", {
        state: {
          eventTitle: data.title ?? "Meeting",
          eventId: data.eventId,
          joinLink: data.joinLink,
        },
      });
    });
    return cleanup;
  }, [api, navigate]);

  // Tick elapsed time while notification is showing
  useEffect(() => {
    if (!detection || dismissed) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setElapsedSec((p) => p + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [detection, dismissed]);

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (elapsedSec >= 30 && detection && !dismissed) {
      dismissWithAnimation();
    }
  }, [elapsedSec]);

  const dismissWithAnimation = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setDetection(null);
      setDismissed(true);
      setIsExiting(false);
    }, 300);
  }, []);

  if (!isElectron || !detection || dismissed) return null;

  const meetingTitle =
    detection.calendarEvent?.title || detection.title || `${detection.app} Meeting`;

  const handleTakeNotes = () => {
    setDetection(null);
    navigate("/new-note", {
      state: {
        eventTitle: meetingTitle,
        eventId: detection.calendarEvent?.id,
        joinLink: detection.calendarEvent?.joinLink,
      },
    });
  };

  const handleDismiss = () => {
    dismissWithAnimation();
  };

  const appIcon = getAppIcon(detection.app);

  return (
    <div
      className={`fixed top-4 left-1/2 z-[9999] ${
        isExiting ? "animate-out slide-out-to-top-2 fade-out" : "animate-in slide-in-from-top-4 fade-in"
      } duration-300`}
      style={{ transform: "translateX(-50%)" }}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-[0_8px_40px_rgba(0,0,0,0.15),0_2px_12px_rgba(0,0,0,0.08)]"
        style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", minWidth: 340, maxWidth: 420 }}
      >
        {/* Progress bar that shrinks over 30s */}
        <div className="absolute top-0 left-0 h-[2px] bg-accent/60 transition-all ease-linear" style={{ width: `${Math.max(0, 100 - (elapsedSec / 30) * 100)}%`, transitionDuration: "1s" }} />

        <div className="flex items-start gap-3 px-4 py-3.5">
          {/* App icon */}
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-accent/10 flex-shrink-0 mt-0.5">
            {appIcon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-[11px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">
                Meeting detected
              </span>
            </div>
            <h4 className="text-[14px] font-semibold text-foreground leading-tight truncate">
              {meetingTitle}
            </h4>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {detection.app} · Ready to capture notes
            </p>
          </div>

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-4 pb-3.5 pt-0.5">
          <button
            onClick={handleTakeNotes}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Mic className="h-3.5 w-3.5" />
            Take notes
            <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-50" />
          </button>
          <button
            onClick={handleDismiss}
            className="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function getAppIcon(appName: string) {
  const lower = appName.toLowerCase();
  if (lower.includes("zoom"))
    return <Video className="h-5 w-5 text-blue-500" />;
  if (lower.includes("teams"))
    return (
      <span className="text-[18px] leading-none">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#6264A7">
          <path d="M20.625 7.5H18V5.25a.75.75 0 0 0-.75-.75H9.75a.75.75 0 0 0-.75.75v7.5a.75.75 0 0 0 .75.75h3v3.75A1.125 1.125 0 0 0 13.875 18.375h5.25A1.125 1.125 0 0 0 20.25 17.25v-1.5h.375A1.125 1.125 0 0 0 21.75 14.625V8.625A1.125 1.125 0 0 0 20.625 7.5zM16.5 3.75a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM20.25 4.5a1.125 1.125 0 1 1 0-2.25 1.125 1.125 0 0 1 0 2.25z" />
        </svg>
      </span>
    );
  if (lower.includes("meet") || lower.includes("google"))
    return (
      <span className="text-[18px] leading-none">
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path fill="#00832d" d="m14.5 8.5 3-3V12l-3-3.5z" />
          <path fill="#0066da" d="M5.5 5.5h7v6h-7z" />
          <path fill="#e94235" d="M5.5 12.5h7v6h-7z" />
          <path fill="#2684fc" d="m14.5 15.5 3 3V12l-3 3.5z" />
          <path fill="#00ac47" d="M17.5 5.5 14.5 8.5l3 3.5V5.5z" />
          <path fill="#ffba00" d="M17.5 18.5 14.5 15.5 17.5 12v6.5z" />
        </svg>
      </span>
    );
  return <Mic className="h-5 w-5 text-accent" />;
}
