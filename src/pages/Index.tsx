import { useState, useEffect, useMemo, useCallback } from "react";
import { Sidebar, SidebarTopBarLeft, SidebarCollapseButton } from "@/components/Sidebar";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { NoteCardMenu } from "@/components/NoteCardMenu";
import { Plus, FolderOpen, ArrowLeft, FileText, Calendar, List, Mic, Check, X, ChevronDown } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AskBar } from "@/components/AskBar";
import { useFolders } from "@/contexts/FolderContext";
import { useNotes } from "@/contexts/NotesContext";
import { useRecording } from "@/contexts/RecordingContext";
import { useCalendar } from "@/contexts/CalendarContext";
import { ICSDialog } from "@/components/ICSDialog";
import { EventDetailSheet } from "@/components/EventDetailSheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarEvent } from "@/lib/ics-parser";
import { format, parse, isToday as isTodayFn, isAfter, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { CommitmentsWidget } from "@/components/CommitmentsWidget";
import { PrepCard } from "@/components/PrepCard";
import { CommitmentsDueCard } from "@/components/CommitmentsDueCard";
import { IntelligenceFeed } from "@/components/IntelligenceFeed";

function accentFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 38% 52%)`;
}

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sidebarOpen } = useSidebarVisibility();
  const { folders, createFolder } = useFolders();
  const { notes, deleteNote, updateNoteFolder } = useNotes();
  const { activeSession, clearSession } = useRecording();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkFolderOpen, setBulkFolderOpen] = useState(false);
  const [creatingBulkFolder, setCreatingBulkFolder] = useState(false);
  const [newBulkFolderName, setNewBulkFolderName] = useState("");

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkFolderOpen(false);
    setCreatingBulkFolder(false);
    setNewBulkFolderName("");
  }, []);

  const bulkMoveToFolder = useCallback(
    (folderId: string | null) => {
      for (const id of selectedIds) {
        updateNoteFolder(id, folderId);
      }
      clearSelection();
    },
    [selectedIds, updateNoteFolder, clearSelection]
  );

  const bulkCreateAndMove = useCallback(() => {
    if (!newBulkFolderName.trim()) return;
    const folder = createFolder(newBulkFolderName.trim());
    bulkMoveToFolder(folder.id);
  }, [newBulkFolderName, createFolder, bulkMoveToFolder]);

  const handleDeleteNote = useCallback(
    (id: string) => {
      deleteNote(id);
      if (activeSession?.noteId === id) clearSession();
    },
    [deleteNote, activeSession?.noteId, clearSession]
  );
  const { displayEvents, icsSource } = useCalendar();
  const [icsOpen, setIcsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const now = new Date();
  const upcomingEventsList = displayEvents
    .filter((e) => isAfter(new Date(e.end), now))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5);
  const upcomingByDate = upcomingEventsList.reduce<Record<string, CalendarEvent[]>>((acc, evt) => {
    const key = format(new Date(evt.start), "yyyy-MM-dd");
    (acc[key] = acc[key] || []).push(evt);
    return acc;
  }, {});
  const upcomingDateKeys = Object.keys(upcomingByDate).sort();

  const activeFolderId = searchParams.get("folder");
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : null;

  const grouped = notes.reduce<Record<string, typeof notes>>((acc, n) => {
    (acc[n.date] = acc[n.date] || []).push(n);
    return acc;
  }, {});

  const folderNotes = activeFolderId ? notes.filter((n) => n.folderId === activeFolderId) : [];

  const homeNoteContext = useMemo(() => {
    return notes.slice(0, 10).map(n => {
      const parts = [`Title: ${n.title} (${n.date})`];
      if (n.summary?.overview) parts.push(`Summary: ${n.summary.overview}`);
      if (n.personalNotes) parts.push(`Notes: ${n.personalNotes.slice(0, 200)}`);
      return parts.join('\n');
    }).join('\n\n');
  }, [notes]);

  const findNoteForEvent = useCallback((evt: CalendarEvent) => {
    const eventDate = format(new Date(evt.start), "MMM d, yyyy");
    return notes.find(
      (n) =>
        n.calendarEventId === evt.id ||
        (n.title === evt.title && n.date === eventDate)
    ) ?? null;
  }, [notes]);

  const handleStartNotesForEvent = useCallback((evt: CalendarEvent) => {
    const note = findNoteForEvent(evt);
    if (note) {
      const isRecording = activeSession?.noteId === note.id;
      if (isRecording) {
        navigate(`/new-note?session=${note.id}`);
      } else {
        navigate(`/note/${note.id}`);
      }
      setSelectedEvent(null);
      return;
    }
    navigate("/new-note", { state: { eventTitle: evt.title, eventId: evt.id } });
    setSelectedEvent(null);
  }, [findNoteForEvent, activeSession?.noteId, navigate]);

  const scoreColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  const selectionActive = selectedIds.size > 0;

  const NoteRow = ({ n }: { n: (typeof notes)[0] }) => {
    const isRecording = activeSession?.noteId === n.id && !n.summary;
    const score = n.coachingMetrics?.overallScore;
    const selected = selectedIds.has(n.id);
    return (
      <div
        className={cn(
          "group flex items-stretch gap-0 rounded-lg transition-all",
          selected ? "bg-accent/8 ring-1 ring-accent/25" : "hover:bg-card/80",
        )}
      >
        {/* Accent bar */}
        <span
          className="w-[3px] shrink-0 rounded-l-lg self-stretch"
          style={{ backgroundColor: accentFromId(n.id) }}
        />
        {/* Checkbox area */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleSelect(n.id); }}
          className={cn(
            "flex items-center justify-center w-7 shrink-0 transition-opacity",
            selectionActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <span
            className={cn(
              "flex items-center justify-center w-4 h-4 rounded border transition-colors",
              selected
                ? "bg-accent border-accent text-white"
                : "border-border hover:border-accent/50",
            )}
          >
            {selected && <Check className="h-2.5 w-2.5" />}
          </span>
        </button>
        {/* Content */}
        <button
          onClick={() => navigate(isRecording ? `/new-note?session=${n.id}` : `/note/${n.id}`)}
          className="flex flex-1 items-center gap-3 text-left min-w-0 py-2.5 pr-1"
        >
          <div className="flex-1 min-w-0">
            <h3 className="font-body text-[13.5px] font-medium text-foreground truncate leading-snug">
              {n.title}
            </h3>
          </div>
        </button>
        <div className="flex items-center gap-2 pr-2 shrink-0">
          <span className="text-[10.5px] text-muted-foreground/50 tabular-nums">
            {n.timeRange ?? n.time}
          </span>
          {isRecording && (
            <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
          {score != null && score > 0 && (
            <span className={cn("flex-shrink-0 w-2 h-2 rounded-full", scoreColor(score))} title={`Score: ${score}`} />
          )}
          <NoteCardMenu
            noteId={n.id}
            currentFolderId={n.folderId}
            onDelete={handleDeleteNote}
            onMoveToFolder={updateNoteFolder}
          />
        </div>
      </div>
    );
  };

  // Folder view
  if (activeFolder) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        {sidebarOpen && (
          <div className="w-56 flex-shrink-0 overflow-hidden">
            <Sidebar />
          </div>
        )}
        <main className={cn("flex flex-1 flex-col min-w-0 relative", !sidebarOpen && isElectron && "pl-20")}>
          <div className="flex-1 overflow-y-auto pb-24">
            <div
              className={cn(
                "mx-auto max-w-2xl px-6 font-body",
                isElectron && !sidebarOpen ? "pt-10 pb-8" : "py-8"
              )}
            >
              <div className="flex items-center gap-3 mb-6">
                <SidebarTopBarLeft
                  backLabel="Back to home"
                  onBack={() => navigate("/")}
                  backIcon
                />
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-accent" />
                  <h1 className="font-display text-xl text-foreground">{activeFolder.name}</h1>
                </div>
                <span className="text-xs text-muted-foreground">{folderNotes.length} notes</span>
              </div>

              {folderNotes.length === 0 ? (
                <div className="text-center py-16">
                  <FolderOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No notes in this folder yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Record a note and add it to this folder</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {folderNotes.map((n) => <NoteRow key={n.id} n={n} />)}
                </div>
              )}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-6">
            <AskBar context="home" noteContext={homeNoteContext} />
          </div>
        </main>
      </div>
    );
  }

  const hour = now.getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  // ── Command Center data ──
  const api = getElectronAPI();
  const [openCommitments, setOpenCommitments] = useState<any[]>([]);
  const viewAll = searchParams.get("view") === "all";
  const [recentMeetingsExpanded, setRecentMeetingsExpanded] = useState(viewAll);

  // Auto-expand notes when navigating via "All Notes" sidebar link
  useEffect(() => {
    if (viewAll) setRecentMeetingsExpanded(true);
  }, [viewAll]);

  // Fetch open commitments for the command center
  useEffect(() => {
    if (!api?.memory?.commitments) return;
    api.memory.commitments.getOpen().then(setOpenCommitments).catch(() => {});
  }, [api, notes.length]);

  // Next upcoming event for prep card
  const nextEvent = upcomingEventsList.length > 0 ? upcomingEventsList[0] : null;
  const nextEventForPrep = nextEvent ? {
    id: nextEvent.id,
    title: nextEvent.title,
    startTime: nextEvent.start,
    endTime: nextEvent.end,
    attendees: nextEvent.attendees,
  } : null;

  // Today's stats for the briefing header
  const todayEvents = displayEvents.filter((e) => isTodayFn(new Date(e.start)));
  const dueToday = openCommitments.filter(c => {
    if (!c.due_date) return false;
    try { return new Date(c.due_date).toDateString() === now.toDateString(); } catch { return false; }
  });
  const overdue = openCommitments.filter(c => {
    if (!c.due_date) return false;
    try { const d = new Date(c.due_date); const t = new Date(); t.setHours(0,0,0,0); return d < t; } catch { return false; }
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      )}
      <main className={cn("flex flex-1 flex-col min-w-0 relative", !sidebarOpen && isElectron && "pl-20")}>
        <div className={cn("flex items-center justify-between px-4 pb-0", isElectron ? "pt-10" : "pt-3")}>
          <SidebarCollapseButton />
          {notes.length > 0 && (
            <button
              onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:opacity-90"
            >
              <Mic className="h-3 w-3" />
              Quick Note
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="mx-auto max-w-2xl px-6 py-6 font-body">

            {/* ── Header ── */}
            <div className="mb-6">
              {viewAll ? (
                <h1 className="font-display text-[20px] font-semibold text-foreground tracking-tight">
                  All Notes
                  {notes.length > 0 && <span className="text-muted-foreground font-normal ml-2 text-[14px]">{notes.length}</span>}
                </h1>
              ) : (
                <>
                  <h1 className="font-display text-[20px] font-semibold text-foreground tracking-tight">
                    Good {timeOfDay}.
                  </h1>
                  {(todayEvents.length > 0 || openCommitments.length > 0) && (
                    <p className="text-[13px] text-muted-foreground mt-1">
                      {[
                        todayEvents.length > 0 && `${todayEvents.length} meeting${todayEvents.length !== 1 ? 's' : ''} today`,
                        overdue.length > 0 && `${overdue.length} overdue`,
                        dueToday.length > 0 && `${dueToday.length} due today`,
                        openCommitments.length > 0 && !overdue.length && !dueToday.length && `${openCommitments.length} open commitments`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Command Center sections (hidden in All Notes view) ── */}
            {!viewAll && (<>
            {/* ── Prep Card (next meeting) ── */}
            <div className="mb-4">
              <PrepCard
                event={nextEventForPrep}
                onStartNote={(evt) => {
                  const calEvt = displayEvents.find(e => e.id === evt.id || e.title === evt.title);
                  if (calEvt) {
                    handleStartNotesForEvent(calEvt);
                  } else {
                    navigate("/new-note", { state: { eventTitle: evt.title, eventId: evt.id } });
                  }
                }}
                onConnectCalendar={() => setIcsOpen(true)}
              />
            </div>

            {/* ── Commitments Due ── */}
            {openCommitments.length > 0 && (
              <div className="mb-4">
                <CommitmentsDueCard commitments={openCommitments} />
              </div>
            )}

            {/* ── Coming Up (calendar, compact) ── */}
            {icsSource && upcomingDateKeys.length > 0 && (
              <div className="mb-4">
                <div
                  className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-[var(--card-shadow-hover)]"
                  style={{ boxShadow: "var(--card-shadow)" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Schedule
                    </h3>
                    <button
                      onClick={() => navigate("/calendar?view=list")}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Full calendar
                    </button>
                  </div>
                  <div className="space-y-1">
                    {upcomingEventsList.slice(0, 4).map((evt) => {
                      const start = new Date(evt.start);
                      const end = new Date(evt.end);
                      const timeStr = evt.isAllDay ? "All day" : `${format(start, "h:mm")} – ${format(end, "h:mm a")}`;
                      const isToday = isTodayFn(start);
                      return (
                        <button
                          key={evt.id}
                          onClick={() => setSelectedEvent(evt)}
                          className="flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-secondary/50 rounded transition-colors"
                        >
                          <span className={cn("text-[11px] tabular-nums min-w-[52px]", isToday ? "text-primary font-medium" : "text-muted-foreground")}>
                            {isToday ? timeStr.split(" – ")[0] : format(start, "EEE h:mm")}
                          </span>
                          <span className="text-[13px] text-foreground truncate">{evt.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            </>)}

            {/* ── Recent Meetings (collapsible on homepage, always-expanded in All Notes) ── */}
            {notes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card/30 px-6 py-10 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mx-auto mb-3">
                  <Mic className="h-5 w-5" />
                </div>
                <h2 className="font-display text-[15px] font-semibold text-foreground mb-1">Record your first meeting</h2>
                <p className="text-[12px] text-muted-foreground max-w-xs mx-auto mb-4">
                  Syag captures, transcribes, and summarizes your meetings automatically.
                </p>
                <button
                  onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
                  className="rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-all hover:opacity-90"
                >
                  Quick Note
                </button>
              </div>
            ) : (
              <div>
                {!viewAll && (
                  <button
                    onClick={() => setRecentMeetingsExpanded(!recentMeetingsExpanded)}
                    className="flex items-center gap-1.5 mb-2 group"
                  >
                    <h2 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                      Recent meetings
                    </h2>
                    <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", recentMeetingsExpanded && "rotate-180")} />
                    <span className="text-[10px] text-muted-foreground">{notes.length}</span>
                  </button>
                )}
                {(viewAll || recentMeetingsExpanded) && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-top-1 duration-200">
                    {Object.entries(grouped).map(([date, items]) => (
                      <div key={date}>
                        <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                          {(() => {
                            try {
                              const parsed = parse(date, "MMM d, yyyy", new Date());
                              return isValid(parsed) ? format(parsed, "EEE, MMM d") : date;
                            } catch {
                              return date;
                            }
                          })()}
                        </h3>
                        <div className="space-y-[2px]">
                          {items.map((n) => <NoteRow key={n.id} n={n} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bulk selection toolbar */}
        {selectionActive && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-2 fade-in duration-200">
            <div className="flex items-center gap-2 rounded-full border border-border bg-card shadow-xl px-4 py-2 backdrop-blur-sm">
              <span className="text-xs font-medium text-foreground tabular-nums">{selectedIds.size} selected</span>
              <span className="w-px h-4 bg-border" />
              <div className="relative">
                <button
                  onClick={() => setBulkFolderOpen(!bulkFolderOpen)}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-accent" />
                  Move to folder
                </button>
                {bulkFolderOpen && (
                  <div className="absolute bottom-full mb-2 left-0 w-48 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-border">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Choose folder</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto py-1">
                      {folders.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => bulkMoveToFolder(f.id)}
                          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                        >
                          <FolderOpen className="h-3 w-3 text-accent" />
                          {f.name}
                        </button>
                      ))}
                    </div>
                    <div className="px-3 py-2 border-t border-border">
                      {creatingBulkFolder ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={newBulkFolderName}
                            onChange={(e) => setNewBulkFolderName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") bulkCreateAndMove();
                              if (e.key === "Escape") { setCreatingBulkFolder(false); setNewBulkFolderName(""); }
                            }}
                            placeholder="Folder name"
                            className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                          />
                          <button onClick={bulkCreateAndMove} className="text-accent"><Check className="h-3 w-3" /></button>
                          <button onClick={() => { setCreatingBulkFolder(false); setNewBulkFolderName(""); }} className="text-muted-foreground"><X className="h-3 w-3" /></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setCreatingBulkFolder(true)}
                          className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                        >
                          <Plus className="h-3 w-3" />
                          New folder
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={clearSelection}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-6">
          <AskBar context="home" noteContext={homeNoteContext} />
        </div>
      </main>
      <ICSDialog open={icsOpen} onOpenChange={setIcsOpen} />
      <EventDetailSheet
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
        onStartNotes={handleStartNotesForEvent}
        existingNote={selectedEvent ? findNoteForEvent(selectedEvent) : null}
      />
    </div>
  );
};

export default Index;
