import { Plus, Calendar, Link2, Clock, MapPin, FileText, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, isToday as isTodayFn, isTomorrow, isAfter } from "date-fns";
import type { CalendarEvent } from "@/lib/ics-parser";

const SHELF_STORAGE_KEY = "syag-home-shelf-open";

export function getShelfOpenDefault(): boolean {
  try {
    const v = localStorage.getItem(SHELF_STORAGE_KEY);
    return v !== "false";
  } catch {
    return true;
  }
}

export function setShelfOpenPersist(open: boolean): void {
  try {
    localStorage.setItem(SHELF_STORAGE_KEY, String(open));
  } catch {}
}

interface HomeShelfProps {
  upcomingEvents: CalendarEvent[];
  icsSource: string | null;
  selectedEvent: CalendarEvent | null;
  onSelectEvent: (evt: CalendarEvent | null) => void;
  onQuickNote: () => void;
  onStartNotesForEvent: (evt: CalendarEvent) => void;
  onOpenCalendar: () => void;
  hasNotes: boolean;
}

export function HomeShelf({
  upcomingEvents,
  icsSource,
  selectedEvent,
  onSelectEvent,
  onQuickNote,
  onStartNotesForEvent,
  onOpenCalendar,
  hasNotes,
}: HomeShelfProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-border bg-card/30">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Coming up */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg text-foreground">Coming up</h2>
            {hasNotes && (
              <button
                onClick={onQuickNote}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Quick Note
              </button>
            )}
          </div>

          {icsSource && upcomingEvents.length > 0 ? (
            <div className="rounded-xl border border-border bg-card/50 divide-y divide-border">
              {upcomingEvents.map((evt) => {
                const dayLabel = isTodayFn(evt.start) ? "Today" : isTomorrow(evt.start) ? "Tomorrow" : format(evt.start, "EEE, MMM d");
                const isSelected = selectedEvent?.id === evt.id;
                return (
                  <button
                    key={evt.id}
                    onClick={() => onSelectEvent(isSelected ? null : evt)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${isSelected ? "bg-accent/10" : "hover:bg-secondary/50"}`}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent flex-shrink-0">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{evt.title}</p>
                      <p className="text-[11px] text-muted-foreground">{dayLabel} · {format(evt.start, "h:mm a")}</p>
                    </div>
                  </button>
                );
              })}
              <div className="px-4 py-2">
                <button onClick={onOpenCalendar} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  Re-sync calendar
                </button>
              </div>
            </div>
          ) : icsSource ? (
            <div className="w-full rounded-xl border border-border bg-card/50 px-4 py-5 text-center">
              <Calendar className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground mb-1">No upcoming events</p>
              <p className="text-xs text-muted-foreground">No future events in your calendar</p>
            </div>
          ) : (
            <div className="w-full rounded-xl border border-border bg-card/50 px-4 py-5 text-center">
              <Calendar className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground mb-1">Link your calendar</p>
              <p className="text-xs text-muted-foreground mb-3">Import an .ics feed to see upcoming meetings</p>
              <button onClick={onOpenCalendar} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors mx-auto">
                <Link2 className="h-3.5 w-3.5" />
                Import Calendar (.ics)
              </button>
            </div>
          )}
        </div>

        {/* Event detail inline */}
        {selectedEvent && (
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
            <h3 className="font-display text-sm font-medium text-foreground pr-2">{selectedEvent.title}</h3>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-foreground">{format(new Date(selectedEvent.start), "EEEE, MMM d")}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Clock className="h-3 w-3" />
                  {format(new Date(selectedEvent.start), "h:mm a")} — {format(new Date(selectedEvent.end), "h:mm a")}
                </p>
              </div>
            </div>
            {selectedEvent.location && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground">{selectedEvent.location}</p>
              </div>
            )}
            {selectedEvent.description && (
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                  {selectedEvent.description}
                </p>
              </div>
            )}
            <Button
              onClick={() => onStartNotesForEvent(selectedEvent)}
              className="w-full gap-2"
              size="sm"
            >
              <Mic className="h-4 w-4" />
              Start Notes for this Meeting
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
