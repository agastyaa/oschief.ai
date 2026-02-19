import { useState } from "react";
import { Search, Clock, Users } from "lucide-react";
import { meetings } from "@/data/meetings";
import { Sidebar } from "@/components/Sidebar";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type FilterTag = string | null;

export default function AllNotes() {
  const [search, setSearch] = useState("");
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

  // Group by date
  const grouped = filtered.reduce<Record<string, typeof meetings>>((acc, m) => {
    (acc[m.date] = acc[m.date] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8">
          <h1 className="font-display text-2xl text-foreground mb-1">All Notes</h1>
          <p className="text-xs text-muted-foreground mb-6">{meetings.length} notes</p>

          {/* Search + Tags */}
          <div className="mb-6 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes..."
                className="w-full rounded-md border border-border bg-card py-2 pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveTag(null)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  !activeTag ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    activeTag === tag ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Notes grouped by date */}
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="mb-5">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 mb-1">{date}</h3>
              <div className="space-y-0.5">
                {items.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/meeting/${m.id}`)}
                    className="flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-card border border-transparent hover:border-border"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-[15px] text-foreground truncate">{m.title}</h3>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{m.duration}</span>
                        <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" />{m.participants.length}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {m.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-sage-light px-2 py-0.5 text-[10px] font-medium text-accent">{tag}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-[13px] text-muted-foreground">No notes found</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
