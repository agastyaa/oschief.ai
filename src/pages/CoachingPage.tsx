import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar, SidebarCollapseButton, SidebarTopBarLeft } from "@/components/Sidebar";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { useNotes } from "@/contexts/NotesContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { cn } from "@/lib/utils";
import {
  Brain, Layers, Sparkles, ChevronDown, ChevronRight, Quote,
  TrendingUp, TrendingDown, Minus, Mic, Zap, MessageCircleWarning,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import type { CoachingMetrics, ConversationInsights } from "@/lib/coaching-analytics";

// ── Helpers ─────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800";
  if (score >= 60) return "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800";
  return "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800";
}

function trendIcon(current: number, previous: number) {
  const diff = current - previous;
  if (diff > 3) return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (diff < -3) return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

interface MeetingData {
  id: string;
  title: string;
  date: string;
  metrics: CoachingMetrics;
}

// ── Component ───────────────────────────────────────────────────────────

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
      .map(n => ({
        id: n.id,
        title: n.title || "Untitled Meeting",
        date: n.date,
        metrics: n.coachingMetrics!,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [notes]);

  const notesWithConversationInsights = useMemo(() => {
    return notes
      .filter((n) => n.coachingMetrics?.conversationInsights?.headline)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-12);
  }, [notes]);

  const latestInsights: (ConversationInsights & { meetingTitle: string; meetingDate: string; meetingId: string }) | null = useMemo(() => {
    if (notesWithConversationInsights.length === 0) return null;
    const latest = notesWithConversationInsights[notesWithConversationInsights.length - 1];
    const ci = latest.coachingMetrics!.conversationInsights!;
    return { ...ci, meetingTitle: latest.title || "Untitled", meetingDate: latest.date, meetingId: latest.id };
  }, [notesWithConversationInsights]);

  const habitTagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      for (const t of n.coachingMetrics?.conversationInsights?.habitTags ?? []) {
        m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [notes]);

  const [crossMeeting, setCrossMeeting] = useState<{
    summaryHeadline: string;
    themesParagraph: string;
    focusNext: string;
    recurringTags: string[];
  } | null>(null);
  const [crossLoading, setCrossLoading] = useState(false);
  const [crossError, setCrossError] = useState<string | null>(null);

  const runAggregateInsights = useCallback(async () => {
    if (!api?.coaching?.aggregateInsights || !accountRoleId || notesWithConversationInsights.length < 2) return;
    setCrossLoading(true);
    setCrossError(null);
    try {
      const payload = notesWithConversationInsights.map((n) => ({
        title: n.title || "Untitled",
        date: n.date,
        headline: n.coachingMetrics!.conversationInsights!.headline,
        narrative: n.coachingMetrics!.conversationInsights!.narrative,
        habitTags: n.coachingMetrics!.conversationInsights!.habitTags ?? [],
        overallScore: n.coachingMetrics!.overallScore,
      }));
      const r = await api.coaching.aggregateInsights(payload, accountRoleId);
      if (r) setCrossMeeting(r);
      else {
        setCrossMeeting(null);
        setCrossError("Couldn't generate cross-meeting insights. Check your AI model in Settings and try again.");
      }
    } catch {
      setCrossMeeting(null);
      setCrossError("Something went wrong. Try again in a moment.");
    } finally {
      setCrossLoading(false);
    }
  }, [api, accountRoleId, notesWithConversationInsights]);

  const [metricsExpanded, setMetricsExpanded] = useState(false);

  const autoTriggered = useRef(false);
  useEffect(() => {
    if (
      autoTriggered.current ||
      crossMeeting ||
      crossLoading ||
      !api?.coaching?.aggregateInsights ||
      !accountRoleId ||
      notesWithConversationInsights.length < 2
    ) return;
    autoTriggered.current = true;
    void runAggregateInsights();
  }, [notesWithConversationInsights.length, accountRoleId, api, crossMeeting, crossLoading, runAggregateInsights]);

  const chartData = useMemo(() =>
    meetings.map(m => ({
      name: m.date,
      overall: m.metrics.overallScore,
      pacing: m.metrics.pacingScore,
      conciseness: m.metrics.concisenessScore,
      listening: m.metrics.listeningScore,
      wpm: m.metrics.wordsPerMinute,
      fillers: m.metrics.fillerWordsPerMinute,
      talkRatio: Math.round(m.metrics.talkToListenRatio * 100),
    })),
    [meetings]
  );

  const avgScore = meetings.length > 0
    ? Math.round(meetings.reduce((s, m) => s + m.metrics.overallScore, 0) / meetings.length)
    : 0;
  const latestScore = meetings.length > 0 ? meetings[meetings.length - 1].metrics.overallScore : 0;
  const prevScore = meetings.length > 1 ? meetings[meetings.length - 2].metrics.overallScore : latestScore;

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const accentColor = isDark ? "hsl(24, 42%, 55%)" : "hsl(24, 45%, 42%)";
  const emeraldColor = isDark ? "hsl(155, 50%, 45%)" : "hsl(155, 60%, 35%)";
  const amberColor = isDark ? "hsl(38, 80%, 55%)" : "hsl(38, 90%, 45%)";

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen ? (
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      ) : (
        <SidebarCollapseButton />
      )}
      <main className="flex flex-1 flex-col min-w-0">
        <div className={cn(
          "flex items-center justify-between px-4 pt-3 pb-0",
          !sidebarOpen && isElectron && "pl-20"
        )}>
          <SidebarTopBarLeft />
          <div />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-8 py-6">
            {/* Page Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <Brain className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h1 className="font-display text-xl font-semibold text-foreground">Work Coach</h1>
                <p className="text-xs text-muted-foreground">
                  How you run meetings — substance, timing, and judgment grounded in best practices
                </p>
              </div>
            </div>

            {meetings.length === 0 ? (
              <div className="text-center py-20">
                <Brain className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                <h2 className="text-base font-medium text-foreground mb-1">No coaching data yet</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Record meetings and view their coaching insights to start building your trends.
                  Open any note and click the coaching tab to generate analysis.
                </p>
              </div>
            ) : (
              <div className="space-y-4">

                {/* ── Cross-meeting headline (top of page when available) ── */}
                {crossMeeting && (
                  <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-[10px] text-accent uppercase tracking-wider font-medium flex items-center gap-1.5">
                          <Layers className="h-3 w-3" />
                          Observed across {notesWithConversationInsights.length} calls
                        </p>
                        <h2 className="text-[18px] font-bold text-foreground leading-snug mt-1">{crossMeeting.summaryHeadline}</h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => void runAggregateInsights()}
                        disabled={crossLoading}
                        className="shrink-0 rounded-md border border-accent/40 bg-background px-2.5 py-1 text-[10px] font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
                      >
                        {crossLoading ? "…" : "Refresh"}
                      </button>
                    </div>
                    <p className="text-[13px] text-foreground leading-relaxed">{crossMeeting.themesParagraph}</p>
                    <div className="rounded-md bg-muted/50 px-3 py-2 mt-3">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Focus next</p>
                      <p className="text-[12px] text-foreground">{crossMeeting.focusNext}</p>
                    </div>
                    {crossMeeting.recurringTags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {crossMeeting.recurringTags.map((t) => (
                          <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                            {t.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Latest meeting behavioral insights ── */}
                {latestInsights ? (
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Latest meeting</p>
                        <h2 className="text-[18px] font-bold text-foreground leading-snug">{latestInsights.headline}</h2>
                        <p className="text-[11px] text-muted-foreground">
                          {latestInsights.meetingTitle} · {latestInsights.meetingDate}
                          {notesWithConversationInsights.length > 1 && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                              {notesWithConversationInsights.length} calls analyzed
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(`/note/${latestInsights.meetingId}`)}
                        className="shrink-0 text-[11px] font-medium text-primary hover:underline"
                      >
                        View meeting
                      </button>
                    </div>

                    {/* What we noticed */}
                    <div className="rounded-lg border border-border/60 bg-card/80 p-4">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 font-medium">What we noticed</p>
                      <p className="text-[13px] text-foreground leading-relaxed">{latestInsights.narrative}</p>
                    </div>

                    {/* Key moments */}
                    {latestInsights.keyMoments.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                          <Quote className="h-3 w-3" />
                          Key moments from this call
                        </p>
                        <div className="space-y-2">
                          {latestInsights.keyMoments.map((km, i) => (
                            <div key={i} className="rounded-md border border-border bg-background/80 p-3">
                              <p className="text-[12px] font-medium text-foreground">{km.title}</p>
                              <p className="text-[11px] text-muted-foreground mt-1 italic">"{km.quote}"</p>
                              <p className="text-[10px] text-muted-foreground mt-1">{km.speaker} · {km.time}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Micro-insights */}
                    {latestInsights.microInsights.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Actionable insights</p>
                        <ul className="space-y-2">
                          {latestInsights.microInsights.map((m, i) => (
                            <li key={i} className="text-[12px] text-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
                              <span>{m.text}</span>
                              {m.framework && (
                                <span className="block text-[10px] text-muted-foreground mt-0.5">Framework: {m.framework}</span>
                              )}
                              {m.evidenceQuote && (
                                <blockquote className="mt-1 text-[11px] text-muted-foreground italic border-l border-border pl-2">
                                  "{m.evidenceQuote}"
                                  {(m.speaker || m.time) && (
                                    <span className="not-italic text-[10px] block mt-0.5">
                                      {[m.speaker, m.time].filter(Boolean).join(" · ")}
                                    </span>
                                  )}
                                </blockquote>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Habit tags */}
                    {latestInsights.habitTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {latestInsights.habitTags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] text-secondary-foreground font-medium"
                          >
                            {t.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
                    <Brain className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[13px] font-medium text-foreground mb-1">No behavioral analysis yet</p>
                    <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                      Set your role in Settings and open any meeting's coaching tab to generate transcript-grounded analysis.
                    </p>
                  </div>
                )}

                {/* Cross-meeting loading/error indicator (data shown at top when ready) */}
                {!crossMeeting && notesWithConversationInsights.length >= 2 && accountRoleId && (
                  <div className="rounded-xl border border-accent/25 bg-accent/5 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xs font-medium text-accent uppercase tracking-wider flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5" />
                          Patterns across meetings
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {crossLoading ? "Synthesizing themes…" : `Analyze themes from ${notesWithConversationInsights.length} meetings.`}
                        </p>
                      </div>
                      {!crossLoading && (
                        <button
                          type="button"
                          onClick={() => void runAggregateInsights()}
                          className="shrink-0 rounded-md border border-accent/40 bg-background px-3 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/10"
                        >
                          Generate
                        </button>
                      )}
                    </div>
                    {crossError && (
                      <p className="text-[11px] text-destructive">{crossError}</p>
                    )}
                  </div>
                )}

                {/* ── Habit tags across all notes ── */}
                {habitTagCounts.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" />
                      Recurring habits
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {habitTagCounts.map(([tag, count]) => (
                        <span
                          key={tag}
                          className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground"
                        >
                          <span className="font-medium">{tag.replace(/_/g, " ")}</span>
                          <span className="text-muted-foreground ml-1">×{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Summary stats (compact) ── */}
                <div className="grid grid-cols-3 gap-3">
                  <div className={cn("rounded-xl border p-3", scoreBg(latestScore))}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Latest Score</span>
                      {meetings.length > 1 && trendIcon(latestScore, prevScore)}
                    </div>
                    <div className={cn("text-xl font-bold tabular-nums", scoreColor(latestScore))}>
                      {latestScore}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Average</span>
                    <div className={cn("text-xl font-bold tabular-nums mt-0.5", scoreColor(avgScore))}>
                      {avgScore}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Meetings</span>
                    <div className="text-xl font-bold tabular-nums text-foreground mt-0.5">{meetings.length}</div>
                  </div>
                </div>

                {/* ── Meeting history ── */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Meeting History</h3>
                  <div className="space-y-1">
                    {[...meetings].reverse().map(m => (
                      <button
                        key={m.id}
                        onClick={() => navigate(`/note/${m.id}`)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary/60"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-foreground truncate">{m.title}</div>
                          <div className="text-[10px] text-muted-foreground">{m.date}</div>
                          {m.metrics.conversationInsights?.headline && (
                            <div className="text-[11px] text-foreground/70 truncate mt-0.5">
                              {m.metrics.conversationInsights.headline}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className={cn("text-sm font-bold tabular-nums", scoreColor(m.metrics.overallScore))}>
                            {m.metrics.overallScore}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Speaking Metrics (collapsible) ── */}
                <div className="rounded-xl border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setMetricsExpanded(!metricsExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/30 transition-colors rounded-xl"
                  >
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Mic className="h-3 w-3" />
                      Speaking Metrics
                    </h3>
                    {metricsExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  {metricsExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* Overall Score Trend */}
                      <div className="rounded-lg border border-border bg-background p-4">
                        <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-4">Overall Score Trend</h4>
                        <div className="h-[180px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                              <defs>
                                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
                                  <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} />
                              <Tooltip contentStyle={tooltipStyle} />
                              <Area type="monotone" dataKey="overall" stroke={accentColor} strokeWidth={2} fill="url(#scoreGradient)" dot={{ fill: accentColor, r: 3 }} name="Overall" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Score Breakdown + WPM */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border bg-background p-4">
                          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-4">Score Breakdown</h4>
                          <div className="h-[160px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData}>
                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={24} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Line type="monotone" dataKey="pacing" stroke={accentColor} strokeWidth={1.5} dot={{ r: 2 }} name="Pacing" />
                                <Line type="monotone" dataKey="conciseness" stroke={emeraldColor} strokeWidth={1.5} dot={{ r: 2 }} name="Conciseness" />
                                <Line type="monotone" dataKey="listening" stroke={amberColor} strokeWidth={1.5} dot={{ r: 2 }} name="Listening" />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex justify-center gap-4 mt-2">
                            <LegendDot color={accentColor} label="Pacing" />
                            <LegendDot color={emeraldColor} label="Conciseness" />
                            <LegendDot color={amberColor} label="Listening" />
                          </div>
                        </div>

                        <div className="rounded-lg border border-border bg-background p-4">
                          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
                            <Zap className="h-3 w-3" /> Words Per Minute
                          </h4>
                          <div className="h-[160px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={chartData}>
                                <defs>
                                  <linearGradient id="wpmGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={emeraldColor} stopOpacity={0.15} />
                                    <stop offset="95%" stopColor={emeraldColor} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Area type="monotone" dataKey="wpm" stroke={emeraldColor} strokeWidth={2} fill="url(#wpmGradient)" dot={{ fill: emeraldColor, r: 2 }} name="WPM" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="text-[10px] text-muted-foreground/70 text-center mt-1">Ideal: 130-160 WPM</div>
                        </div>
                      </div>

                      {/* Talk Ratio + Fillers */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-border bg-background p-4">
                          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
                            <Mic className="h-3 w-3" /> Talk-to-Listen Ratio
                          </h4>
                          <div className="h-[140px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={chartData}>
                                <defs>
                                  <linearGradient id="talkGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={amberColor} stopOpacity={0.15} />
                                    <stop offset="95%" stopColor={amberColor} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={24} tickFormatter={(v) => `${v}%`} />
                                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Talk Ratio"]} />
                                <Area type="monotone" dataKey="talkRatio" stroke={amberColor} strokeWidth={2} fill="url(#talkGradient)" dot={{ fill: amberColor, r: 2 }} name="Talk %" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="text-[10px] text-muted-foreground/70 text-center mt-1">Ideal: 40-60% talk ratio</div>
                        </div>

                        <div className="rounded-lg border border-border bg-background p-4">
                          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
                            <MessageCircleWarning className="h-3 w-3" /> Fillers Per Minute
                          </h4>
                          <div className="h-[140px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={chartData}>
                                <defs>
                                  <linearGradient id="fillerGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(0, 60%, 50%)" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="hsl(0, 60%, 50%)" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={24} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Area type="monotone" dataKey="fillers" stroke="hsl(0, 60%, 50%)" strokeWidth={2} fill="url(#fillerGradient)" dot={{ fill: "hsl(0, 60%, 50%)", r: 2 }} name="Fillers/min" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="text-[10px] text-muted-foreground/70 text-center mt-1">Lower is better — aim for under 2/min</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}
