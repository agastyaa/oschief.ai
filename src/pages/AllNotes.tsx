import { useState } from "react";
import { Search, Filter, Grid3X3, List, Clock, Users } from "lucide-react";
import { meetings } from "@/data/meetings";
import { Sidebar } from "@/components/Sidebar";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type ViewMode = "grid" | "list";
type FilterTag = string | null;

export default function AllNotes() {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeTag, setActiveTag] = useState<FilterTag>(null);
  const navigate = useNavigate();

  const allTags = [...new Set(meetings.flatMap((m) => m.tags))];

  const filtered = meetings.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.summary.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !activeTag || m.tags.includes(activeTag);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-10">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">All Notes</h1>
              <p className="mt-1 text-sm text-muted-foreground">{meetings.length} meetings recorded</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "rounded-lg border p-2 transition-colors",
                  viewMode === "grid" ? "border-primary/30 bg-card text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded-lg border p-2 transition-colors",
                  viewMode === "list" ? "border-primary/30 bg-card text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search meetings..."
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveTag(null)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    !activeTag ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      activeTag === tag ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => navigate(`/meeting/${m.id}`)}
                  className="animate-fade-in rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-primary/20 hover:shadow-sm"
                >
                  <span className="text-xs text-muted-foreground">{m.date} · {m.time}</span>
                  <h3 className="mt-2 font-display text-base font-semibold text-foreground leading-snug">{m.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground leading-relaxed">{m.summary}</p>
                  <div className="mt-4 flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{m.duration}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3 w-3" />{m.participants.length}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-sage-light px-2.5 py-0.5 text-[11px] font-medium text-accent">{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => navigate(`/meeting/${m.id}`)}
                  className="animate-fade-in flex w-full items-center gap-5 rounded-xl border border-border bg-card px-5 py-4 text-left transition-all hover:border-primary/20 hover:shadow-sm"
                >
                  <div className="flex-1">
                    <h3 className="font-display text-base font-semibold text-foreground">{m.title}</h3>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{m.summary}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">{m.date}</span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">{m.duration}</span>
                  <div className="flex flex-shrink-0 gap-1.5">
                    {m.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-sage-light px-2.5 py-0.5 text-[11px] font-medium text-accent">{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-muted-foreground">No meetings found</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
