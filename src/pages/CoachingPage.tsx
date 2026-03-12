import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar, SidebarCollapseButton, SidebarTopBarLeft } from "@/components/Sidebar";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { useNotes } from "@/contexts/NotesContext";
import { isElectron } from "@/lib/electron-api";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp, TrendingDown, Minus, Mic, Zap, MessageCircleWarning } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import type { CoachingMetrics } from "@/lib/coaching-analytics";

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

  // Aggregate stats
  const avgScore = meetings.length > 0
    ? Math.round(meetings.reduce((s, m) => s + m.metrics.overallScore, 0) / meetings.length)
    : 0;

  const latestScore = meetings.length > 0 ? meetings[meetings.length - 1].metrics.overallScore : 0;
  const prevScore = meetings.length > 1 ? meetings[meetings.length - 2].metrics.overallScore : latestScore;

  const bestMeeting = meetings.length > 0
    ? meetings.reduce((best, m) => m.metrics.overallScore > best.metrics.overallScore ? m : best)
    : null;

  const worstMeeting = meetings.length > 0
    ? meetings.reduce((worst, m) => m.metrics.overallScore < worst.metrics.overallScore ? m : worst)
    : null;

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
                <BarChart3 className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h1 className="font-display text-xl font-semibold text-foreground">Speech Coaching</h1>
                <p className="text-xs text-muted-foreground">Track your communication skills over time</p>
              </div>
            </div>

            {meetings.length === 0 ? (
              <div className="text-center py-20">
                <BarChart3 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                <h2 className="text-base font-medium text-foreground mb-1">No coaching data yet</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Record meetings and view their coaching insights to start building your trends.
                  Open any note and click the coaching tab to generate metrics.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-4 gap-3">
                  <div className={cn("rounded-xl border p-4", scoreBg(latestScore))}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Latest Score</span>
                      {meetings.length > 1 && trendIcon(latestScore, prevScore)}
                    </div>
                    <div className={cn("text-2xl font-bold tabular-nums", scoreColor(latestScore))}>
                      {latestScore}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Average Score</span>
                    <div className={cn("text-2xl font-bold tabular-nums mt-1", scoreColor(avgScore))}>
                      {avgScore}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Meetings Analyzed</span>
                    <div className="text-2xl font-bold tabular-nums text-foreground mt-1">{meetings.length}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Best Score</span>
                    <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                      {bestMeeting?.metrics.overallScore ?? 0}
                    </div>
                  </div>
                </div>

                {/* Overall Score Trend */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Overall Score Trend</h3>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                          width={30}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Area
                          type="monotone"
                          dataKey="overall"
                          stroke={accentColor}
                          strokeWidth={2}
                          fill="url(#scoreGradient)"
                          dot={{ fill: accentColor, r: 3 }}
                          name="Overall"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Detailed Score Breakdown Trend */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Sub-score Trends */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Score Breakdown</h3>
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            width={24}
                          />
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

                  {/* WPM Trend */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <Zap className="h-3 w-3" /> Words Per Minute
                    </h3>
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="wpmGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={emeraldColor} stopOpacity={0.15} />
                              <stop offset="95%" stopColor={emeraldColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            width={30}
                          />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Area
                            type="monotone"
                            dataKey="wpm"
                            stroke={emeraldColor}
                            strokeWidth={2}
                            fill="url(#wpmGradient)"
                            dot={{ fill: emeraldColor, r: 2 }}
                            name="WPM"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 text-center mt-1">
                      Ideal: 130-160 WPM
                    </div>
                  </div>
                </div>

                {/* Talk Ratio + Fillers */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Talk Ratio Trend */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <Mic className="h-3 w-3" /> Talk-to-Listen Ratio
                    </h3>
                    <div className="h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="talkGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={amberColor} stopOpacity={0.15} />
                              <stop offset="95%" stopColor={amberColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            width={24}
                            tickFormatter={(v) => `${v}%`}
                          />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Talk Ratio"]} />
                          <Area
                            type="monotone"
                            dataKey="talkRatio"
                            stroke={amberColor}
                            strokeWidth={2}
                            fill="url(#talkGradient)"
                            dot={{ fill: amberColor, r: 2 }}
                            name="Talk %"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 text-center mt-1">
                      Ideal: 40-60% talk ratio
                    </div>
                  </div>

                  {/* Filler Words Trend */}
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <MessageCircleWarning className="h-3 w-3" /> Fillers Per Minute
                    </h3>
                    <div className="h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="fillerGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(0, 60%, 50%)" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="hsl(0, 60%, 50%)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            width={24}
                          />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Area
                            type="monotone"
                            dataKey="fillers"
                            stroke="hsl(0, 60%, 50%)"
                            strokeWidth={2}
                            fill="url(#fillerGradient)"
                            dot={{ fill: "hsl(0, 60%, 50%)", r: 2 }}
                            name="Fillers/min"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 text-center mt-1">
                      Lower is better — aim for under 2/min
                    </div>
                  </div>
                </div>

                {/* Meeting History */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Meeting History</h3>
                  <div className="space-y-1">
                    {[...meetings].reverse().map(m => (
                      <button
                        key={m.id}
                        onClick={() => navigate(`/note/${m.id}`)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary/60"
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-foreground truncate">{m.title}</div>
                          <div className="text-[10px] text-muted-foreground">{m.date}</div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            {m.metrics.wordsPerMinute} WPM
                          </div>
                          <div className={cn("text-sm font-bold tabular-nums", scoreColor(m.metrics.overallScore))}>
                            {m.metrics.overallScore}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Highlights */}
                {bestMeeting && worstMeeting && bestMeeting.id !== worstMeeting.id && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                      <h4 className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-medium mb-2">Best Meeting</h4>
                      <button
                        onClick={() => navigate(`/note/${bestMeeting.id}`)}
                        className="text-left hover:underline"
                      >
                        <div className="text-[13px] font-medium text-foreground">{bestMeeting.title}</div>
                        <div className="text-[10px] text-muted-foreground">{bestMeeting.date}</div>
                      </button>
                      <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                        {bestMeeting.metrics.overallScore}
                      </div>
                    </div>
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
                      <h4 className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-medium mb-2">Needs Improvement</h4>
                      <button
                        onClick={() => navigate(`/note/${worstMeeting.id}`)}
                        className="text-left hover:underline"
                      >
                        <div className="text-[13px] font-medium text-foreground">{worstMeeting.title}</div>
                        <div className="text-[10px] text-muted-foreground">{worstMeeting.date}</div>
                      </button>
                      <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                        {worstMeeting.metrics.overallScore}
                      </div>
                    </div>
                  </div>
                )}
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
