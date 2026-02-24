import { useState, useMemo, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { NoteCardMenu } from "@/components/NoteCardMenu";
import { Plus, FolderOpen, ArrowLeft, FileText, PanelRight, PanelRightClose } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AskBar } from "@/components/AskBar";
import { useFolders } from "@/contexts/FolderContext";
import { useNotes } from "@/contexts/NotesContext";
import { useCalendar } from "@/contexts/CalendarContext";
import { ICSDialog } from "@/components/ICSDialog";
import { HomeShelf, getShelfOpenDefault, setShelfOpenPersist } from "@/components/HomeShelf";
import { ActionItemsThisWeek, type ManualActionItem } from "@/components/ActionItemsThisWeek";
import { CalendarEvent } from "@/lib/ics-parser";
import { addDays, isSameDay } from "date-fns";

const MANUAL_ACTION_ITEMS_KEY = "syag-manual-action-items";

function loadManualActionItems(): ManualActionItem[] {
  try {
    const raw = localStorage.getItem(MANUAL_ACTION_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveManualActionItems(items: ManualActionItem[]) {
  try {
    localStorage.setItem(MANUAL_ACTION_ITEMS_KEY, JSON.stringify(items));
  } catch { /* localStorage not available */ }
}

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { folders } = useFolders();
  const { notes, deleteNote, updateNoteFolder, updateNote } = useNotes();
  const { events, icsSource } = useCalendar();
  const [icsOpen, setIcsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [shelfOpen, setShelfOpenState] = useState(getShelfOpenDefault);
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const [manualActionItems, setManualActionItems] = useState<ManualActionItem[]>(() => loadManualActionItems());

  const setShelfOpen = (open: boolean) => {
    setShelfOpenState(open);
    setShelfOpenPersist(open);
    if (!open) setSelectedEvent(null);
  };

  const now = new Date();
  // Coming up: today's meetings; if already end of day (6 PM+), show next day's meetings
  const endOfDayHour = 18;
  const targetDay = now.getHours() >= endOfDayHour ? addDays(now, 1) : now;
  const upcomingEvents = events
    .filter((e) => isSameDay(new Date(e.start), targetDay))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const activeFolderId = searchParams.get("folder");
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : null;

  useEffect(() => {
    saveManualActionItems(manualActionItems);
  }, [manualActionItems]);

  const addManualActionItem = useCallback(() => {
    setManualActionItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: "New action item", assignee: "You", done: false },
    ]);
  }, []);

  const updateManualActionItem = useCallback((id: string, patch: Partial<ManualActionItem>) => {
    setManualActionItems((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }, []);

  const removeManualActionItem = useCallback((id: string) => {
    setManualActionItems((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Focus sidebar search when ?focusSearch=1
  const focusSearch = searchParams.get("focusSearch") === "1";
  useEffect(() => {
    if (focusSearch) {
      document.getElementById("sidebar-search-input")?.focus();
      navigate("/", { replace: true });
    }
  }, [focusSearch, navigate]);

  // Search filter for home notes list
  const searchLower = searchQuery.trim().toLowerCase();
  const notesForList = useMemo(() => {
    if (!searchLower) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(searchLower) ||
        (n.summary?.overview ?? "").toLowerCase().includes(searchLower) ||
        (n.personalNotes ?? "").toLowerCase().includes(searchLower)
    );
  }, [notes, searchLower]);

  // Group notes by date (using filtered list on home)
  const grouped = notesForList.reduce<Record<string, typeof notesForList>>((acc, n) => {
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

  // Folder view
  if (activeFolder) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex flex-1 flex-col min-w-0 relative">
          <div className="flex-1 overflow-y-auto pb-24">
            <div className="mx-auto max-w-2xl px-6 py-8">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => navigate("/")}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-accent" />
                  <h1 className="text-xl text-foreground font-medium font-body">{activeFolder.name}</h1>
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
                  {folderNotes.map((n) => (
                    <div key={n.id} className="group flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-card border border-transparent hover:border-border transition-colors">
                      <button
                        onClick={() => navigate(`/note/${n.id}`)}
                        className="flex flex-1 items-center gap-3 text-left min-w-0"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-[15px] text-foreground font-normal truncate font-body">{n.title}</h3>
                          <span className="text-[11px] text-muted-foreground">Me</span>
                        </div>
                      </button>
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">{n.time}</span>
                      <NoteCardMenu
                        noteId={n.id}
                        currentFolderId={n.folderId}
                        onDelete={deleteNote}
                        onMoveToFolder={updateNoteFolder}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0">
            <AskBar
              context="home"
              noteContext={homeNoteContext}
              onNavigateToAskWithExchange={(q, response) =>
                navigate("/ask", { state: { initialMessages: [{ role: "user", text: q }, { role: "assistant", text: response }] } })
              }
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0 relative">
        <div className="flex items-center justify-end gap-1 px-4 pt-3 pb-0">
          <button
            onClick={() => setShelfOpen(!shelfOpen)}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={shelfOpen ? "Hide Coming up" : "Show Coming up"}
          >
            {shelfOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="mx-auto max-w-2xl px-6 py-4">
            {/* Notes list */}
            {notesForList.length === 0 ? (
              <div className="text-center py-12">
                {searchLower ? (
                  <>
                    <p className="text-sm text-muted-foreground">No notes match your search.</p>
                    <button
                      type="button"
                      onClick={() => setSearchParams((p) => { const next = new URLSearchParams(p); next.delete("q"); return next; }, { replace: true })}
                      className="mt-3 text-sm text-accent hover:underline"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent mx-auto mb-4">
                      <Plus className="h-6 w-6" />
                    </div>
                    <h2 className="text-lg text-foreground font-medium mb-2 font-body">No notes yet</h2>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      Start a quick recording to capture your first meeting notes.
                    </p>
                    <button
                      onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
                      className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
                    >
                      Quick Note
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div>
                {Object.entries(grouped).map(([date, items]) => (
                  <div key={date} className="mb-6">
                    <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 mb-1">
                      {date}
                    </h3>
                    <div className="space-y-0.5">
                      {items.map((n) => (
                        <div key={n.id} className="group flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-card border border-transparent hover:border-border transition-colors">
                          <button
                            onClick={() => navigate(`/note/${n.id}`)}
                            className="flex flex-1 items-center gap-3 text-left min-w-0"
                          >
                            <FileText className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <h3 className="text-[15px] text-foreground font-normal truncate font-body">{n.title}</h3>
                              <span className="text-[11px] text-muted-foreground">Me</span>
                            </div>
                          </button>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0">{n.time}</span>
                          <NoteCardMenu
                            noteId={n.id}
                            currentFolderId={n.folderId}
                            onDelete={deleteNote}
                            onMoveToFolder={updateNoteFolder}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <AskBar
              context="home"
              noteContext={homeNoteContext}
              onNavigateToAskWithExchange={(q, response) =>
                navigate("/ask", { state: { initialMessages: [{ role: "user", text: q }, { role: "assistant", text: response }] } })
              }
            />
        </div>
      </main>
      {shelfOpen && (
        <div className="w-80 flex-shrink-0 flex flex-col h-full overflow-y-auto border-l border-border bg-card/30">
          <div className="p-4 space-y-6 flex flex-col">
          <HomeShelf
            upcomingEvents={upcomingEvents}
            icsSource={icsSource}
            selectedEvent={selectedEvent}
            onSelectEvent={(evt) => setSelectedEvent(evt)}
            onQuickNote={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
            onStartNotesForEvent={(evt) => {
              setSelectedEvent(null);
              navigate("/new-note", { state: { eventTitle: evt.title, eventId: evt.id } });
            }}
            onOpenCalendar={() => setIcsOpen(true)}
            hasNotes={notes.length > 0}
            compact
          />
          <ActionItemsThisWeek
            notes={notes}
            updateNote={updateNote}
            manualItems={manualActionItems}
            onAddManual={addManualActionItem}
            onUpdateManual={updateManualActionItem}
            onRemoveManual={removeManualActionItem}
          />
          </div>
        </div>
      )}
      <ICSDialog open={icsOpen} onOpenChange={setIcsOpen} />
    </div>
  );
};

export default Index;
