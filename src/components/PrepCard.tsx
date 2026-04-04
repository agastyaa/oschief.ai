import { useState } from "react";
import { Clock, Users, ChevronRight, Calendar, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

function format12(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

interface CalendarEvent {
  id?: string;
  title: string;
  startTime: string;
  endTime?: string;
  attendees?: string[];
}

interface PrepCardProps {
  event: CalendarEvent | null;
  lastMeetingNotes?: { title: string; keyPoints: string[] } | null;
  openCommitments?: { text: string; assigneeName?: string }[];
  onStartNote?: (event: CalendarEvent) => void;
  onConnectCalendar?: () => void;
}

/**
 * Format prep brief as clean markdown for clipboard sharing.
 * This is the "ninja demo" — when pasted into Slack/email,
 * recipients see structured meeting context and ask "what tool made this?"
 */
function formatPrepBriefAsText(
  event: CalendarEvent,
  lastMeetingNotes?: { title: string; keyPoints: string[] } | null,
  openCommitments?: { text: string; assigneeName?: string }[]
): string {
  const lines: string[] = []
  lines.push(`# Meeting: ${event.title}`)
  try {
    const start = new Date(event.startTime)
    lines.push(`**When:** ${start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} at ${format12(start)}`)
  } catch { /* skip */ }
  if (event.attendees && event.attendees.length > 0) {
    lines.push(`**With:** ${event.attendees.join(', ')}`)
  }
  lines.push('')
  if (openCommitments && openCommitments.length > 0) {
    lines.push('## Open items')
    for (const c of openCommitments) {
      lines.push(`- ${c.assigneeName ? `${c.assigneeName}: ` : ''}${c.text}`)
    }
    lines.push('')
  }
  if (lastMeetingNotes) {
    lines.push('## Last time')
    for (const point of lastMeetingNotes.keyPoints) {
      lines.push(`- ${point}`)
    }
    lines.push('')
  }
  lines.push('---')
  lines.push('Prepared by OSChief')
  return lines.join('\n')
}

export function PrepCard({ event, lastMeetingNotes, openCommitments, onStartNote, onConnectCalendar }: PrepCardProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (!event) {
    return (
      <div className="rounded-[10px] border border-dashed border-border/60 bg-card/50 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <p className="text-[13px]">No upcoming meetings today. <span className="text-primary cursor-pointer hover:underline" onClick={() => onConnectCalendar ? onConnectCalendar() : navigate('/calendar')}>Connect calendar</span></p>
        </div>
      </div>
    );
  }

  const { timeStr, isHappening } = (() => {
    try {
      const start = new Date(event.startTime);
      const end = event.endTime ? new Date(event.endTime) : null;
      const now = new Date();
      const diffMin = Math.round((start.getTime() - now.getTime()) / 60000);
      if (diffMin < 0 && end && now < end) return { timeStr: `Started ${format12(start)}`, isHappening: true };
      if (diffMin < 0) return { timeStr: "Ended", isHappening: false };
      if (diffMin === 0) return { timeStr: "Starting now", isHappening: true };
      if (diffMin < 60) return { timeStr: `in ${diffMin} min`, isHappening: false };
      const hours = Math.floor(diffMin / 60);
      if (hours >= 24) {
        const days = Math.floor(hours / 24);
        return { timeStr: days === 1 ? "Tomorrow" : `in ${days} days`, isHappening: false };
      }
      return { timeStr: `in ${hours}h ${diffMin % 60}m`, isHappening: false };
    } catch { return { timeStr: "", isHappening: false }; }
  })();

  return (
    <div
      className="rounded-[10px] border border-border bg-card p-4 cursor-pointer card-lift"
      style={{ boxShadow: "var(--card-shadow)", borderLeftWidth: '3px', borderLeftColor: 'hsl(var(--primary))' }}
      onClick={() => onStartNote?.(event)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded", isHappening ? "text-amber-700 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/20" : "text-primary bg-primary/10")}>
              {isHappening ? "HAPPENING NOW" : "NEXT UP"}
            </span>
            {timeStr && <span className="text-[12px] text-muted-foreground">{timeStr}</span>}
          </div>
          <h3 className="text-[15px] font-semibold text-foreground truncate">{event.title}</h3>
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1 text-[12px] text-muted-foreground">
              <Users className="h-3 w-3" />
              <span className="truncate">{event.attendees.slice(0, 3).join(", ")}{event.attendees.length > 3 ? ` +${event.attendees.length - 3}` : ""}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              const text = formatPrepBriefAsText(event, lastMeetingNotes, openCommitments)
              navigator.clipboard.writeText(text).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }).catch(() => {})
            }}
            className="p-1 rounded hover:bg-secondary/60 transition-colors"
            title="Copy prep brief to clipboard"
            aria-label="Copy prep brief to clipboard"
          >
            {copied
              ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {(lastMeetingNotes || (openCommitments && openCommitments.length > 0)) && (
        <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
          {lastMeetingNotes && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Last discussed</p>
              {lastMeetingNotes.keyPoints.slice(0, 2).map((point, i) => (
                <p key={i} className="text-[12px] text-foreground/80 leading-relaxed">- {point}</p>
              ))}
            </div>
          )}
          {openCommitments && openCommitments.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Open commitments</p>
              {openCommitments.slice(0, 2).map((c, i) => (
                <p key={i} className="text-[12px] text-foreground/80 leading-relaxed">
                  {c.assigneeName ? `${c.assigneeName}: ` : ""}{c.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
