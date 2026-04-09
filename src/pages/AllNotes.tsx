import { useState, useMemo, useCallback } from "react";
import { Plus, Search, FileText, ChevronDown, ChevronRight, Clock, ListChecks, ArrowUpDown, FolderOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotes } from "@/contexts/NotesContext";
import { useFolders } from "@/contexts/FolderContext";
import { cn } from "@/lib/utils";
import { NoteCardMenu } from "@/components/NoteCardMenu";

type SortOption = "newest" | "oldest" | "longest";
type FilterKey = "hasSummary" | "hasActions";

function formatDateHeader(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "TODAY";
  if (date.getTime() === yesterday.getTime()) return "YESTERDAY";

  const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}`;
}

function parseDurationMinutes(duration: string): number {
  if (!duration) return 0;
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  const m = duration.match(/(\d+)\s*min/i);
  if (m) return parseInt(m[1], 10);
  return 0;
}

function formatDuration(duration: string): string {
  const mins = Math.round(parseDurationMinutes(duration));
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r > 0 ? `${h}h ${r}m` : `${h}h`;
}

function hasOverdueActions(note: { summary: { actionItems?: { done: boolean; dueDate?: string }[] } | null }): boolean {
  if (!note.summary?.actionItems?.length) return false;
  const today = new Date().toISOString().slice(0, 10);
  return note.summary.actionItems.some((a) => !a.done && a.dueDate && a.dueDate < today);
}

export default function AllNotes() {
  const navigate = useNavigate();
  const { notes, deleteNote, updateNoteFolder, updateNote, summarizingNoteIds } = useNotes();
  const { folders, createFolder } = useFolders();
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [sort, setSort] = useState<SortOption>("newest");
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [showSort, setShowSort] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((date: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = notes;

    // Folder filter
    if (activeFolder) {
      result = result.filter((n) => n.folderId === activeFolder);
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.summary?.overview?.toLowerCase().includes(q)
      );
    }

    // Attribute filters
    if (activeFilters.has("hasSummary")) {
      result = result.filter((n) => n.summary !== null);
    }
    if (activeFilters.has("hasActions")) {
      result = result.filter((n) => (n.summary?.actionItems?.length ?? 0) > 0);
    }

    return result;
  }, [notes, search, activeFolder, activeFilters]);

  // Group by date then sort groups
  const grouped = useMemo(() => {
    const map = new Map<string, typeof notes>();
    for (const n of filtered) {
      const key = n.date || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }

    let entries = [...map.entries()];

    if (sort === "newest") {
      entries.sort(([a], [b]) => b.localeCompare(a));
    } else if (sort === "oldest") {
      entries.sort(([a], [b]) => a.localeCompare(b));
    } else if (sort === "longest") {
      // Sort notes within each group by duration, then groups by max duration
      for (const [, items] of entries) {
        items.sort((a, b) => parseDurationMinutes(b.duration) - parseDurationMinutes(a.duration));
      }
      entries.sort(([, a], [, b]) => {
        const maxA = Math.max(...a.map((n) => parseDurationMinutes(n.duration)));
        const maxB = Math.max(...b.map((n) => parseDurationMinutes(n.duration)));
        return maxB - maxA;
      });
    }

    return entries;
  }, [filtered, sort]);

  const totalFiltered = filtered.length;

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName("");
      setCreatingFolder(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4.5 w-4.5 text-muted-foreground" />
        <h1 className="font-display text-2xl text-foreground">All Notes</h1>
        <span className="text-xs text-muted-foreground ml-2">{totalFiltered}{totalFiltered !== notes.length ? ` / ${notes.length}` : ""}</span>
        <div className="flex-1" />
        <button
          onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" />
          New Note
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Every meeting and note you've recorded.</p>

      {/* Folder tabs */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setActiveFolder(null)}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
            activeFolder === null
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(activeFolder === f.id ? null : f.id)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
              activeFolder === f.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            <FolderOpen className="h-3 w-3" />
            {f.name}
          </button>
        ))}
        {creatingFolder ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
              }}
              placeholder="Folder name"
              className="w-24 bg-background text-[11px] text-foreground border border-border rounded-full px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
        ) : (
          <button
            onClick={() => setCreatingFolder(true)}
            className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Search + filters + sort */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <button
          onClick={() => toggleFilter("hasSummary")}
          className={cn(
            "shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors border",
            activeFilters.has("hasSummary")
              ? "bg-green-bg text-green-text border-transparent"
              : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground/30"
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          Summarized
        </button>
        <button
          onClick={() => toggleFilter("hasActions")}
          className={cn(
            "shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors border",
            activeFilters.has("hasActions")
              ? "bg-amber-bg text-amber-text border-transparent"
              : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground/30"
          )}
        >
          <ListChecks className="h-3 w-3" />
          Actions
        </button>
        <div className="relative">
          <button
            onClick={() => setShowSort(!showSort)}
            className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowUpDown className="h-3 w-3" />
          </button>
          {showSort && (
            <div className="absolute right-0 top-full mt-1 w-36 rounded-[10px] border border-border bg-popover shadow-lg z-50 overflow-hidden py-1">
              {([["newest", "Newest first"], ["oldest", "Oldest first"], ["longest", "Longest duration"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setSort(key); setShowSort(false); }}
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-[12px] transition-colors",
                    sort === key ? "text-primary font-medium bg-primary/5" : "text-foreground hover:bg-secondary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
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
          <p className="text-sm text-muted-foreground">
            {search ? `No notes match "${search}"` : "No notes match the current filters"}
          </p>
          {(activeFilters.size > 0 || activeFolder) && (
            <button
              onClick={() => { setActiveFilters(new Set()); setActiveFolder(null); setSearch(""); }}
              className="mt-3 text-xs text-primary hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => {
            const isCollapsed = collapsedDates.has(date);
            return (
              <div key={date}>
                <button
                  onClick={() => toggleCollapse(date)}
                  className="flex items-center gap-1.5 mb-2 group cursor-pointer"
                >
                  {isCollapsed
                    ? <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                    : <ChevronDown className="h-3 w-3 text-muted-foreground/50" />
                  }
                  <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                    {formatDateHeader(date)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40 ml-1">{items.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-2">
                    {items.map((n) => {
                      const isSummarizing = summarizingNoteIds.has(n.id);
                      const hasSummary = n.summary !== null;
                      const actionCount = n.summary?.actionItems?.length ?? 0;
                      const overdue = hasOverdueActions(n);
                      const folder = n.folderId ? folders.find((f) => f.id === n.folderId) : null;
                      const durationStr = n.duration ? formatDuration(n.duration) : null;

                      // Left accent color
                      const accentClass = overdue
                        ? "border-l-amber"
                        : hasSummary
                          ? "border-l-green"
                          : "border-l-primary/30";

                      return (
                        <div
                          key={n.id}
                          className={cn(
                            "group rounded-[10px] border border-border bg-card border-l-[3px] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
                            accentClass
                          )}
                        >
                          <div className="flex items-start gap-3 px-4 py-3">
                            <button
                              onClick={() => navigate(`/note/${n.id}`)}
                              className="flex-1 min-w-0 text-left"
                            >
                              <p className="text-[13.5px] font-medium text-foreground leading-snug">{n.title}</p>
                              {n.summary?.overview && (
                                <p className="text-[12px] text-muted-foreground/70 leading-snug mt-1 line-clamp-2">
                                  {n.summary.overview.slice(0, 200)}
                                </p>
                              )}
                              {/* Metadata pills */}
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                {durationStr && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    <Clock className="h-2.5 w-2.5" />
                                    {durationStr}
                                  </span>
                                )}
                                {actionCount > 0 && (
                                  <span className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                                    overdue ? "bg-amber-bg text-amber-text" : "bg-muted text-muted-foreground"
                                  )}>
                                    <ListChecks className="h-2.5 w-2.5" />
                                    {actionCount} item{actionCount !== 1 ? "s" : ""}
                                  </span>
                                )}
                                {folder && (
                                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", folder.color)}>
                                    <FolderOpen className="h-2.5 w-2.5" />
                                    {folder.name}
                                  </span>
                                )}
                                {isSummarizing && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-2 py-0.5 text-[10px] font-medium text-amber-text animate-pulse">
                                    Summarizing...
                                  </span>
                                )}
                                {hasSummary && !isSummarizing && (
                                  <span className="h-1.5 w-1.5 rounded-full bg-green shrink-0" title="Summary ready" />
                                )}
                              </div>
                            </button>
                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                              <span className="text-[10.5px] text-muted-foreground/50 tabular-nums whitespace-nowrap">
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
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
