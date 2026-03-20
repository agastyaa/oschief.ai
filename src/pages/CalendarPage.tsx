import { useState, useRef, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Link2,
  LayoutGrid,
  List,
  MapPin,
  Clock,
  Plus,
  FileText,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/contexts/CalendarContext";
import { useNotes } from "@/contexts/NotesContext";
import { useRecording } from "@/contexts/RecordingContext";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { ICSDialog } from "@/components/ICSDialog";
import { CalendarEvent } from "@/lib/ics-parser";
import { addDays, format, isToday as isTodayFn, isTomorrow, startOfDay } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LIST_WINDOW_DAYS = 21;
const LIST_CHEVRON_DAYS = 7;

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getStartDayOffset(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Derive a short label from calendar URL for display (e.g. "Outlook - work.example.com"). */
function getSyncLabel(urlOrSource: string): string {
  if (!urlOrSource) return "Calendar";
  try {
    const url = urlOrSource.startsWith("http") ? urlOrSource : `https://${urlOrSource}`;
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathAndHash = u.pathname + u.search;
    if (host.includes("outlook.office365.com") || host.includes("outlook.office.com")) {
      const emailMatch = pathAndHash.match(/@([a-zA-Z0-9.-]+)/);
      const domain = emailMatch ? emailMatch[1] : "";
      return domain ? `Outlook - ${domain}` : "Outlook";
    }
    if (host.includes("google") || host.includes("gmail")) return "Google Calendar";
    if (host.includes("icloud")) return "iCloud";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return urlOrSource.length > 40 ? urlOrSource.slice(0, 37) + "…" : urlOrSource;
  }
}

export default function CalendarPage() {
  const today = new Date();
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get("view") === "list" ? "list" : "grid";
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [icsOpen, setIcsOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockTitle, setBlockTitle] = useState("");
  const [blockDate, setBlockDate] = useState(format(today, "yyyy-MM-dd"));
  const [blockStart, setBlockStart] = useState("09:00");
  const [blockEnd, setBlockEnd] = useState("10:00");
  const [blockOpenNote, setBlockOpenNote] = useState(false);
  const navigate = useNavigate();
  const [view, setView] = useState<"grid" | "list">(initialView);
  const [listAnchorDate, setListAnchorDate] = useState(() => startOfDay(today));
  const listViewScrollRef = useRef<HTMLDivElement>(null);
  const { sidebarOpen } = useSidebarVisibility();
  const {
    events,
    displayEvents,
    icsSource,
    connectedCalendarSummary,
    calendarSources,
    calendarViewId,
    setCalendarViewId,
    clearCalendar,
    addLocalBlock,
    deleteLocalBlock,
  } = useCalendar();
  const { notes } = useNotes();
  const { activeSession } = useRecording();

  const hasSyncedSource = calendarSources.length > 0;
  const showMainCalendar = hasSyncedSource || events.length > 0;

  const findNoteForEvent = (evt: CalendarEvent) => {
    if (evt.noteId) return notes.find((n) => n.id === evt.noteId) ?? null;
    const eventDate = format(new Date(evt.start), "MMM d, yyyy");
    return (
      notes.find(
        (n) => n.calendarEventId === evt.id || (n.title === evt.title && n.date === eventDate)
      ) ?? null
    );
  };

  const handleEventClick = (evt: CalendarEvent) => {
    if (evt.source === "local" && evt.noteId) {
      const note = notes.find((n) => n.id === evt.noteId);
      if (note) {
        if (activeSession?.noteId === note.id) {
          navigate(`/new-note?session=${note.id}`);
        } else {
          navigate(`/note/${note.id}`);
        }
        return;
      }
    }
    const note = findNoteForEvent(evt);
    if (note) {
      if (activeSession?.noteId === note.id) {
        navigate(`/new-note?session=${note.id}`);
      } else {
        navigate(`/note/${note.id}`);
      }
      return;
    }
    navigate("/new-note", { state: { eventTitle: evt.title, eventId: evt.id } });
  };

  useEffect(() => {
    const urlView = searchParams.get("view") === "list" ? "list" : "grid";
    setView(urlView);
  }, [searchParams]);

  const daysInMonth = getDaysInMonth(year, month);
  const startOffset = getStartDayOffset(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const getEventsForDay = (day: number) =>
    displayEvents.filter((e) => {
      const d = new Date(e.start);
      return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
    });

  const monthEvents = displayEvents
    .filter((e) => {
      const d = new Date(e.start);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const listWindowEnd = useMemo(() => addDays(listAnchorDate, LIST_WINDOW_DAYS), [listAnchorDate]);
  const listRangeEvents = useMemo(() => {
    const startMs = listAnchorDate.getTime();
    const endMs = listWindowEnd.getTime();
    return displayEvents
      .filter((e) => {
        const t = new Date(e.start).getTime();
        return t >= startMs && t < endMs;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [displayEvents, listAnchorDate, listWindowEnd]);

  const listViewGrouped = listRangeEvents.reduce<Record<string, CalendarEvent[]>>((acc, evt) => {
    const key = format(new Date(evt.start), "yyyy-MM-dd");
    (acc[key] = acc[key] || []).push(evt);
    return acc;
  }, {});
  const listViewDates = Object.keys(listViewGrouped).sort();

  const listHeaderLabel = useMemo(() => {
    const endShow = addDays(listAnchorDate, LIST_WINDOW_DAYS - 1);
    return `${format(listAnchorDate, "MMM d")} – ${format(endShow, "MMM d, yyyy")}`;
  }, [listAnchorDate]);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const prevList = () => setListAnchorDate((d) => addDays(d, -LIST_CHEVRON_DAYS));
  const nextList = () => setListAnchorDate((d) => addDays(d, LIST_CHEVRON_DAYS));

  const goToday = () => {
    if (view === "list") {
      setListAnchorDate(startOfDay(new Date()));
      listViewScrollRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setYear(today.getFullYear());
      setMonth(today.getMonth());
    }
  };

  const openBlockDialog = () => {
    setBlockTitle("");
    setBlockDate(format(new Date(), "yyyy-MM-dd"));
    setBlockStart("09:00");
    setBlockEnd("10:00");
    setBlockOpenNote(false);
    setBlockOpen(true);
  };

  const submitBlock = async () => {
    const title = blockTitle.trim();
    if (!title) {
      toast.error("Add a title");
      return;
    }
    const api = getElectronAPI();
    if (!api?.calendarLocalBlocks?.add) {
      toast.error("Local blocks require the desktop app");
      return;
    }
    const [y, m, d] = blockDate.split("-").map(Number);
    const [sh, sm] = blockStart.split(":").map(Number);
    const [eh, em] = blockEnd.split(":").map(Number);
    const start = new Date(y, m - 1, d, sh, sm, 0, 0);
    const end = new Date(y, m - 1, d, eh, em, 0, 0);
    if (end.getTime() <= start.getTime()) {
      toast.error("End time must be after start");
      return;
    }
    const eventId = await addLocalBlock({ title, start, end, noteId: null });
    setBlockOpen(false);
    toast.success("Block added — only in Syag, not in Google/Outlook");
    if (blockOpenNote && eventId) {
      navigate("/new-note", { state: { eventTitle: title, eventId } });
    }
  };

  const handleDeleteLocal = async (e: React.MouseEvent, evt: CalendarEvent) => {
    e.stopPropagation();
    if (evt.source !== "local") return;
    await deleteLocalBlock(evt.id);
    toast.success("Block removed");
  };

  const eventRowClass = (evt: CalendarEvent) =>
    cn(
      "w-full text-left rounded-lg border p-3 hover:border-accent/40 hover:shadow-sm transition-all group",
      evt.source === "local" || evt.isAllDay
        ? "border-dashed bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,hsl(var(--border)/0.35)_6px,hsl(var(--border)/0.35)_7px)] bg-card"
        : "border-border bg-card"
    );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      )}
      <main className={cn("flex-1 overflow-y-auto", !sidebarOpen && isElectron && "pl-20")}>
        <div className={cn("flex items-center justify-between px-4 pb-0", isElectron ? "pt-10" : "pt-3")}>
          <SidebarCollapseButton />
        </div>
        <div className="mx-auto max-w-4xl px-6 pt-4 pb-8 font-body">
          {!showMainCalendar ? (
            <div className="mb-6 rounded-xl border border-border bg-card p-6 text-center space-y-4">
              <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-1" />
              <h2 className="text-[15px] font-medium text-foreground mb-1">No calendar yet</h2>
              <p className="text-[13px] text-muted-foreground">
                Import an .ics feed or add a Syag-only schedule block
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => setIcsOpen(true)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Import Calendar (.ics)
                </button>
                {isElectron && (
                  <button
                    onClick={openBlockDialog}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/15 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Schedule block (Syag only)
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {hasSyncedSource ? (
                <div className="mb-6 flex flex-col gap-2 rounded-lg border border-border bg-card/50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-muted-foreground min-w-0">
                    <span className="font-medium text-foreground/90">{calendarSources.length}</span> connected
                    {icsSource ? (
                      <span className="block sm:inline sm:ml-1 truncate" title={icsSource}>
                        — {connectedCalendarSummary}
                      </span>
                    ) : null}
                  </span>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setIcsOpen(true)}
                      className="text-xs text-accent hover:underline whitespace-nowrap"
                    >
                      Add calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/settings?section=calendar")}
                      className="text-xs text-muted-foreground hover:underline whitespace-nowrap"
                    >
                      Manage
                    </button>
                    <button
                      onClick={clearCalendar}
                      className="text-xs text-destructive hover:underline whitespace-nowrap"
                    >
                      Remove all from Syag
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mb-6 rounded-lg border border-dashed border-border bg-card/30 px-4 py-2.5 text-xs text-muted-foreground">
                  Syag-only blocks — not synced to Google or Outlook. Connect a calendar in Settings to import
                  meetings.
                </div>
              )}

              {/* Calendar header */}
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="font-display text-2xl text-foreground">
                  {view === "list" ? listHeaderLabel : `${monthNames[month]} ${year}`}
                </h1>
                <div className="flex flex-wrap items-center gap-3">
                  {calendarSources.length > 0 && (
                    <select
                      value={calendarViewId}
                      onChange={(e) => setCalendarViewId(e.target.value)}
                      className="max-w-[11rem] rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                      aria-label="Which calendars to show"
                    >
                      <option value="all">All calendars</option>
                      {calendarSources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {isElectron && (
                    <button
                      onClick={openBlockDialog}
                      className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Block
                    </button>
                  )}
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
                    <button
                      onClick={view === "list" ? prevList : prevMonth}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={goToday}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      Today
                    </button>
                    <button
                      onClick={view === "list" ? nextList : nextMonth}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {view === "grid" ? (
                <>
                  <div className="grid grid-cols-7 border-b border-border">
                    {daysOfWeek.map((d) => (
                      <div key={d} className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7">
                    {Array.from({ length: startOffset }).map((_, i) => (
                      <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border p-1.5" />
                    ))}
                    {days.map((day) => {
                      const dayEvents = getEventsForDay(day);
                      return (
                        <div
                          key={day}
                          className="min-h-[100px] border-b border-r border-border p-1.5 transition-colors hover:bg-card/60"
                        >
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                              isToday(day) ? "bg-accent text-accent-foreground font-semibold" : "text-foreground"
                            }`}
                          >
                            {day}
                          </span>
                          <div className="mt-0.5 space-y-0.5">
                            {dayEvents.slice(0, 3).map((evt) => {
                              const linked = findNoteForEvent(evt);
                              return (
                                <button
                                  key={evt.id}
                                  type="button"
                                  title={
                                    evt.calendarName && calendarViewId === "all"
                                      ? `${evt.title} — ${evt.calendarName}`
                                      : evt.title
                                  }
                                  onClick={() => handleEventClick(evt)}
                                  className={cn(
                                    "w-full text-left truncate rounded px-1 py-0.5 text-[10px] font-medium hover:opacity-90 transition-colors cursor-pointer flex items-center gap-0.5",
                                    evt.source === "local"
                                      ? "bg-muted/80 text-foreground"
                                      : "bg-accent/10 text-accent"
                                  )}
                                >
                                  {linked || evt.noteId ? (
                                    <FileText className="h-2.5 w-2.5 flex-shrink-0 opacity-70" />
                                  ) : null}
                                  {format(new Date(evt.start), "h:mm")} {evt.title}
                                </button>
                              );
                            })}
                            {dayEvents.length > 3 && (
                              <button
                                type="button"
                                onClick={() => setView("list")}
                                className="text-[10px] text-accent hover:underline px-1"
                              >
                                +{dayEvents.length - 3} more
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div ref={listViewScrollRef}>
                  {listViewDates.length === 0 ? (
                    <div className="text-center py-16">
                      <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No events in this date range</p>
                      <p className="text-xs text-muted-foreground mt-2">Use the arrows to move by a week</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {listViewDates.map((dateKey) => {
                        const dayEvents = listViewGrouped[dateKey];
                        const dateObj = new Date(dateKey + "T12:00:00");
                        const dayIsToday = isTodayFn(dateObj);
                        const dayIsTomorrow = isTomorrow(dateObj);
                        return (
                          <div key={dateKey} className="mb-2">
                            <div
                              className={cn(
                                "sticky top-0 z-10 flex items-center gap-3 px-3 py-2 rounded-lg mb-1 bg-background border-b border-border/50",
                                dayIsToday ? "text-accent" : ""
                              )}
                            >
                              <div
                                className={cn(
                                  "flex h-10 w-10 flex-shrink-0 flex-col items-center justify-center rounded-lg text-center",
                                  dayIsToday ? "bg-accent text-accent-foreground" : "bg-card border border-border"
                                )}
                              >
                                <span className="text-[10px] font-medium leading-none">{format(dateObj, "EEE")}</span>
                                <span className="text-lg font-semibold leading-none mt-0.5">{format(dateObj, "d")}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    "text-sm font-medium truncate",
                                    dayIsToday ? "text-accent" : "text-foreground"
                                  )}
                                >
                                  {dayIsToday ? "Today" : dayIsTomorrow ? "Tomorrow" : format(dateObj, "EEEE")}
                                </p>
                                <p className="text-[11px] text-muted-foreground">{format(dateObj, "MMMM d, yyyy")}</p>
                              </div>
                              <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                                {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
                              </span>
                            </div>

                            <div className="ml-5 border-l-2 border-border pl-5 space-y-1 mt-1 mb-4">
                              {dayEvents.map((evt) => {
                                const linked = findNoteForEvent(evt);
                                return (
                                  <div key={evt.id} className="relative group/row">
                                    <button
                                      onClick={() => handleEventClick(evt)}
                                      className={eventRowClass(evt)}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div
                                          className="min-w-0 flex-1 border-l-[3px] pl-2 -ml-0.5"
                                          style={{
                                            borderColor:
                                              evt.source === "local"
                                                ? "hsl(var(--muted-foreground) / 0.5)"
                                                : `hsl(${(evt.id.charCodeAt(0) * 37) % 360} 40% 45%)`,
                                          }}
                                        >
                                          <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-medium text-foreground truncate group-hover:text-accent transition-colors">
                                              {evt.title}
                                            </h4>
                                            {evt.source === "local" && (
                                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1">
                                                Syag
                                              </span>
                                            )}
                                            {calendarViewId === "all" &&
                                              evt.source === "synced" &&
                                              evt.calendarName && (
                                                <span className="text-[9px] text-muted-foreground border border-border/60 rounded px-1 max-w-[7rem] truncate">
                                                  {evt.calendarName}
                                                </span>
                                              )}
                                          </div>
                                          <div className="flex items-center gap-3 mt-1">
                                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                              <Clock className="h-3 w-3" />
                                              {format(new Date(evt.start), "h:mm a")} —{" "}
                                              {format(new Date(evt.end), "h:mm a")}
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
                                          {evt.source === "local" && (
                                            <p className="text-[10px] text-muted-foreground mt-1.5">
                                              Only in Syag — won&apos;t appear in Google Calendar or Outlook.
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                          {linked || evt.noteId ? (
                                            <div
                                              className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent"
                                              title="Has note"
                                            >
                                              <FileText className="h-3.5 w-3.5" />
                                            </div>
                                          ) : (
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
                                              <Calendar className="h-3.5 w-3.5" />
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </button>
                                    {evt.source === "local" && isElectron && (
                                      <button
                                        type="button"
                                        aria-label="Delete block"
                                        onClick={(e) => void handleDeleteLocal(e, evt)}
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
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <ICSDialog open={icsOpen} onOpenChange={setIcsOpen} />

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule block (Syag only)</DialogTitle>
            <DialogDescription>
              This block stays on your device and in Syag. It is not written to Google Calendar or Outlook.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Title</label>
              <input
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Focus time, travel, …"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Date</label>
              <input
                type="date"
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground">Start</label>
                <input
                  type="time"
                  value={blockStart}
                  onChange={(e) => setBlockStart(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">End</label>
                <input
                  type="time"
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <input
                type="checkbox"
                checked={blockOpenNote}
                onChange={(e) => setBlockOpenNote(e.target.checked)}
                className="rounded border-border"
              />
              Open new note for this block after saving
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setBlockOpen(false)}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitBlock()}
              className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground"
            >
              Save block
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
