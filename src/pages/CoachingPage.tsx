import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useNotes } from "@/contexts/NotesContext";
import { getElectronAPI } from "@/lib/electron-api";
import { cn } from "@/lib/utils";
import {
  Brain, ArrowRight, RefreshCw, ChevronDown, Check,
} from "lucide-react";
import type { CoachingMetrics } from "@/lib/coaching-analytics";

// ── Helpers ─────────────────────────────────────────────────────────────

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
  const { notes, updateNote } = useNotes();
  const api = getElectronAPI();

  // All notes with transcripts (including excluded ones) — for manage list
  const allCoachableNotes = useMemo(() => {
    return notes
      .filter(n => n.transcript?.length > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [notes]);

  const accountRoleId = useMemo(() => {
    try {
      const raw = localStorage.getItem("syag-account");
      if (raw) return JSON.parse(raw)?.roleId as string | undefined;
    } catch { /* ignore */ }
    return undefined;
  }, []);

  const meetings: MeetingData[] = useMemo(() => {
    return notes
      .filter(n => n.coachingMetrics && n.coachingMetrics.overallScore > 0 && !n.micOnly)
      .map(n => ({ id: n.id, title: n.title || "Untitled Meeting", date: n.date, metrics: n.coachingMetrics! }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [notes]);

  const notesWithInsights = useMemo(() => {
    return notes
      .filter((n) => n.coachingMetrics?.conversationInsights?.headline && !n.micOnly)
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
    summaryHeadline: string; themesParagraph: string; improvementArc?: string; blindSpot?: string; bestMoment?: string; focusNext: string; recurringTags: string[];
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
    if (meetings.length > 0) {
      return {
        headline: "Generate your first coaching analysis",
        body: "Open any meeting below and click the Coaching tab. I\u2019ll analyze what you said, what you committed to, and how it aligns with your role.",
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

  // Collapsible sections state
  const [showMeetingList, setShowMeetingList] = useState(false);

  return (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-6 font-body page-enter">

            {/* ── Header ── */}
            <div className="mb-8">
              <h1 className="font-display text-[20px] font-semibold text-foreground tracking-tight">Work Coach</h1>
              <p className="text-[13px] text-muted-foreground mt-1">Your CoS reviews how you run meetings — what you missed, what to change</p>
            </div>

            {/* ── Empty state: no meetings ── */}
            {meetings.length === 0 && (
              <div className="py-16 text-center">
                <Brain className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                <h2 className="font-display text-[17px] font-semibold text-foreground mb-2">Your coach is ready.</h2>
                <p className="text-[13px] text-muted-foreground max-w-sm mx-auto mb-4">
                  Record a meeting and I'll tell you what you're doing well and what to change — grounded in your transcript, not generic tips.
                </p>
                <button onClick={() => navigate("/new-note?startFresh=1")} className="rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-all hover:opacity-90">
                  Quick Note
                </button>
              </div>
            )}

            {/* ── Role not set warning ── */}
            {meetings.length > 0 && !accountRoleId && (
              <div className="rounded-[10px] border bg-card p-4 mb-6" style={{ borderLeftWidth: '3px', borderLeftColor: 'hsl(var(--amber, 30 55% 64%))' }}>
                <p className="text-[13px] text-foreground">Set your role in Settings so I can give you role-specific coaching.</p>
                <button onClick={() => navigate("/settings?section=account")} className="text-[12px] font-medium text-primary hover:underline mt-1">
                  Go to Settings →
                </button>
              </div>
            )}

            {/* ── Coach Message (hero) ── */}
            {coachMsg.type !== "empty" && (
              <div className="mb-6">
                <p className="text-[16px] font-semibold text-foreground leading-snug mb-2">{coachMsg.headline}</p>
                <p className="text-[13.5px] text-foreground/70 leading-relaxed">{coachMsg.body}</p>

                {crossMeeting?.focusNext && (
                  <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Focus next</p>
                    <p className="text-[13.5px] text-foreground leading-relaxed">{crossMeeting.focusNext}</p>
                  </div>
                )}

                {crossMeeting?.blindSpot && (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Blind spot</p>
                    <p className="text-[13.5px] text-foreground leading-relaxed">{crossMeeting.blindSpot}</p>
                  </div>
                )}

                {/* Improvement arc */}
                {crossMeeting?.improvementArc && (
                  <p className="mt-3 text-[12px] text-muted-foreground">{crossMeeting.improvementArc}</p>
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
              <div className="mb-4">
                <p className="text-[12px] text-muted-foreground mb-2">Open any meeting's Coaching tab to generate deeper analysis:</p>
                <div className="space-y-1">
                  {[...meetings].reverse().slice(0, 3).map(m => (
                    <button key={m.id} onClick={() => navigate(`/note/${m.id}`)}
                      className="flex items-center gap-2 text-[12px] text-primary hover:underline">
                      <ArrowRight className="h-3 w-3" /> {m.title} ({m.date})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── What I Noticed (micro-insights — clean text, no cards) ── */}
            {topMicroInsights.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">What I noticed</p>
                <div className="space-y-4">
                  {topMicroInsights.map((mi, i) => (
                    <div key={i}>
                      <p className="text-[13.5px] text-foreground leading-relaxed">{mi.text}</p>
                      {mi.evidenceQuote && (
                        <p className="mt-1 text-[12px] text-muted-foreground italic leading-relaxed">
                          — "{mi.evidenceQuote}"
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {mi.framework && (
                          <span className="text-[10px] text-muted-foreground/70">{mi.framework}</span>
                        )}
                        <button
                          onClick={() => navigate(`/note/${mi.meetingId}`)}
                          className="text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
                        >
                          {mi.meetingTitle} →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Your Patterns (habit tags) ── */}
            {habitTagCounts.length > 0 && (
              <div className="mb-4">
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

            {/* ── Manage Meetings (exclude/include from coaching) ── */}
            {allCoachableNotes.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => setShowMeetingList(!showMeetingList)}
                  className="flex items-center gap-2 w-full text-left group"
                >
                  <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", showMeetingList && "rotate-180")} />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                    Manage Meetings
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {meetings.length} of {allCoachableNotes.length} included
                  </span>
                </button>
                {showMeetingList && (
                  <div className="mt-2 rounded-[10px] border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-secondary/30">
                      <button
                        onClick={() => {
                          allCoachableNotes.forEach(n => {
                            if (n.micOnly) {
                              updateNote(n.id, { micOnly: false } as any);
                              getElectronAPI()?.db?.notes?.update(n.id, { micOnly: false });
                            }
                          });
                        }}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        Include all
                      </button>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <button
                        onClick={() => {
                          allCoachableNotes.forEach(n => {
                            if (!n.micOnly) {
                              updateNote(n.id, { micOnly: true } as any);
                              getElectronAPI()?.db?.notes?.update(n.id, { micOnly: true });
                            }
                          });
                        }}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Exclude all
                      </button>
                    </div>
                    <div className="max-h-[280px] overflow-y-auto divide-y divide-border/50">
                    {allCoachableNotes.map(n => {
                      const excluded = !!n.micOnly;
                      return (
                        <div
                          key={n.id}
                          className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors", excluded && "opacity-50")}
                        >
                          <button
                            onClick={() => {
                              const api = getElectronAPI();
                              api?.db?.notes?.update(n.id, { micOnly: !excluded });
                              // Optimistic UI: toggle in notes context
                              updateNote(n.id, { micOnly: !excluded } as any);
                            }}
                            className={cn(
                              "flex items-center justify-center w-4 h-4 rounded border transition-colors shrink-0",
                              !excluded ? "bg-primary border-primary text-white" : "border-border hover:border-primary/50"
                            )}
                            title={excluded ? "Include in coaching" : "Exclude from coaching"}
                          >
                            {!excluded && <Check className="h-2.5 w-2.5" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] text-foreground truncate block">{n.title || "Untitled"}</span>
                            <span className="text-[10px] text-muted-foreground">{n.date}</span>
                          </div>
                          {excluded && (
                            <span className="text-[10px] text-muted-foreground">excluded</span>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Reanalyze (subtle, bottom) ── */}
            {meetings.length > 0 && (
              <div className="pt-4 border-t border-border">
                <button
                  onClick={() => void runBatchCoaching()}
                  disabled={batchRunning}
                  className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3 w-3", batchRunning && "animate-spin")} />
                  {batchRunning
                    ? `Analyzing ${batchProgress?.current ?? 0}/${batchProgress?.total ?? '...'} — ${batchProgress?.noteTitle ?? ''}`
                    : "Reanalyze all meetings"}
                </button>
              </div>
            )}

          </div>
        </div>
  );
}
