import { useState, useMemo } from "react";
import { Sidebar } from "@/components/Sidebar";
import { NoteCardMenu } from "@/components/NoteCardMenu";
import { Plus, FolderOpen, ArrowLeft, FileText, Calendar, Link2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AskBar } from "@/components/AskBar";
import { useFolders } from "@/contexts/FolderContext";
import { useNotes } from "@/contexts/NotesContext";
import { useCalendar } from "@/contexts/CalendarContext";
import { ICSDialog } from "@/components/ICSDialog";
import { EventDetailSheet } from "@/components/EventDetailSheet";
import { CalendarEvent } from "@/lib/ics-parser";
import { format, isToday as isTodayFn, isTomorrow, isAfter } from "date-fns";

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { folders } = useFolders();
  const { notes, deleteNote, updateNoteFolder } = useNotes();
  const { events, icsSource } = useCalendar();
  const [icsOpen, setIcsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const now = new Date();
  const upcomingEvents = events.filter(e => isAfter(e.start, now)).slice(0, 5);

  const activeFolderId = searchParams.get("folder");
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : null;

  // Group notes by date
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
                  {folderNotes.map((n) => (
                    <div key={n.id} className="group flex items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-card border border-transparent hover:border-border transition-colors">
                      <button
                        onClick={() => navigate(`/note/${n.id}`)}
                        className="flex flex-1 items-center gap-3 text-left min-w-0"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-display text-[15px] text-foreground truncate">{n.title}</h3>
                        </div>
                      </button>
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">{n.timeRange ?? n.time}</span>
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
            <AskBar context="home" noteContext={homeNoteContext} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0 relative">
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="mx-auto max-w-2xl px-6 py-8">
            {/* Coming up section */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-lg text-foreground">Coming up</h2>
                {notes.length > 0 && (
                  <button
                    onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
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
                    return (
                      <button
                        key={evt.id}
                        onClick={() => setSelectedEvent(evt)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors cursor-pointer"
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
                    <button onClick={() => setIcsOpen(true)} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      Re-sync calendar
                    </button>
                  </div>
                </div>
              ) : icsSource ? (
                <div className="w-full rounded-xl border border-border bg-card/50 px-5 py-6 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground mb-1">No upcoming events</p>
                  <p className="text-xs text-muted-foreground">Your calendar is connected but no future events found</p>
                </div>
              ) : (
                <div className="w-full rounded-xl border border-border bg-card/50 px-5 py-6 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground mb-1">Link your calendar</p>
                  <p className="text-xs text-muted-foreground mb-4">Import an .ics feed to see upcoming meetings</p>
                  <button onClick={() => setIcsOpen(true)} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors mx-auto">
                    <Link2 className="h-3.5 w-3.5" />
                    Import Calendar (.ics)
                  </button>
                </div>
              )}
            </div>

            {/* Notes list */}
            {notes.length === 0 ? (
              <div className="text-center py-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent mx-auto mb-4">
                  <Plus className="h-6 w-6" />
                </div>
                <h2 className="font-display text-lg text-foreground mb-2">No notes yet</h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Start a quick recording to capture your first meeting notes.
                </p>
                <button
                  onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
                  className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
                >
                  Quick Note
                </button>
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
                              <h3 className="font-display text-[15px] text-foreground truncate">{n.title}</h3>
                            </div>
                          </button>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0">{n.timeRange ?? n.time}</span>
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
          <AskBar context="home" noteContext={homeNoteContext} />
        </div>
      </main>
      <ICSDialog open={icsOpen} onOpenChange={setIcsOpen} />
      <EventDetailSheet event={selectedEvent} open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)} />
    </div>
  );
};

export default Index;
