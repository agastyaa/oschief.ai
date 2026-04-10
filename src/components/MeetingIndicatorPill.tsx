import { X } from "lucide-react";
import type { CSSProperties } from "react";

/** Shared time format for the in-app meeting indicator pill. */
export function formatMeetingIndicatorTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const pillStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderRadius: 20,
  background: "hsl(var(--background) / 0.92)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  color: "hsl(var(--foreground))",
  cursor: "pointer",
  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 11,
  fontWeight: 500,
  userSelect: "none",
  overflow: "hidden",
  maxWidth: 240,
  boxShadow: "0 2px 16px rgba(0,0,0,0.2)",
};

export type MeetingIndicatorPillProps = {
  title: string;
  isRecording: boolean;
  elapsedSeconds: number;
  onPillClick: () => void;
  /** If set, shows a dismiss control. */
  onDismiss?: () => void;
};

/** Meeting status pill used by LiveMeetingIndicator. */
export function MeetingIndicatorPill({
  title,
  isRecording,
  elapsedSeconds,
  onPillClick,
  onDismiss,
}: MeetingIndicatorPillProps) {
  const elapsed = formatMeetingIndicatorTime(elapsedSeconds);
  const displayTitle = title || "Recording";

  return (
    <>
      <div onClick={onPillClick} style={pillStyle}>
        {isRecording ? (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "hsl(var(--recording))",
              flexShrink: 0,
              animation: "meeting-indicator-pulse 1.5s ease-in-out infinite",
            }}
          />
        ) : (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "hsl(var(--amber))",
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={displayTitle}
        >
          {displayTitle}
        </span>
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            opacity: 0.8,
            flexShrink: 0,
          }}
        >
          {elapsed}
        </span>
        {onDismiss ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: "50%",
              cursor: "pointer",
              flexShrink: 0,
              opacity: 0.5,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "0.5";
            }}
            title="Dismiss"
          >
            <X style={{ width: 12, height: 12 }} />
          </span>
        ) : null}
      </div>
      <style>{`
        @keyframes meeting-indicator-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
