import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Calendar, Link2, LayoutGrid, List, MapPin, Clock } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/contexts/CalendarContext";
import { ICSDialog } from "@/components/ICSDialog";
import { CalendarEvent } from "@/lib/ics-parser";
import { format, isToday as isTodayFn, startOfDay } from "date-fns";
import { useNavigate } from "react-router-dom";

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getStartDayOffset(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [icsOpen, setIcsOpen] = useState(false);
  const navigate = useNavigate();
  const [view, setView] = useState<"grid" | "list">("grid");
  const listViewScrollRef = useRef<HTMLDivElement>(null);
  const { events, icsSource, clearCalendar } = useCalendar();

  const daysInMonth = getDaysInMonth(year, month);
  const startOffset = getStartDayOffset(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const getEventsForDay = (day: number) =>
    events.filter((e) => {
      const d = new Date(e.start);
      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });

  // Events for the current month (grid view), grouped by date
  const monthEvents = events
    .filter((e) => {
      const d = new Date(e.start);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const groupedByDate = monthEvents.reduce<Record<string, CalendarEvent[]>>((acc, evt) => {
    const key = format(new Date(evt.start), "yyyy-MM-dd");
    (acc[key] = acc[key] || []).push(evt);
    return acc;
  }, {});

  // List view: events from today onward, grouped by date (today first, scroll down for future)
  const todayStart = startOfDay(today).getTime();
  const upcomingEvents = events
    .filter((e) => new Date(e.start).getTime() >= todayStart)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const listViewGrouped = upcomingEvents.reduce<Record<string, CalendarEvent[]>>((acc, evt) => {
    const key = format(new Date(evt.start), "yyyy-MM-dd");
    (acc[key] = acc[key] || []).push(evt);
    return acc;
  }, {});
  const listViewDates = Object.keys(listViewGrouped).sort();

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const goToday = () => {
    if (view === "list") {
      listViewScrollRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setYear(today.getFullYear());
      setMonth(today.getMonth());
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 pt-4 pb-8">
          {/* Connect prompt */}
          {!icsSource ? (
            <div className="mb-6 rounded-xl border border-border bg-card p-6 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <h2 className="text-[15px] font-medium text-foreground mb-1">No calendar linked</h2>
              <p className="text-[13px] text-muted-foreground mb-4">Import an .ics file or paste a feed URL to see your events</p>
              <button onClick={() => setIcsOpen(true)} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors mx-auto">
                <Link2 className="h-3.5 w-3.5" />
                Import Calendar (.ics)
              </button>
            </div>
          ) : (
            <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-2.5">
              <span className="text-xs text-muted-foreground truncate">Synced: {icsSource}</span>
              <div className="flex gap-2">
                <button onClick={() => setIcsOpen(true)} className="text-xs text-accent hover:underline">Re-sync</button>
                <button onClick={clearCalendar} className="text-xs text-destructive hover:underline">Disconnect</button>
              </div>
            </div>
          )}

          {/* Calendar header */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="font-display text-2xl text-foreground">
              {view === "list" ? "From today" : `${monthNames[month]} ${year}`}
            </h1>
            <div className="flex items-center gap-3">
              {/* View toggle */}
              <div className="flex rounded-lg border border-border p-0.5">
                <button
                  onClick={() => setView("grid")}
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button onClick={prevMonth} className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button onClick={goToday} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground">
                  Today
                </button>
                <button onClick={nextMonth} className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {view === "grid" ? (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-border">
                {daysOfWeek.map((d) => (
                  <div key={d} className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border p-1.5" />
                ))}
                {days.map((day) => {
                  const dayEvents = getEventsForDay(day);
                  return (
                    <div key={day} className="min-h-[100px] border-b border-r border-border p-1.5 transition-colors hover:bg-card/60">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        isToday(day) ? "bg-accent text-accent-foreground font-semibold" : "text-foreground"
                      }`}>
                        {day}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {dayEvents.slice(0, 3).map((evt) => (
                          <button
                            key={evt.id}
                            onClick={() => navigate("/new-note", { state: { eventTitle: evt.title, eventId: evt.id } })}
                            className="w-full text-left truncate rounded px-1 py-0.5 text-[10px] bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-colors cursor-pointer"
                          >
                            {format(new Date(evt.start), "h:mm")} {evt.title}
                          </button>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* List view: from today onward, scroll down for future days */
            <div ref={listViewScrollRef}>
              {listViewDates.length === 0 ? (
                <div className="text-center py-16">
                  <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No events from today onward</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {listViewDates.map((dateKey) => {
                    const dayEvents = listViewGrouped[dateKey];
                    const dateObj = new Date(dateKey + "T00:00:00");
                    const dayIsToday = isTodayFn(dateObj);
                    return (
                      <div key={dateKey}>
                        {/* Date header */}
                        <div className={cn(
                          "sticky top-0 z-10 flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5",
                          dayIsToday ? "bg-accent/10" : "bg-secondary/50"
                        )}>
                          <div className={cn(
                            "flex h-10 w-10 flex-col items-center justify-center rounded-lg text-center",
                            dayIsToday ? "bg-accent text-accent-foreground" : "bg-card border border-border"
                          )}>
                            <span className="text-[10px] font-medium leading-none">{format(dateObj, "EEE")}</span>
                            <span className="text-lg font-semibold leading-none mt-0.5">{format(dateObj, "d")}</span>
                          </div>
                          <div>
                            <p className={cn("text-sm font-medium", dayIsToday ? "text-accent" : "text-foreground")}>
                              {dayIsToday ? "Today" : format(dateObj, "EEEE")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{format(dateObj, "MMMM d, yyyy")}</p>
                          </div>
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* Events for this day */}
                        <div className="ml-5 border-l-2 border-border pl-5 space-y-1 mb-4">
                          {dayEvents.map((evt) => (
                            <button
                              key={evt.id}
                              onClick={() => navigate("/new-note", { state: { eventTitle: evt.title, eventId: evt.id } })}
                              className="w-full text-left rounded-lg border border-border bg-card p-3 hover:border-accent/40 hover:shadow-sm transition-all group"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-sm font-medium text-foreground truncate group-hover:text-accent transition-colors">
                                    {evt.title}
                                  </h4>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      {format(new Date(evt.start), "h:mm a")} — {format(new Date(evt.end), "h:mm a")}
                                    </span>
                                    {evt.location && (
                                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                                        <MapPin className="h-3 w-3 flex-shrink-0" />
                                        {evt.location}
                                      </span>
                                    )}
                                  </div>
                                  {evt.description && (
                                    <p className="text-[11px] text-muted-foreground/70 mt-1.5 line-clamp-2">
                                      {evt.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent flex-shrink-0">
                                  <Calendar className="h-3.5 w-3.5" />
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <ICSDialog open={icsOpen} onOpenChange={setIcsOpen} />
      
    </div>
  );
}
