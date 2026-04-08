import { useState, useEffect, useMemo, useCallback } from "react";
import { Sidebar, SidebarTopBarLeft, SidebarCollapseButton } from "@/components/Sidebar";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { isElectron, getElectronAPI, type MemoryStats } from "@/lib/electron-api";
import { NoteCardMenu } from "@/components/NoteCardMenu";
import { Plus, FolderOpen, ArrowLeft, FileText, Calendar, List, Mic, Check, X, ChevronDown, FolderKanban, Brain, Zap, ChevronRight, AlertCircle, Clock, ArrowUpRight, Pause, Briefcase, Loader2, CheckCircle2, Circle, Search } from "lucide-react";
import { useSearchCommand } from "@/components/SearchCommand";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AskBar } from "@/components/AskBar";
import { useFolders } from "@/contexts/FolderContext";
import { useNotes } from "@/contexts/NotesContext";
import { useRecording } from "@/contexts/RecordingContext";
import { useCalendar } from "@/contexts/CalendarContext";
import { ICSDialog } from "@/components/ICSDialog";
import { EventDetailSheet } from "@/components/EventDetailSheet";
import { CalendarEvent } from "@/lib/ics-parser";
import { format, parse, isToday as isTodayFn, isAfter, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { PrepCard } from "@/components/PrepCard";
import { CalendarAgendaList } from "@/components/CalendarAgendaList";
// MemoryBanner and StatsRow removed — vanity metrics that cluttered the Today page.
// Professional memory stats are still fetched for other uses (top contacts, etc.)

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
  const { notes, deleteNote, updateNoteFolder, updateNote, summarizingNoteIds } = useNotes();
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
  const { displayEvents, icsSource, calendarViewId } = useCalendar();
  const { open: openSearch } = useSearchCommand();
  const [icsOpen, setIcsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const now = new Date();
  const upcomingEventsList = displayEvents
    .filter((e) => isAfter(new Date(e.end), now))
    .filter((e) => e.title && !['busy', 'free', '(no title)'].includes(e.title.trim().toLowerCase()))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 5);
  const activeFolderId = searchParams.get("folder");
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : null;

  const api = getElectronAPI();
  const [openCommitments, setOpenCommitments] = useState<any[]>([]);
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [latestCoachingHeadline, setLatestCoachingHeadline] = useState<string | null>(null);
  const viewAll = searchParams.get("view") === "all";

  // Prep brief: all hooks must be above the early return (folder view) to respect React rules
  const [prepBrief, setPrepBrief] = useState<{ previousMeetings: any[]; openCommitments: any[] } | null>(null);

  // Intelligence layer state
  const [riskLevels, setRiskLevels] = useState<any[]>([]);
  const [staleDecisions, setStaleDecisions] = useState<any[]>([]);
  const [latestBriefRun, setLatestBriefRun] = useState<any>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'amber' | 'error' } | null>(null);

  // Professional Memory stats
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);

  useEffect(() => {
    if (!api?.memory?.commitments) return;
    api.memory.commitments.getOpen().then(setOpenCommitments).catch(() => {});
    api?.memory?.projects?.getAll({ status: 'active' }).then(p => setActiveProjects(p?.slice(0, 3) || [])).catch(() => {});
  }, [api, notes.length]);

  // Intelligence data fetching
  useEffect(() => {
    if (!api?.intelligence) return;
    api.intelligence.getRiskLevels().then(setRiskLevels).catch(() => {});
    api.intelligence.getStaleDecisions().then(setStaleDecisions).catch(() => {});
    api.intelligence.getLatestBriefRun().then(setLatestBriefRun).catch(() => {});
  }, [api, notes.length]);

  // Professional Memory stats
  useEffect(() => {
    if (!api?.memory?.stats) return;
    api.memory.stats().then(setMemoryStats).catch((err) => console.error('memory:stats failed:', err));
  }, [api, notes.length]);

  // Nudge action handlers
  const handleMarkDone = useCallback(async (id: string) => {
    await api?.memory?.commitments?.updateStatus(id, 'completed');
    api?.intelligence?.getRiskLevels().then(setRiskLevels).catch(() => {});
    api?.memory?.commitments?.getOpen().then(setOpenCommitments).catch(() => {});
  }, [api]);

  const handleSnooze = useCallback(async (id: string) => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await api?.memory?.commitments?.snooze(id, tomorrow);
    api?.intelligence?.getRiskLevels().then(setRiskLevels).catch(() => {});
    setToast({ message: 'Snoozed for 24h', type: 'amber' });
    setTimeout(() => setToast(null), 2500);
  }, [api]);

  const handleDraftFollowUp = useCallback(async (id: string) => {
    const result = await api?.intelligence?.generateFollowUpDraft(id);
    if (result?.ok && result.draft) {
      await navigator.clipboard.writeText(result.draft);
      setToast({ message: 'Copied to clipboard', type: 'success' });
    } else {
      setToast({ message: 'Failed to generate draft', type: 'error' });
    }
    setTimeout(() => setToast(null), 2500);
  }, [api]);

  const atRisk = riskLevels.filter(c => c.risk_level === 'AMBER' || c.risk_level === 'RED');

  // Latest coaching headline from most recent note with insights
  useEffect(() => {
    const latest = notes.find(n => n.coachingMetrics?.conversationInsights?.headline);
    if (latest) setLatestCoachingHeadline(latest.coachingMetrics!.conversationInsights!.headline);
  }, [notes]);

  // Prep brief effect: fetch context for the next meeting's attendees (must be above early return)
  const upcomingForPrep = displayEvents
    .filter((e) => isAfter(new Date(e.end), new Date()))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const nextEventForHook = upcomingForPrep.length > 0 ? upcomingForPrep[0] : null;
  useEffect(() => {
    if (!nextEventForHook?.attendees?.length || !api?.context?.assemble) { setPrepBrief(null); return }
    const names = nextEventForHook.attendees.map((a: any) => a.name).filter(Boolean);
    const emails = nextEventForHook.attendees.map((a: any) => a.email).filter(Boolean);
    api.context.assemble({ attendeeNames: names, attendeeEmails: emails, eventTitle: nextEventForHook.title })
      .then(ctx => { if (ctx) setPrepBrief(ctx) })
      .catch(() => {});
  }, [nextEventForHook?.id, api]);

  const grouped = notes.reduce<Record<string, typeof notes>>((acc, n) => {
    (acc[n.date] = acc[n.date] || []).push(n);
    return acc;
  }, {});

  const folderNotes = activeFolderId ? notes.filter((n) => n.folderId === activeFolderId) : [];

  const homeNoteContext = useMemo(() => {
    const NOTE_LIMIT = 25;
    const NOTE_CHAR_LIMIT = 1200;
    const TOTAL_CHAR_LIMIT = 18000;
    let total = 0;
    const parts: string[] = [];
    for (const n of notes.slice(0, NOTE_LIMIT)) {
      const noteParts = [`Title: ${n.title} (${n.date})`];
      if (n.summary?.overview) noteParts.push(`Summary: ${n.summary.overview}`);
      if (n.personalNotes) noteParts.push(`Notes: ${n.personalNotes.slice(0, 500)}`);
      // Include transcript for richer Quick Prompt answers (TL;DR, action items, etc.)
      if ((n as any).transcript?.length > 0) {
        const txt = (n as any).transcript.map((t: any) => t.text).join(' ').trim();
        if (txt) noteParts.push(`Transcript: ${txt.slice(0, 4000)}`);
      }
      const noteStr = noteParts.join('\n').slice(0, NOTE_CHAR_LIMIT);
      if (total + noteStr.length > TOTAL_CHAR_LIMIT) break;
      total += noteStr.length;
      parts.push(noteStr);
    }
    return parts.join('\n\n');
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

  const selectionActive = selectedIds.size > 0;

  const NoteRow = ({ n }: { n: (typeof notes)[0] }) => {
    const isRecording = activeSession?.noteId === n.id && !n.summary;
    const isSummarizing = summarizingNoteIds.has(n.id);
    const selected = selectedIds.has(n.id);
    return (
      <div
        className={cn(
          "group flex items-stretch gap-0 rounded-lg transition-all",
          selected ? "bg-accent/8 ring-1 ring-accent/25" : "hover:bg-card/80",
        )}
      >
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
          className="flex flex-1 items-center gap-3 text-left min-w-0 py-2 pr-1"
        >
          <div className="flex-1 min-w-0">
            <h3 className="font-body text-[13.5px] font-medium text-foreground truncate leading-snug">
              {n.title}
            </h3>
            {isSummarizing ? (
              <p className="text-[12px] text-muted-foreground/70 truncate leading-snug mt-0.5 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Summarizing...</span>
              </p>
            ) : n.summary?.overview ? (
              <p className="text-[12px] text-muted-foreground/70 truncate leading-snug mt-0.5">
                {n.summary.overview.slice(0, 80)}
              </p>
            ) : null}
          </div>
        </button>
        <div className="flex items-center gap-2 pr-2 shrink-0 justify-end">
          <span className="text-[10.5px] text-muted-foreground/50 tabular-nums text-right whitespace-nowrap">
            {n.timeRange ?? n.time}
          </span>
          {isRecording && (
            <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
          <NoteCardMenu
            noteId={n.id}
            noteTitle={n.title}
            currentFolderId={n.folderId}
            onDelete={handleDeleteNote}
            onMoveToFolder={updateNoteFolder}
            onRename={(id, newTitle) => updateNote(id, { title: newTitle })}
          />
        </div>
      </div>
    );
  };

  // Folder view — show loading spinner if folder ID is in URL but folders haven't loaded yet
  if (activeFolderId && !activeFolder) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        {sidebarOpen && (
          <div className="flex-shrink-0 overflow-hidden">
            <Sidebar />
          </div>
        )}
        <main className={cn("flex flex-1 flex-col min-w-0 relative items-center justify-center", !sidebarOpen && isElectron && "pl-20")}>
          <div className="text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3 animate-pulse" />
            <p className="text-sm text-muted-foreground">Loading folder...</p>
          </div>
        </main>
      </div>
    );
  }

  if (activeFolder) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        {sidebarOpen && (
          <div className="flex-shrink-0 overflow-hidden">
            <Sidebar />
          </div>
        )}
        <main className={cn("flex flex-1 flex-col min-w-0 relative", !sidebarOpen && isElectron && "pl-20")}>
          <div className="flex-1 overflow-y-auto pb-24">
            <div className={cn("px-4", isElectron && !sidebarOpen ? "pt-10" : "pt-6")}>
              <div className="relative flex items-center mb-4">
                <SidebarTopBarLeft
                  backLabel="Back to home"
                  onBack={() => navigate("/")}
                  backIcon
                />
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-accent" />
                  <h1 className="font-display text-xl text-foreground">{activeFolder.name}</h1>
                  <span className="text-xs text-muted-foreground ml-1">{folderNotes.length} notes</span>
                </div>
              </div>
            </div>
            <div
              className={cn(
                "mx-auto max-w-2xl px-6 font-body pb-8"
              )}
            >

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

  // Next upcoming event for prep card
  const nextEvent = upcomingEventsList.length > 0 ? upcomingEventsList[0] : null;
  const nextEventForPrep = nextEvent ? {
    id: nextEvent.id,
    title: nextEvent.title,
    startTime: nextEvent.start,
    endTime: nextEvent.end,
    attendees: nextEvent.attendees?.map((a: any) => a.name || a.email),
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

  // "This Week" commitments: overdue + due within 7 days (owned by user)
  const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);
  const thisWeekCommitments = openCommitments.filter(c => {
    if (!c.due_date) return false;
    const due = c.due_date.slice(0, 10);
    return due <= sevenDaysFromNow; // includes overdue (past dates) + this week
  }).sort((a: any, b: any) => (a.due_date || '').localeCompare(b.due_date || ''));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="flex-shrink-0 overflow-hidden">
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
          <div className="mx-auto max-w-2xl px-6 py-6 font-body page-enter">

            {/* ── Header ── */}
            <div className="mb-6">
              {viewAll ? (
                <div className="flex items-center justify-between">
                  <h1 className="font-display text-[20px] font-semibold text-foreground tracking-tight">
                    All Notes
                    {notes.length > 0 && <span className="text-foreground/50 font-normal ml-2 text-[18px]">{notes.length}</span>}
                  </h1>
                  <button
                    onClick={openSearch}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Search
                    <kbd className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">⌘K</kbd>
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="font-display text-[20px] font-semibold text-foreground tracking-tight">
                    Good {timeOfDay}. <span className="text-muted-foreground/60 font-normal text-[15px] ml-1">{format(now, "EEEE, MMMM d")}</span>
                  </h1>
                  {(todayEvents.length > 0 || openCommitments.length > 0 || atRisk.length > 0) && (
                    <p className="text-[13px] text-muted-foreground mt-1">
                      {[
                        todayEvents.length > 0 && `${todayEvents.length} meeting${todayEvents.length !== 1 ? 's' : ''} today`,
                        atRisk.length > 0 && `${atRisk.length} at risk`,
                        staleDecisions.length > 0 && `${staleDecisions.length} stale`,
                        openCommitments.length > 0 && !atRisk.length && `${openCommitments.length} open commitments`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ── Command Center v2 (hidden in All Notes view) ── */}
            {!viewAll && (<>
            {/* ── Next Meeting + Prep ── */}
            <div className="mb-3">
              <PrepCard
                event={nextEventForPrep}
                lastMeetingNotes={prepBrief?.previousMeetings?.[0]?.meetings?.[0] ? {
                  title: prepBrief.previousMeetings[0].meetings[0].title,
                  keyPoints: [`Last met ${prepBrief.previousMeetings[0].personName} on ${prepBrief.previousMeetings[0].meetings[0].date}`],
                } : undefined}
                openCommitments={prepBrief?.openCommitments?.slice(0, 3).map((c: any) => ({
                  text: c.text,
                  assigneeName: c.owner === 'you' ? undefined : c.assignee || c.owner,
                }))}
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

            {/* ── Schedule (skip first event to avoid duplication with Prep Card) ── */}
            {icsSource && upcomingEventsList.length > 1 && (
              <div className="mb-3">
                <div className="rounded-[10px] border border-border bg-card p-4" style={{ boxShadow: "var(--card-shadow)", borderLeftWidth: '3px', borderLeftColor: 'hsl(var(--primary))' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      Coming Up
                    </span>
                    <button onClick={() => navigate("/calendar?view=list")} className="text-[11px] text-primary hover:underline">
                      Full calendar
                    </button>
                  </div>
                  <CalendarAgendaList
                    events={upcomingEventsList.slice(1, 4)}
                    onEventClick={(evt) => setSelectedEvent(evt)}
                    findNoteForEvent={findNoteForEvent}
                    calendarViewId={calendarViewId}
                    variant="compact"
                    hideDayEventCount
                  />
                </div>
              </div>
            )}

            {/* ── This Week (commitments due soon) ── */}
            {thisWeekCommitments.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">This week</span>
                  <button onClick={() => navigate('/commitments')} className="text-[11px] text-primary hover:underline">
                    View all
                  </button>
                </div>
                <div className="space-y-1">
                  {thisWeekCommitments.slice(0, 6).map((c: any) => {
                    const isOverdue = c.due_date && c.due_date.slice(0, 10) < todayStr;
                    const isDueToday = c.due_date && c.due_date.slice(0, 10) === todayStr;
                    return (
                      <div
                        key={c.id}
                        className="flex items-start gap-2.5 rounded-md px-3 py-2 hover:bg-secondary/40 transition-colors group"
                      >
                        <button
                          onClick={() => {
                            api?.memory?.commitments?.updateStatus(c.id, 'completed').then(() => {
                              setOpenCommitments(prev => prev.filter(x => x.id !== c.id));
                            }).catch(() => {});
                          }}
                          className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          title="Mark done"
                        >
                          <Circle className="h-3.5 w-3.5" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-foreground leading-snug">{c.text}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {c.owner && c.owner !== 'you' && (
                              <span className="text-[11px] text-muted-foreground">{c.owner}</span>
                            )}
                            {c.due_date && (
                              <span className={cn(
                                "text-[11px] font-medium",
                                isOverdue ? "text-destructive" : isDueToday ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                              )}>
                                {isOverdue ? "Overdue" : isDueToday ? "Today" : new Date(c.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {thisWeekCommitments.length > 6 && (
                    <button
                      onClick={() => navigate('/commitments?filter=upcoming')}
                      className="text-[12px] text-primary hover:underline px-3 py-1"
                    >
                      +{thisWeekCommitments.length - 6} more
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Needs Attention (risk commitments + stale decisions) ── */}
            {(atRisk.length > 0 || staleDecisions.length > 0) && (
              <div className="mb-3">
                <div className="rounded-[10px] border border-border bg-card p-4" style={{ boxShadow: "var(--card-shadow)", borderLeftWidth: '3px', borderLeftColor: 'hsl(var(--amber, 30 55% 64%))' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5" style={{ color: 'hsl(25 65% 45%)' }} />
                      Needs Attention
                      <span className="text-[11px] font-normal">{atRisk.length + staleDecisions.length}</span>
                    </span>
                    <button onClick={() => navigate('/commitments')} className="text-[11px] text-primary hover:underline">
                      View all
                    </button>
                  </div>
                  <div className="space-y-2">
                    {atRisk.map((c: any) => (
                      <div
                        key={c.id}
                        className="rounded-[10px] border border-border p-3.5 transition-all"
                        style={{
                          borderLeftWidth: '3px',
                          borderLeftColor: c.risk_level === 'RED' ? 'hsl(25 65% 45%)' : 'hsl(30 55% 64%)',
                        }}
                        role="alert"
                        aria-label={`${c.risk_level === 'RED' ? 'Overdue' : 'Due soon'}: ${c.text}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-foreground leading-snug">{c.text}</p>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                              {c.owner && <span>{c.owner}</span>}
                              {c.due_date && (
                                <span style={{ color: c.risk_level === 'RED' ? 'hsl(25 65% 45%)' : 'hsl(30 55% 64%)' }}>
                                  {c.risk_level === 'RED' ? 'Overdue' : `Due ${c.due_date}`}
                                </span>
                              )}
                              {c.note_id && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/note/${c.note_id}`); }}
                                  className="text-[10px] text-primary underline cursor-pointer hover:text-primary/80"
                                >
                                  Source note
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleMarkDone(c.id)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-primary hover:bg-secondary/60 transition-colors"
                              title="Mark done" aria-label="Mark done"
                            >
                              <Check className="h-3 w-3" />
                              <span className="hidden sm:inline">Done</span>
                            </button>
                            <button
                              onClick={() => handleSnooze(c.id)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-primary hover:bg-secondary/60 transition-colors"
                              title="Snooze 24h" aria-label="Snooze"
                            >
                              <Pause className="h-3 w-3" />
                              <span className="hidden sm:inline">Snooze</span>
                            </button>
                            <button
                              onClick={() => handleDraftFollowUp(c.id)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-primary hover:bg-secondary/60 transition-colors"
                              title="Draft follow-up message"
                            >
                              <ArrowUpRight className="h-3 w-3" />
                              <span className="hidden sm:inline">Draft msg</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {staleDecisions.map((d: any) => (
                      <div
                        key={d.id}
                        className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left hover:bg-secondary/50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/decisions`)}
                      >
                        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[13px] text-foreground/90 truncate flex-1">{d.text}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">unchanged 14+ days</span>
                        {d.note_id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/note/${d.note_id}`); }}
                            className="text-[10px] text-primary underline cursor-pointer hover:text-primary/80 shrink-0"
                          >
                            Source
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Daily Brief (only show when AI-generated content exists) ── */}
            {latestBriefRun?.status === 'success' && latestBriefRun?.output && (
              <div className="mb-3">
                <div className="rounded-[10px] border border-border bg-card p-4" style={{ boxShadow: "var(--card-shadow)", borderLeftWidth: '3px', borderLeftColor: 'hsl(var(--primary))' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Daily Brief</span>
                  </div>
                  <p className="text-[13.5px] text-foreground leading-relaxed">{latestBriefRun.output}</p>
                </div>
              </div>
            )}
            </>)}

            {/* ── Recent Meetings (collapsible on homepage, always-expanded in All Notes) ── */}
            {notes.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-border bg-card/30 px-6 py-8 text-center">
                {!icsSource ? (
                  /* No calendar connected — guide to connect first */
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mx-auto mb-3">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <h2 className="font-display text-[15px] font-semibold text-foreground mb-1">Get started with OSChief</h2>
                    <p className="text-[12px] text-muted-foreground max-w-xs mx-auto mb-4">
                      Connect your calendar so OSChief can detect meetings, prep you before calls, and track your work over time.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => setIcsOpen(true)}
                        className="rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-all hover:opacity-90"
                      >
                        Connect Calendar
                      </button>
                      <button
                        onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
                        className="rounded-md border border-border px-3.5 py-1.5 text-[12px] font-medium text-foreground transition-all hover:bg-secondary"
                      >
                        Quick Note
                      </button>
                    </div>
                  </>
                ) : (
                  /* Calendar connected but no recordings yet */
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mx-auto mb-3">
                      <Mic className="h-5 w-5" />
                    </div>
                    <h2 className="font-display text-[15px] font-semibold text-foreground mb-1">Ready when you are</h2>
                    <p className="text-[12px] text-muted-foreground max-w-xs mx-auto mb-4">
                      Hit record during your next meeting. OSChief will transcribe, summarize, and connect everything to your people and projects.
                    </p>
                    <button
                      onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
                      className="rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-all hover:opacity-90"
                    >
                      Quick Note
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div>
                <div className="space-y-5 animate-in fade-in slide-in-from-top-1 duration-200">
                    {Object.entries(viewAll ? grouped : Object.fromEntries(
                      Object.entries(grouped).filter(([date]) => {
                        try {
                          const parsed = parse(date, "MMM d, yyyy", new Date());
                          return isValid(parsed) && parsed.toDateString() === now.toDateString();
                        } catch { return false; }
                      })
                    )).map(([date, items]) => (
                      <div key={date}>
                        {viewAll && (
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
                        )}
                        <div className="divide-y divide-border/50">
                          {items.map((n) => <NoteRow key={n.id} n={n} />)}
                        </div>
                      </div>
                    ))}
                  </div>
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
                  <div className="absolute bottom-full mb-2 left-0 w-48 rounded-[10px] border border-border bg-popover shadow-lg z-50 overflow-hidden">
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

        {/* Toast notification */}
        {toast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className={cn(
              "rounded-full px-4 py-2 text-xs font-medium shadow-lg",
              toast.type === 'success' && "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20",
              toast.type === 'amber' && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
              toast.type === 'error' && "bg-destructive/10 text-destructive border border-destructive/20",
            )}>
              {toast.message}
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
