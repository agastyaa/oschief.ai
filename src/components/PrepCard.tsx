import { Clock, Users, ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

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

export function PrepCard({ event, lastMeetingNotes, openCommitments, onStartNote, onConnectCalendar }: PrepCardProps) {
  const navigate = useNavigate();

  if (!event) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-card/50 p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <p className="text-[13px]">No upcoming meetings today. <span className="text-primary cursor-pointer hover:underline" onClick={() => onConnectCalendar ? onConnectCalendar() : navigate('/calendar')}>Connect calendar</span></p>
        </div>
      </div>
    );
  }

  const timeStr = (() => {
    try {
      const start = new Date(event.startTime);
      const now = new Date();
      const diffMin = Math.round((start.getTime() - now.getTime()) / 60000);
      if (diffMin < 0) return "Now";
      if (diffMin < 60) return `in ${diffMin} min`;
      const hours = Math.floor(diffMin / 60);
      return `in ${hours}h ${diffMin % 60}m`;
    } catch { return ""; }
  })();

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 cursor-pointer transition-shadow hover:shadow-[var(--card-shadow-hover)]"
      style={{ boxShadow: "var(--card-shadow)" }}
      onClick={() => onStartNote?.(event)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">NEXT UP</span>
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
        <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
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
