import { useState } from "react";
import { Mic, MicOff, Clock, FileText, Settings, LogOut, Circle, Moon, Sun } from "lucide-react";
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
  const [isDark, setIsDark] = useState(false);
  const [meeting] = useState<MeetingStatus>({
    active: true,
    title: "Weekly Standup",
    duration: "12:34",
    platform: "Zoom",
  });

  return (
    <div
      className={cn(
        "w-72 rounded-xl border shadow-2xl overflow-hidden font-body transition-colors",
        isDark
          ? "bg-[hsl(20,10%,10%)] border-[hsl(20,8%,17%)] text-[hsl(30,15%,90%)]"
          : "bg-card border-border text-foreground"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center gap-2.5 px-4 py-3 border-b",
        isDark ? "border-[hsl(20,8%,17%)]" : "border-border"
      )}>
        <img src="/favicon.png" alt="Syag" className="h-5 w-5 rounded" />
        <span className="font-display text-sm">Syag</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setIsDark(!isDark)}
            className={cn(
              "rounded-md p-1 transition-colors",
              isDark
                ? "text-[hsl(30,8%,55%)] hover:text-[hsl(30,15%,90%)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <span className={cn(
            "text-[10px]",
            isDark ? "text-[hsl(30,8%,55%)]" : "text-muted-foreground"
          )}>v1.0.0</span>
        </div>
      </div>

      {/* Active meeting */}
      {meeting.active && (
        <div className={cn(
          "px-4 py-3 border-b",
          isDark
            ? "border-[hsl(20,8%,17%)] bg-[hsl(20,8%,13%)]"
            : "border-border bg-secondary/40"
        )}>
          <div className="flex items-center gap-2 mb-1.5">
            <Circle className="h-2 w-2 fill-primary text-primary animate-pulse" />
            <span className={cn(
              "text-[11px] font-medium uppercase tracking-wider",
              isDark ? "text-[hsl(30,8%,55%)]" : "text-muted-foreground"
            )}>
              Live Meeting
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{meeting.title}</p>
              <p className={cn(
                "text-[11px]",
                isDark ? "text-[hsl(30,8%,55%)]" : "text-muted-foreground"
              )}>{meeting.platform}</p>
            </div>
            <div className={cn(
              "flex items-center gap-1.5",
              isDark ? "text-[hsl(30,8%,55%)]" : "text-muted-foreground"
            )}>
              <Clock className="h-3 w-3" />
              <span className="text-xs font-mono">{meeting.duration}</span>
            </div>
          </div>
        </div>
      )}

      {/* Recording toggle */}
      <div className={cn(
        "px-2 py-1.5 border-b",
        isDark ? "border-[hsl(20,8%,17%)]" : "border-border"
      )}>
        <button
          onClick={() => setIsRecording(!isRecording)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
            isRecording
              ? "bg-destructive/10 text-destructive"
              : isDark
                ? "hover:bg-[hsl(20,8%,15%)]"
                : "hover:bg-secondary"
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
      <div className={cn(
        "px-2 py-1.5 border-b",
        isDark ? "border-[hsl(20,8%,17%)]" : "border-border"
      )}>
        <TrayMenuItem icon={FileText} label="Recent Notes" shortcut="⌘N" isDark={isDark} />
      </div>

      {/* Footer */}
      <div className="px-2 py-1.5">
        <TrayMenuItem icon={LogOut} label="Quit Syag" shortcut="⌘Q" variant="destructive" isDark={isDark} />
      </div>
    </div>
  );
}

function TrayMenuItem({
  icon: Icon,
  label,
  shortcut,
  variant,
  isDark,
}: {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  variant?: "destructive";
  isDark?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
        variant === "destructive"
          ? "text-destructive hover:bg-destructive/10"
          : isDark
            ? "hover:bg-[hsl(20,8%,15%)]"
            : "hover:bg-secondary"
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {shortcut && (
        <kbd className={cn(
          "ml-auto text-[11px] font-mono",
          isDark ? "text-[hsl(30,8%,55%)]" : "text-muted-foreground"
        )}>{shortcut}</kbd>
      )}
    </button>
  );
}
