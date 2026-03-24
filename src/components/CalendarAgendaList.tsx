import { forwardRef, useMemo } from "react";
import { format, isToday as isTodayFn, isTomorrow } from "date-fns";
import { Calendar, Clock, FileText, MapPin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/ics-parser";

export type CalendarAgendaListVariant = "full" | "compact";

function eventRowClass(evt: CalendarEvent, variant: CalendarAgendaListVariant) {
  if (variant === "compact") {
    // Granola-style: clean rows, no cards, no borders
    return "w-full text-left py-1.5 hover:bg-secondary/50 rounded-md transition-colors group px-1";
  }
  return cn(
    "w-full text-left rounded-lg border hover:border-accent/40 hover:shadow-sm transition-all group p-3",
    evt.source === "local" || evt.isAllDay
      ? "border-dashed bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,hsl(var(--border)/0.35)_6px,hsl(var(--border)/0.35)_7px)] bg-card"
      : "border-border bg-card"
  );
}

export interface CalendarAgendaListProps {
  /** Pre-filtered events; will be sorted by start time inside the component. */
  events: CalendarEvent[];
  onEventClick: (evt: CalendarEvent) => void;
  findNoteForEvent: (evt: CalendarEvent) => { id: string } | null | undefined;
  /** When `"all"`, show calendar name chip on synced events. */
  calendarViewId?: string | null;
  variant?: CalendarAgendaListVariant;
  /** Show trash on local rows (desktop only; parent passes isElectron && handler). */
  showLocalDelete?: boolean;
  onDeleteLocal?: (e: React.MouseEvent, evt: CalendarEvent) => void;
  /** Rendered when there are no events after grouping. */
  emptyState?: React.ReactNode;
  /** Omit "N events" in the day header (e.g. compact homepage widget). */
  hideDayEventCount?: boolean;
}

export const CalendarAgendaList = forwardRef<HTMLDivElement, CalendarAgendaListProps>(
  function CalendarAgendaList(
    {
      events,
      onEventClick,
      findNoteForEvent,
      calendarViewId = "",
      variant = "full",
      showLocalDelete = false,
      onDeleteLocal,
      emptyState = null,
      hideDayEventCount = false,
    },
    ref
  ) {
    const sorted = useMemo(
      () => [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
      [events]
    );

    const grouped = useMemo(() => {
      const acc: Record<string, CalendarEvent[]> = {};
      for (const evt of sorted) {
        const key = format(new Date(evt.start), "yyyy-MM-dd");
        (acc[key] = acc[key] || []).push(evt);
      }
      return acc;
    }, [sorted]);

    const dateKeys = Object.keys(grouped).sort();

    if (dateKeys.length === 0) {
      return <div ref={ref}>{emptyState}</div>;
    }

    const isCompact = variant === "compact";

    return (
      <div ref={ref} className="space-y-1">
        {dateKeys.map((dateKey) => {
          const dayEvents = grouped[dateKey];
          const dateObj = new Date(dateKey + "T12:00:00");
          const dayIsToday = isTodayFn(dateObj);
          const dayIsTomorrow = isTomorrow(dateObj);
          return (
            <div key={dateKey} className="mb-2">
              {isCompact ? (
                /* Compact: single-line day label */
                <div className="flex items-center gap-2 px-1 py-1 mb-1">
                  <span className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider",
                    dayIsToday ? "text-primary" : "text-muted-foreground"
                  )}>
                    {dayIsToday ? "Today" : dayIsTomorrow ? "Tomorrow" : format(dateObj, "EEE, MMM d")}
                  </span>
                </div>
              ) : (
                /* Full: date box + label */
                <div
                  className="sticky top-0 z-10 flex items-center gap-3 rounded-lg mb-1 px-3 py-2 bg-background border-b border-border/50"
                >
                  <div
                    className={cn(
                      "flex flex-shrink-0 flex-col items-center justify-center rounded-lg text-center h-10 w-10",
                      dayIsToday ? "bg-accent text-accent-foreground" : "bg-card border border-border"
                    )}
                  >
                    <span className="text-[10px] font-medium leading-none">{format(dateObj, "EEE")}</span>
                    <span className="text-lg font-semibold leading-none mt-0.5">{format(dateObj, "d")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium truncate", dayIsToday ? "text-accent" : "text-foreground")}>
                      {dayIsToday ? "Today" : dayIsTomorrow ? "Tomorrow" : format(dateObj, "EEEE")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{format(dateObj, "MMMM d, yyyy")}</p>
                  </div>
                  {!hideDayEventCount && (
                    <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                      {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}

              <div
                className={cn(
                  "space-y-0.5 mt-1 mb-3",
                  isCompact ? "ml-0" : "border-l-2 border-border ml-5 pl-5"
                )}
              >
                {dayEvents.map((evt) => {
                  const linked = findNoteForEvent(evt);
                  // Monochrome accent bar — subtle, not distracting
                  const accentColor = isCompact
                    ? "hsl(var(--muted-foreground) / 0.25)"
                    : evt.source === "local"
                      ? "hsl(var(--muted-foreground) / 0.5)"
                      : `hsl(${(evt.id.charCodeAt(0) * 37) % 360} 40% 45%)`;

                  if (isCompact) {
                    // Granola-style: clean row — colored bar + title + time, no cards
                    return (
                      <button
                        key={evt.id}
                        type="button"
                        onClick={() => onEventClick(evt)}
                        className={eventRowClass(evt, variant)}
                      >
                        <div
                          className="border-l-[3px] pl-2.5"
                          style={{ borderColor: accentColor }}
                        >
                          <h4 className="text-[13px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
                            {evt.title}
                          </h4>
                          <span className="text-[11px] text-muted-foreground">
                            {evt.isAllDay ? "All day" : `${format(new Date(evt.start), "h:mm")} – ${format(new Date(evt.end), "h:mm a")}`}
                          </span>
                        </div>
                      </button>
                    );
                  }

                  // Full variant: cards with details
                  return (
                    <div key={evt.id} className="relative group/row">
                      <button
                        type="button"
                        onClick={() => onEventClick(evt)}
                        className={eventRowClass(evt, variant)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 border-l-[3px] pl-2 -ml-0.5" style={{ borderColor: accentColor }}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-medium text-foreground truncate group-hover:text-accent transition-colors">
                                {evt.title}
                              </h4>
                              {evt.source === "local" && (
                                <span className="text-[9px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1">OSChief</span>
                              )}
                              {calendarViewId === "all" && evt.source === "synced" && evt.calendarName && (
                                <span className="text-[9px] text-muted-foreground border border-border/60 rounded px-1 max-w-[7rem] truncate">{evt.calendarName}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-wrap mt-1">
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock className="h-3 w-3 flex-shrink-0" />
                                {evt.isAllDay ? "All day" : `${format(new Date(evt.start), "h:mm a")} — ${format(new Date(evt.end), "h:mm a")}`}
                              </span>
                              {evt.location && (
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate min-w-0">
                                  <MapPin className="h-3 w-3 flex-shrink-0" />
                                  {evt.location}
                                </span>
                              )}
                            </div>
                            {evt.description && (
                              <p className="text-[11px] text-muted-foreground/70 mt-1.5 line-clamp-2">{evt.description}</p>
                            )}
                            {evt.source === "local" && (
                              <p className="text-[10px] text-muted-foreground mt-1.5">Only in OSChief — won&apos;t appear in Google Calendar or Outlook.</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <div className={cn("flex items-center justify-center rounded-md bg-accent/10 text-accent h-8 w-8")} title={linked ? "Has note" : "Start note"}>
                              {linked || evt.noteId ? <FileText className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
                            </div>
                          </div>
                        </div>
                      </button>
                      {showLocalDelete && evt.source === "local" && onDeleteLocal && (
                        <button
                          type="button"
                          aria-label="Delete block"
                          onClick={(e) => void onDeleteLocal(e, evt)}
                          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);
