import { useState } from "react";
import { Mic, MicOff, Clock, FileText, Settings, LogOut, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MeetingStatus {
  active: boolean;
  title: string;
  duration: string;
  platform: string;
}

/**
 * TrayMenu — macOS-style system tray popover UI.
 * Stored as a React component for future Electron integration.
 * Will be rendered inside Electron's BrowserWindow attached to the tray icon.
 */
export function TrayMenu() {
  const [isRecording, setIsRecording] = useState(false);
  const [meeting] = useState<MeetingStatus>({
    active: true,
    title: "Weekly Standup",
    duration: "12:34",
    platform: "Zoom",
  });

  return (
    <div className="w-72 rounded-xl border border-border bg-card shadow-2xl overflow-hidden font-body">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <img src="/favicon.png" alt="Syag" className="h-5 w-5 rounded" />
        <span className="font-display text-sm text-foreground">Syag</span>
        <span className="ml-auto text-[10px] text-muted-foreground">v1.0.0</span>
      </div>

      {/* Active meeting */}
      {meeting.active && (
        <div className="px-4 py-3 border-b border-border bg-secondary/40">
          <div className="flex items-center gap-2 mb-1.5">
            <Circle className="h-2 w-2 fill-primary text-primary animate-pulse" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Live Meeting
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
              <p className="text-[11px] text-muted-foreground">{meeting.platform}</p>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="text-xs font-mono">{meeting.duration}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recording toggle */}
      <div className="px-2 py-1.5 border-b border-border">
        <button
          onClick={() => setIsRecording(!isRecording)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
            isRecording
              ? "bg-destructive/10 text-destructive"
              : "text-foreground hover:bg-secondary"
          )}
        >
          {isRecording ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          <span>{isRecording ? "Stop Recording" : "Start Recording"}</span>
          {isRecording && (
            <span className="ml-auto flex items-center gap-1">
              <Circle className="h-1.5 w-1.5 fill-destructive text-destructive animate-pulse" />
              <span className="text-[11px] font-mono">REC</span>
            </span>
          )}
        </button>
      </div>

      {/* Quick actions */}
      <div className="px-2 py-1.5 border-b border-border">
        <TrayMenuItem icon={FileText} label="Recent Notes" shortcut="⌘N" />
        <TrayMenuItem icon={Settings} label="Preferences…" shortcut="⌘," />
      </div>

      {/* Footer */}
      <div className="px-2 py-1.5">
        <TrayMenuItem icon={LogOut} label="Quit Syag" shortcut="⌘Q" variant="destructive" />
      </div>
    </div>
  );
}

function TrayMenuItem({
  icon: Icon,
  label,
  shortcut,
  variant,
}: {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  variant?: "destructive";
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
        variant === "destructive"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-secondary"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {shortcut && (
        <kbd className="ml-auto text-[11px] font-mono text-muted-foreground">{shortcut}</kbd>
      )}
    </button>
  );
}
