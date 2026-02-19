import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { MeetingCard } from "@/components/MeetingCard";
import { MeetingDetail } from "@/components/MeetingDetail";
import { meetings } from "@/data/meetings";
import { Sparkles, ListTodo, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMeeting = selectedId ? meetings.find((m) => m.id === selectedId) : null;
  const navigate = useNavigate();

  // Group meetings by date
  const grouped = meetings.reduce<Record<string, typeof meetings>>((acc, m) => {
    (acc[m.date] = acc[m.date] || []).push(m);
    return acc;
  }, {});

  // Upcoming meetings (first 3)
  const upcoming = meetings.slice(0, 3);

  if (selectedMeeting) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-8">
            <button
              onClick={() => setSelectedId(null)}
              className="mb-5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back to notes
            </button>
            <MeetingDetail meeting={selectedMeeting} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-8">
            {/* Coming up */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Coming up</h2>
                <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  View calendar →
                </button>
              </div>
              <div className="space-y-1">
                {upcoming.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className="flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-card border border-transparent hover:border-border"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent flex-shrink-0">
                      <span className="text-xs font-semibold">{m.time.split(":")[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-[15px] text-foreground truncate">{m.title}</h3>
                      <span className="text-[11px] text-muted-foreground">{m.time} · {m.duration}</span>
                    </div>
                    <div className="flex -space-x-1.5">
                      {m.participants.slice(0, 3).map((p, i) => (
                        <div
                          key={i}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[9px] font-medium text-foreground ring-2 ring-background"
                        >
                          {p.charAt(0)}
                        </div>
                      ))}
                      {m.participants.length > 3 && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground ring-2 ring-background">
                          +{m.participants.length - 3}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes grouped by date */}
            <div>
              {Object.entries(grouped).map(([date, items]) => (
                <div key={date} className="mb-6">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 mb-1">
                    {date}
                  </h3>
                  <div className="space-y-0.5">
                    {items.map((m) => (
                      <MeetingCard
                        key={m.id}
                        meeting={m}
                        selected={false}
                        onClick={() => setSelectedId(m.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Ask bar */}
        <div className="border-t border-border px-6 py-2.5">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <button
              onClick={() => navigate("/ask")}
              className="flex flex-1 items-center gap-2 rounded-md bg-card border border-border px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:border-ring/30"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Ask anything
            </button>
            <button className="flex items-center gap-1.5 rounded-md bg-card border border-border px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:border-ring/30">
              <ListTodo className="h-3.5 w-3.5" />
              List recent todos
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
