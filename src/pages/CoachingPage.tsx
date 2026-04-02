import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar, SidebarCollapseButton, SidebarCollapseRail, SidebarTopBarLeft } from "@/components/Sidebar";
import { SectionTabs, INTELLIGENCE_TABS } from "@/components/SectionTabs";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { useNotes } from "@/contexts/NotesContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { cn } from "@/lib/utils";
import {
  Brain, TrendingUp, TrendingDown, Minus, ArrowRight, RefreshCw,
} from "lucide-react";
import type { CoachingMetrics, ConversationInsights } from "@/lib/coaching-analytics";

// ── Helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function trendIcon(current: number, previous: number) {
  const diff = current - previous;
  if (diff > 3) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
  if (diff < -3) return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatTag(tag: string): string {
  return tag.replace(/_/g, " ");
}

// Negative patterns get amber, positive get green
const NEGATIVE_TAGS = new Set(["filler_heavy", "monologue_dominant", "low_questions", "interrupts_often", "too_fast", "too_slow", "vague_commitments", "no_next_steps"]);

function tagColor(tag: string): string {
  return NEGATIVE_TAGS.has(tag)
    ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-700"
    : "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-700";
}

interface MeetingData {
  id: string;
  title: string;
  date: string;
  metrics: CoachingMetrics;
}

// ── Main Component ──────────────────────────────────────────────────────

export default function CoachingPage() {
  const navigate = useNavigate();
  const { sidebarOpen } = useSidebarVisibility();
  const { notes } = useNotes();
  const api = getElectronAPI();

  const accountRoleId = useMemo(() => {
    try {
      const raw = localStorage.getItem("syag-account");
      if (raw) return JSON.parse(raw)?.roleId as string | undefined;
    } catch { /* ignore */ }
    return undefined;
  }, []);

  const meetings: MeetingData[] = useMemo(() => {
    return notes
      .filter(n => n.coachingMetrics && n.coachingMetrics.overallScore > 0)
      .map(n => ({ id: n.id, title: n.title || "Untitled Meeting", date: n.date, metrics: n.coachingMetrics! }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [notes]);

  const notesWithInsights = useMemo(() => {
    return notes
      .filter((n) => n.coachingMetrics?.conversationInsights?.headline)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-12);
  }, [notes]);

  const latestInsights = useMemo(() => {
    if (notesWithInsights.length === 0) return null;
    const latest = notesWithInsights[notesWithInsights.length - 1];
    const ci = latest.coachingMetrics!.conversationInsights!;
    return { ...ci, meetingTitle: latest.title || "Untitled", meetingDate: latest.date, meetingId: latest.id };
  }, [notesWithInsights]);

  const habitTagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      for (const t of n.coachingMetrics?.conversationInsights?.habitTags ?? []) {
        m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [notes]);

  // Cross-meeting aggregation
  const [crossMeeting, setCrossMeeting] = useState<{
    summaryHeadline: string; themesParagraph: string; focusNext: string; recurringTags: string[];
  } | null>(null);
  const [crossLoading, setCrossLoading] = useState(false);

  const runAggregateInsights = useCallback(async () => {
    if (!api?.coaching?.aggregateInsights || !accountRoleId || notesWithInsights.length < 2) return;
    setCrossLoading(true);
    try {
      const payload = notesWithInsights.map((n) => ({
        title: n.title || "Untitled", date: n.date,
        headline: n.coachingMetrics!.conversationInsights!.headline,
        narrative: n.coachingMetrics!.conversationInsights!.narrative,
        habitTags: n.coachingMetrics!.conversationInsights!.habitTags ?? [],
        overallScore: n.coachingMetrics!.overallScore,
      }));
      const r = await api.coaching.aggregateInsights(payload, accountRoleId);
      if (r) setCrossMeeting(r);
    } catch { /* silent */ }
    setCrossLoading(false);
  }, [api, accountRoleId, notesWithInsights]);

  const autoTriggered = useRef(false);
  useEffect(() => {
    if (autoTriggered.current || crossMeeting || crossLoading || !accountRoleId || notesWithInsights.length < 2) return;
    autoTriggered.current = true;
    void runAggregateInsights();
  }, [notesWithInsights.length, accountRoleId, crossMeeting, crossLoading, runAggregateInsights]);

  // Metrics data
  const latestScore = meetings.length > 0 ? meetings[meetings.length - 1].metrics.overallScore : 0;
  const prevScore = meetings.length > 1 ? meetings[meetings.length - 2].metrics.overallScore : latestScore;
  const firstScore = meetings.length > 0 ? meetings[0].metrics.overallScore : 0;
  const avgScore = meetings.length > 0 ? Math.round(meetings.reduce((s, m) => s + m.metrics.overallScore, 0) / meetings.length) : 0;

  // Batch coaching state
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; noteTitle?: string } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  useEffect(() => {
    if (!api?.coaching?.onAnalyzeProgress) return;
    return api.coaching.onAnalyzeProgress((data) => setBatchProgress(data));
  }, [api]);

  const runBatchCoaching = useCallback(async () => {
    if (!api || batchRunning) return;
    setBatchRunning(true);
    setBatchProgress({ current: 0, total: 0 });
    try {
      await (api as any).coaching?.analyzeAll?.();
    } catch { /* silent */ }
    setBatchRunning(false);
    setBatchProgress(null);
    // Refresh notes to show new coaching data
    window.location.reload();
  }, [api, batchRunning]);

  // ── Build the coach message ───────────────────────────────────────────

  function buildCoachMessage(): { headline: string; body: string; type: "cross" | "latest" | "metrics" | "empty" } {
    if (crossMeeting) {
      return { headline: crossMeeting.summaryHeadline, body: crossMeeting.themesParagraph, type: "cross" };
    }
    if (latestInsights) {
      return { headline: latestInsights.headline, body: latestInsights.narrative, type: "latest" };
    }
    if (meetings.length > 0 && latestScore >= 85) {
      return {
        headline: "Strong meeting performance",
        body: `Your last meeting scored ${latestScore}/100. You were prepared, asked the right questions, and drove clear outcomes. Keep this energy — consistency is what separates good from great.`,
        type: "metrics",
      };
    }
    if (meetings.length > 0) {
      return {
        headline: "Generate your first coaching analysis",
        body: "Open any meeting below and click the Coaching tab. I\u2019ll analyze what you said, what you committed to, and how it aligns with your role — not just how fast you talked.",
        type: "metrics",
      };
    }
    return { headline: "", body: "", type: "empty" };
  }

  // Get the best micro-insights (specific "you said X" feedback) from recent meetings
  const topMicroInsights = useMemo(() => {
    const all: Array<{ text: string; framework?: string; evidenceQuote?: string; meetingTitle: string; meetingId: string }> = [];
    for (const n of [...notesWithInsights].reverse().slice(0, 5)) {
      const ci = n.coachingMetrics?.conversationInsights;
      if (!ci?.microInsights) continue;
      for (const mi of ci.microInsights.slice(0, 2)) {
        all.push({ ...mi, meetingTitle: n.title || "Untitled", meetingId: n.id });
      }
    }
    return all.slice(0, 3);
  }, [notesWithInsights]);

  const coachMsg = buildCoachMessage();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen ? (
        <div className="flex-shrink-0 overflow-hidden"><Sidebar /></div>
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

            {/* ── Header ── */}
            <div className="flex items-center gap-3 mb-8">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <Brain className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h1 className="font-display text-xl font-semibold text-foreground">Work Coach</h1>
                <p className="text-xs text-muted-foreground">How you run meetings — substance, timing, and judgment</p>
              </div>
            </div>

            {/* ── Empty state: no meetings ── */}
            {meetings.length === 0 && (
              <div className="py-16 text-center">
                <Brain className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-base font-medium text-foreground mb-1">Record your first meeting and I'll start coaching you.</p>
                <p className="text-sm text-muted-foreground mb-4">I analyze your speaking patterns, meeting dynamics, and role-specific best practices.</p>
                <button onClick={() => navigate("/new-note?startFresh=1")} className="text-sm font-medium text-primary hover:underline">
                  Quick Note →
                </button>
              </div>
            )}

            {/* ── Empty state: meetings but no role ── */}
            {meetings.length > 0 && !accountRoleId && (
              <div className="rounded-[10px] border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-4 mb-6">
                <p className="text-sm text-foreground">Set your role in Settings so I can give you role-specific coaching.</p>
                <button onClick={() => navigate("/settings?section=account")} className="text-xs font-medium text-primary hover:underline mt-1">
                  Go to Settings →
                </button>
              </div>
            )}

            {/* ── Coach Message (hero) ── */}
            {coachMsg.type !== "empty" && (
              <div className="mb-8">
                <p className="text-lg font-semibold text-foreground leading-snug mb-2">{coachMsg.headline}</p>
                <p className="text-[13.5px] text-foreground/80 leading-relaxed">{coachMsg.body}</p>
                {crossMeeting?.focusNext && (
                  <div className="mt-4 border-l-3 border-primary/40 pl-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Focus next</p>
                    <p className="text-[13px] text-foreground">{crossMeeting.focusNext}</p>
                  </div>
                )}
                {coachMsg.type === "cross" && (
                  <button
                    onClick={() => void runAggregateInsights()}
                    disabled={crossLoading}
                    className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className={cn("h-3 w-3", crossLoading && "animate-spin")} />
                    {crossLoading ? "Refreshing..." : "Refresh coaching"}
                  </button>
                )}
              </div>
            )}

            {/* ── No insights yet (but has meetings + role) ── */}
            {meetings.length > 0 && accountRoleId && !latestInsights && coachMsg.type === "metrics" && (
              <div className="mb-6">
                <p className="text-xs text-muted-foreground mb-2">Open any meeting's Coaching tab to generate deeper analysis:</p>
                <div className="space-y-1">
                  {[...meetings].reverse().slice(0, 3).map(m => (
                    <button key={m.id} onClick={() => navigate(`/note/${m.id}`)}
                      className="flex items-center gap-2 text-xs text-primary hover:underline">
                      <ArrowRight className="h-3 w-3" /> {m.title} ({m.date})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Substance: What you said vs what you should have (micro-insights) ── */}
            {topMicroInsights.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">WHAT I NOTICED</p>
                <div className="space-y-3">
                  {topMicroInsights.map((mi, i) => (
                    <div key={i} className="border-l-2 border-primary/30 pl-3.5">
                      <p className="text-[13px] text-foreground leading-relaxed">{mi.text}</p>
                      {mi.evidenceQuote && (
                        <blockquote className="mt-1.5 text-[11px] text-muted-foreground italic pl-2 border-l border-border">
                          "{mi.evidenceQuote}"
                        </blockquote>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {mi.framework && (
                          <span className="text-[10px] text-primary/70">{mi.framework}</span>
                        )}
                        <button
                          onClick={() => navigate(`/note/${mi.meetingId}`)}
                          className="text-[10px] text-muted-foreground hover:text-primary"
                        >
                          {mi.meetingTitle} →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Key Moments (specific transcript moments worth reflecting on) ── */}
            {latestInsights?.keyMoments && latestInsights.keyMoments.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">KEY MOMENTS FROM YOUR LAST CALL</p>
                <div className="space-y-2">
                  {latestInsights.keyMoments.slice(0, 3).map((km, i) => (
                    <div key={i} className="rounded-md border border-border bg-card p-3">
                      <p className="text-[12px] font-medium text-foreground">{km.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 italic">"{km.quote}"</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{km.speaker} · {km.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Your Patterns (habit tags) ── */}
            {habitTagCounts.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">YOUR PATTERNS</p>
                <div className="flex flex-wrap gap-2">
                  {habitTagCounts.map(([tag, count]) => (
                    <span key={tag} className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", tagColor(tag))}>
                      {formatTag(tag)} <span className="opacity-60">({count}/{notesWithInsights.length})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Recent Coaching (meeting by meeting) ── */}
            {meetings.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">RECENT COACHING</p>
                <div className="rounded-[10px] border border-border bg-card overflow-hidden divide-y divide-border">
                  {[...meetings].reverse().slice(0, 5).map(m => (
                    <button
                      key={m.id}
                      onClick={() => navigate(`/note/${m.id}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground truncate">{m.title}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{m.date}</span>
                        </div>
                        {m.metrics.conversationInsights?.headline ? (
                          <p className="text-[11px] text-foreground/70 truncate mt-0.5">
                            {m.metrics.conversationInsights.headline}
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground italic mt-0.5">
                            Click to generate coaching analysis
                          </p>
                        )}
                      </div>
                      {m.metrics.conversationInsights ? (
                        <span className={cn("text-sm font-bold tabular-nums shrink-0", scoreColor(m.metrics.overallScore))}>
                          {m.metrics.overallScore}
                        </span>
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Trend (compact one-liner) ── */}
            {meetings.length >= 2 && (
              <div className="flex items-center gap-3 mb-6 text-sm text-muted-foreground">
                <span>Score:</span>
                <span className={cn("font-bold tabular-nums", scoreColor(firstScore))}>{firstScore}</span>
                <span>→</span>
                <span className={cn("font-bold tabular-nums", scoreColor(latestScore))}>{latestScore}</span>
                <span className="text-xs">over {meetings.length} meetings</span>
                {trendIcon(latestScore, prevScore)}
                <span className="text-xs">(avg {avgScore})</span>
              </div>
            )}

            {/* ── Analyze All Meetings ── */}
            {meetings.length > 0 && (
              <div className="mb-6">
                <button
                  onClick={() => void runBatchCoaching()}
                  disabled={batchRunning}
                  className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", batchRunning && "animate-spin")} />
                  {batchRunning
                    ? `Analyzing ${batchProgress?.current ?? 0}/${batchProgress?.total ?? '...'} — ${batchProgress?.noteTitle ?? ''}`
                    : "Reanalyze all meetings"}
                </button>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
