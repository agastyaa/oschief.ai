import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar, SidebarCollapseButton, SidebarCollapseRail, SidebarTopBarLeft } from "@/components/Sidebar";
import { SectionTabs, INTELLIGENCE_TABS } from "@/components/SectionTabs";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { cn } from "@/lib/utils";
import {
  BarChart3, Users, FolderKanban, Scale, CheckCircle2,
  AlertTriangle, ArrowRight, Clock,
} from "lucide-react";

type DigestData = {
  weekRange: { from: string; to: string };
  meetings: { id: string; title: string; date: string; time: string; duration: number }[];
  meetingCount: number;
  totalDurationMin: number;
  decisions: { id: string; text: string; noteTitle: string; noteId: string; date: string }[];
  commitments: {
    created: number;
    completed: number;
    overdue: number;
    overdueItems: { text: string; owner: string; due_date: string; assigneeName: string }[];
  };
  people: { id: string; name: string; company: string; role: string; meetingCount: number }[];
  projects: { id: string; name: string; weekMeetings: number }[];
  coachingScores: { date: string; score: number; headline: string | null }[];
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDateRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${f.toLocaleDateString(undefined, opts)} — ${t.toLocaleDateString(undefined, opts)}`;
}

export default function WeeklyDigestPage() {
  const navigate = useNavigate();
  const { sidebarOpen } = useSidebarVisibility();
  const api = getElectronAPI();

  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api?.digest?.getWeekly?.()
      .then((d: any) => setData(d))
      .finally(() => setLoading(false));
  }, [api]);

  const avgCoachingScore = useMemo(() => {
    if (!data?.coachingScores?.length) return null;
    return Math.round(data.coachingScores.reduce((s, c) => s + c.score, 0) / data.coachingScores.length);
  }, [data]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen ? (
        <div className="w-48 flex-shrink-0 overflow-hidden"><Sidebar /></div>
      ) : (
        <SidebarCollapseRail><SidebarCollapseButton /></SidebarCollapseRail>
      )}
      <main className="flex flex-1 flex-col min-w-0">
        <div className={cn("flex items-center justify-between px-4 pb-0", isElectron ? "pt-10" : "pt-3", !sidebarOpen && isElectron && "pl-20")}>
          <SidebarTopBarLeft />
          <div />
        </div>
        <div className="px-6 pt-2">
          <SectionTabs tabs={INTELLIGENCE_TABS} />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-6">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <BarChart3 className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h1 className="font-display text-xl font-semibold text-foreground">Weekly Digest</h1>
                {data && (
                  <p className="text-xs text-muted-foreground">{formatDateRange(data.weekRange.from, data.weekRange.to)}</p>
                )}
              </div>
            </div>

            {loading && (
              <div className="py-16 text-center">
                <div className="inline-block h-5 w-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                <p className="text-sm text-muted-foreground mt-3">Loading digest...</p>
              </div>
            )}

            {!loading && data && (
              <>
                {/* Week at a Glance */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  <StatCard label="Meetings" value={data.meetingCount} icon={<BarChart3 className="h-3.5 w-3.5" />} />
                  <StatCard label="Duration" value={formatDuration(data.totalDurationMin)} icon={<Clock className="h-3.5 w-3.5" />} />
                  <StatCard label="Decisions" value={data.decisions.length} icon={<Scale className="h-3.5 w-3.5" />} />
                  <StatCard
                    label="Commitments"
                    value={`${data.commitments.completed}/${data.commitments.created}`}
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    subtitle={data.commitments.overdue > 0 ? `${data.commitments.overdue} overdue` : undefined}
                    subtitleColor={data.commitments.overdue > 0 ? "text-amber-600" : undefined}
                  />
                </div>

                {/* Coaching Score */}
                {avgCoachingScore != null && (
                  <div className="mb-6 rounded-lg border-l-3 border-accent/40 bg-card border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Coaching Score</p>
                        <p className="text-2xl font-bold tabular-nums text-foreground">{avgCoachingScore}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-muted-foreground">across {data.coachingScores.length} meetings</p>
                        {data.coachingScores[data.coachingScores.length - 1]?.headline && (
                          <p className="text-[12px] text-foreground/70 mt-0.5 italic max-w-[280px] text-right">
                            "{data.coachingScores[data.coachingScores.length - 1].headline}"
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Key Decisions */}
                {data.decisions.length > 0 && (
                  <DigestSection title="Key Decisions" icon={<Scale className="h-3 w-3" />}>
                    <div className="space-y-2">
                      {data.decisions.slice(0, 8).map((d) => (
                        <div key={d.id} className="border-l-2 border-accent/30 pl-3">
                          <p className="text-[13px] text-foreground leading-snug">{d.text}</p>
                          <button
                            onClick={() => navigate(`/note/${d.noteId}`)}
                            className="text-[10px] text-muted-foreground hover:text-primary mt-0.5"
                          >
                            {d.noteTitle || d.date} →
                          </button>
                        </div>
                      ))}
                    </div>
                  </DigestSection>
                )}

                {/* Overdue Items */}
                {data.commitments.overdue > 0 && (
                  <DigestSection title={`Overdue (${data.commitments.overdue})`} icon={<AlertTriangle className="h-3 w-3 text-amber-600" />}>
                    <div className="space-y-1.5">
                      {data.commitments.overdueItems.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-[13px]">
                          <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-foreground">{c.text}</span>
                            <span className="text-muted-foreground ml-1.5">
                              — {c.owner === "you" ? "You" : (c.assigneeName || c.owner)} · due {c.due_date}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </DigestSection>
                )}

                {/* People You Met */}
                {data.people.length > 0 && (
                  <DigestSection title="People You Met" icon={<Users className="h-3 w-3" />}>
                    <div className="flex flex-wrap gap-2">
                      {data.people.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => navigate(`/people`)}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12px] hover:bg-secondary/50 transition-colors"
                        >
                          <span className="font-medium text-foreground">{p.name}</span>
                          <span className="text-muted-foreground">({p.meetingCount})</span>
                        </button>
                      ))}
                    </div>
                  </DigestSection>
                )}

                {/* Active Projects */}
                {data.projects.length > 0 && (
                  <DigestSection title="Active Projects" icon={<FolderKanban className="h-3 w-3" />}>
                    <div className="space-y-1.5">
                      {data.projects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => navigate(`/project/${p.id}`)}
                          className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-secondary/50 transition-colors"
                        >
                          <span className="text-[13px] font-medium text-foreground">{p.name}</span>
                          <span className="text-[11px] text-muted-foreground">{p.weekMeetings} meeting{p.weekMeetings !== 1 ? "s" : ""}</span>
                        </button>
                      ))}
                    </div>
                  </DigestSection>
                )}

                {/* Meetings List */}
                {data.meetings.length > 0 && (
                  <DigestSection title="Meetings" icon={<BarChart3 className="h-3 w-3" />}>
                    <div className="rounded-[10px] border border-border bg-card overflow-hidden divide-y divide-border">
                      {data.meetings.slice(0, 10).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => navigate(`/note/${m.id}`)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-foreground truncate block">{m.title || "Untitled"}</span>
                            <span className="text-[10px] text-muted-foreground">{m.date}{m.duration ? ` · ${formatDuration(m.duration)}` : ""}</span>
                          </div>
                          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        </button>
                      ))}
                    </div>
                  </DigestSection>
                )}

                {/* Empty state */}
                {data.meetingCount === 0 && data.decisions.length === 0 && (
                  <div className="py-16 text-center">
                    <BarChart3 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-base font-medium text-foreground mb-1">No activity this week yet.</p>
                    <p className="text-sm text-muted-foreground">Record meetings and the digest will populate automatically.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label, value, icon, subtitle, subtitleColor,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  subtitleColor?: string;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      {subtitle && (
        <p className={cn("text-[10px] mt-0.5", subtitleColor || "text-muted-foreground")}>{subtitle}</p>
      )}
    </div>
  );
}

function DigestSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-muted-foreground">{icon}</span>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{title}</p>
      </div>
      {children}
    </div>
  );
}
