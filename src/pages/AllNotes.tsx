import { useState, useMemo } from "react";
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar";
import { Plus, Search, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { useNotes } from "@/contexts/NotesContext";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron-api";
import { NoteCardMenu } from "@/components/NoteCardMenu";

export default function AllNotes() {
  const navigate = useNavigate();
  const { sidebarOpen } = useSidebarVisibility();
  const { notes, deleteNote, updateNoteFolder, updateNote } = useNotes();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.summary?.overview?.toLowerCase().includes(q)
    );
  }, [notes, search]);

  // Group by date (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const map = new Map<string, typeof notes>();
    for (const n of filtered) {
      const key = n.date || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    // Sort dates descending
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="w-48 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      )}
      <main className={cn("flex-1 overflow-y-auto", !sidebarOpen && isElectron && "pl-20")}>
        <div className={cn("flex items-center justify-between px-4 pb-0", isElectron ? "pt-10" : "pt-3")}>
          <SidebarCollapseButton />
        </div>
        <div className="mx-auto max-w-2xl px-6 py-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4.5 w-4.5 text-muted-foreground" />
            <h1 className="font-display text-2xl text-foreground">All Notes</h1>
            <span className="text-xs text-muted-foreground ml-2">{notes.length} notes</span>
            <div className="flex-1" />
            <button
              onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" />
              New Note
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-5">Every meeting and note you've recorded.</p>

          {/* Search */}
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {notes.length === 0 ? (
            <div className="py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent mx-auto mb-4">
                <Plus className="h-6 w-6" />
              </div>
              <p className="text-sm text-muted-foreground">No notes yet. Start a quick recording to get started.</p>
              <button
                onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
                className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition-all"
              >
                Start Recording
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No notes match "{search}"</p>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([date, items]) => (
                <div key={date}>
                  <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1.5">{date}</div>
                  <div className="rounded-[10px] border border-border bg-card divide-y divide-border">
                    {items.map((n) => (
                      <div key={n.id} className="group flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors">
                        <button
                          onClick={() => navigate(`/note/${n.id}`)}
                          className="flex flex-1 items-center gap-3 text-left min-w-0"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-medium text-foreground truncate leading-snug">{n.title}</p>
                            {n.summary?.overview && (
                              <p className="text-[12px] text-muted-foreground/70 truncate leading-snug mt-0.5">
                                {n.summary.overview.slice(0, 90)}
                              </p>
                            )}
                          </div>
                        </button>
                        <span className="text-[10.5px] text-muted-foreground/50 tabular-nums whitespace-nowrap shrink-0">
                          {n.timeRange ?? n.time}
                        </span>
                        <NoteCardMenu
                          noteId={n.id}
                          noteTitle={n.title}
                          currentFolderId={n.folderId}
                          onDelete={deleteNote}
                          onMoveToFolder={updateNoteFolder}
                          onRename={(id, newTitle) => updateNote(id, { title: newTitle })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
