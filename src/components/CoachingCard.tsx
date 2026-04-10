import { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
} from "recharts";
import { Mic, Timer, MessageCircleWarning, Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CoachingMetrics } from "@/lib/coaching-analytics";

interface CoachingCardProps {
  metrics: CoachingMetrics;
  meetingDurationSec: number;
}

// ── Score badge colors ─────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "text-green";
  if (score >= 60) return "text-amber";
  return "text-destructive";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-green-bg border-green/20";
  if (score >= 60) return "bg-amber-bg border-amber/20";
  return "bg-destructive/10 border-destructive/20";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Great";
  if (score >= 70) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Needs Work";
  return "Poor";
}

function scoreIcon(score: number) {
  if (score >= 70) return <TrendingUp className="h-3.5 w-3.5" />;
  if (score >= 50) return <Minus className="h-3.5 w-3.5" />;
  return <TrendingDown className="h-3.5 w-3.5" />;
}

// ── Format helpers ─────────────────────────────────────────────────────

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// ── PIE CHART COLORS ───────────────────────────────────────────────────

const PIE_COLORS = [
  "hsl(229, 51%, 37%)",    // primary — You
  "hsl(226, 10%, 73%)",    // muted — Others
  "hsl(228, 11%, 89%)",    // border — Silence
];

const PIE_COLORS_DARK = [
  "hsl(229, 45%, 62%)",    // primary dark — You
  "hsl(228, 8%, 45%)",     // muted dark — Others
  "hsl(225, 12%, 19%)",    // border dark — Silence
];

// ── Component ──────────────────────────────────────────────────────────

export function CoachingCard({ metrics, meetingDurationSec }: CoachingCardProps) {
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  const pieData = useMemo(() => [
    { name: "You", value: metrics.yourSpeakingTimeSec },
    { name: "Others", value: metrics.othersSpeakingTimeSec },
    { name: "Silence", value: metrics.silenceTimeSec },
  ], [metrics]);

  const fillerData = useMemo(() =>
    metrics.fillerWords.slice(0, 6).map(f => ({ name: f.word, count: f.count })),
    [metrics]
  );

  const colors = isDark ? PIE_COLORS_DARK : PIE_COLORS;

  if (meetingDurationSec <= 0) {
    return (
      <div className="rounded-[10px] border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">No speech data available for coaching analysis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Score Banner */}
      <div className={cn(
        "rounded-[10px] border p-4 flex items-center justify-between",
        scoreBg(metrics.overallScore)
      )}>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Overall Speaking Score</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{scoreLabel(metrics.overallScore)}</p>
        </div>
        <div className={cn("text-3xl font-bold tabular-nums", scoreColor(metrics.overallScore))}>
          {metrics.overallScore}
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <ScoreTile label="Pacing" score={metrics.pacingScore} detail={`${metrics.wordsPerMinute} WPM`} />
        <ScoreTile label="Conciseness" score={metrics.concisenessScore} detail={`${metrics.fillerWordsPerMinute}/min fillers`} />
        <ScoreTile label="Listening" score={metrics.listeningScore} detail={`${fmtPct(metrics.talkToListenRatio)} talk`} />
      </div>

      {/* Speaking Time Pie + Stats */}
      <div className="grid grid-cols-2 gap-3">
        {/* Pie Chart */}
        <div className="rounded-[10px] border border-border bg-card p-5">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Mic className="h-3 w-3" /> Talk vs Listen
          </h4>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={2}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={colors[i]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [fmtTime(value), name]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-1">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: colors[i] }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>

        {/* Speaking Stats */}
        <div className="rounded-[10px] border border-border bg-card p-5">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Timer className="h-3 w-3" /> Speaking Stats
          </h4>
          <div className="space-y-3">
            <StatRow label="Your speaking time" value={fmtTime(metrics.yourSpeakingTimeSec)} />
            <StatRow label="Others' speaking time" value={fmtTime(metrics.othersSpeakingTimeSec)} />
            <StatRow label="Silence" value={fmtTime(metrics.silenceTimeSec)} />
            <div className="border-t border-border pt-2">
              <StatRow label="Talk-to-listen ratio" value={fmtPct(metrics.talkToListenRatio)} highlight />
            </div>
          </div>
        </div>
      </div>

      {/* Pacing + Interruptions */}
      <div className="grid grid-cols-2 gap-3">
        {/* Pacing */}
        <div className="rounded-[10px] border border-border bg-card p-5">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Zap className="h-3 w-3" /> Pacing
          </h4>
          <div className="space-y-3">
            <div>
              <div className="text-2xl font-bold tabular-nums text-foreground">{metrics.wordsPerMinute}</div>
              <div className="text-[10px] text-muted-foreground">words per minute</div>
            </div>
            <div className="space-y-1.5">
              <StatRow label="Fastest segment" value={`${metrics.fastestSegmentWpm} WPM`} />
              <StatRow label="Slowest segment" value={`${metrics.slowestSegmentWpm} WPM`} />
              <StatRow label="Variance" value={`${metrics.pacingVariance}`} />
            </div>
            <div className="text-[10px] text-muted-foreground/70 border-t border-border pt-2">
              Ideal: 130-160 WPM for clear communication
            </div>
          </div>
        </div>

        {/* Interruptions */}
        <div className="rounded-[10px] border border-border bg-card p-5">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <MessageCircleWarning className="h-3 w-3" /> Interruptions
          </h4>
          <div className="space-y-4">
            <div className="text-center">
              <div className="inline-flex items-center gap-6">
                <div>
                  <div className="text-2xl font-bold tabular-nums text-foreground">{metrics.interruptionCount}</div>
                  <div className="text-[10px] text-muted-foreground">You interrupted</div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                  <div className="text-2xl font-bold tabular-nums text-foreground">{metrics.interruptedByOthersCount}</div>
                  <div className="text-[10px] text-muted-foreground">Interrupted you</div>
                </div>
              </div>
            </div>
            {metrics.interruptionCount > 3 && (
              <div className="text-[10px] text-amber bg-amber-bg rounded-lg p-2">
                Tip: Try pausing briefly before speaking to avoid interrupting others.
              </div>
            )}
            {metrics.interruptionCount <= 3 && (
              <div className="text-[10px] text-green bg-green-bg rounded-lg p-2">
                Great job! You maintained good conversational flow.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filler Words */}
      {metrics.totalFillerCount > 0 && (
        <div className="rounded-[10px] border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filler Words</h4>
            <span className="text-xs text-muted-foreground tabular-nums">
              {metrics.totalFillerCount} total ({metrics.fillerWordsPerMinute}/min)
            </span>
          </div>
          {fillerData.length > 0 && (
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fillerData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={60}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value} times`, "Count"]}
                  />
                  <Bar dataKey="count" fill={isDark ? "hsl(229, 45%, 62%)" : "hsl(229, 51%, 37%)"} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {metrics.fillerWordsPerMinute > 3 && (
            <div className="text-[10px] text-amber bg-amber-bg rounded-lg p-2 mt-3">
              Tip: Try replacing filler words with brief pauses. Silence sounds more confident than fillers.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function ScoreTile({ label, score, detail }: { label: string; score: number; detail: string }) {
  return (
    <div className={cn("rounded-[10px] border p-3 text-center", scoreBg(score))}>
      <div className={cn("flex items-center justify-center gap-1", scoreColor(score))}>
        {scoreIcon(score)}
        <span className="text-xl font-bold tabular-nums">{score}</span>
      </div>
      <div className="text-[11px] font-medium text-foreground mt-0.5">{label}</div>
      <div className="text-[10px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("text-[11px] tabular-nums font-medium", highlight ? "text-accent" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}
