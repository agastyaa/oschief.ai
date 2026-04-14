import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useNotes } from "@/contexts/NotesContext";
import { getElectronAPI } from "@/lib/electron-api";
import { cn } from "@/lib/utils";
import {
  Brain, ArrowRight, RefreshCw, ChevronDown, ChevronRight, Check, Sparkles,
} from "lucide-react";
import type { CoachingMetrics } from "@/lib/coaching-analytics";
import { CoachingInsightsDisplay } from "@/components/CoachingInsightsDisplay";
import { useRunCoachingAnalysis } from "@/hooks/useRunCoachingAnalysis";
import { CoachLoadingLine } from "@/components/SummarySkeleton";

// ── Helpers ─────────────────────────────────────────────────────────────

function formatTag(tag: string): string {
  return tag.replace(/_/g, " ");
}

// Negative patterns get amber, positive get green
const NEGATIVE_TAGS = new Set(["filler_heavy", "monologue_dominant", "low_questions", "interrupts_often", "too_fast", "too_slow", "vague_commitments", "no_next_steps"]);

function tagColor(tag: string): string {
  return NEGATIVE_TAGS.has(tag)
    ? "bg-amber-bg text-amber border-amber"
    : "bg-green-bg text-green border-green";
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
  const { analyze, loadingNoteId, accountRoleId } = useRunCoachingAnalysis({ updateNote });

  // Selected meeting in accordion
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  // All notes with transcripts (including excluded ones) — for manage list
  const allCoachableNotes = useMemo(() => {
    return notes
      .filter(n => n.transcript?.length > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [notes]);

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
    summaryHeadline: string; themesParagraph: string; improvementArc?: string; blindSpot?: string; bestMoment?: string; provocativeQuestion?: string; strategicChallenge?: string; focusNext: string; recurringTags: string[];
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
        body: "Select any meeting below and click Analyze. I\u2019ll assess what you said, what you committed to, and how it aligns with your role.",
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

            {/* ── Header with action buttons ── */}
            <div className="flex items-start justify-between gap-4 mb-8">
              <div>
                <h1 className="font-display text-[20px] font-normal text-foreground tracking-tight">Executive Coach</h1>
                <p className="text-body-sm text-muted-foreground mt-1">Your AI Chief of Staff analyzes how you lead. Strategic gaps, decision quality, authority, leverage. Not meeting tips. Leadership intelligence.</p>
              </div>
              {meetings.length > 0 && (
                <div className="flex items-center gap-2 shrink-0 pt-1">
                  {crossMeeting && (
                    <button
                      onClick={() => void runAggregateInsights()}
                      disabled={crossLoading}
                      className="flex items-center gap-1.5 rounded-[4px] border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3 w-3", crossLoading && "animate-spin")} />
                      Refresh
                    </button>
                  )}
                  <button
                    onClick={() => void runBatchCoaching()}
                    disabled={batchRunning}
                    className="flex items-center gap-1.5 rounded-[4px] border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3 w-3", batchRunning && "animate-spin")} />
                    {batchRunning
                      ? `${batchProgress?.current ?? 0}/${batchProgress?.total ?? '...'}`
                      : "Reanalyze all"}
                  </button>
                </div>
              )}
            </div>

            {/* ── Empty state: no meetings ── */}
            {meetings.length === 0 && allCoachableNotes.length === 0 && (
              <div className="py-16 text-center">
                <Brain className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                <h2 className="font-display text-[17px] font-normal text-foreground mb-2">Your coach is ready.</h2>
                <p className="text-body-sm text-muted-foreground max-w-sm mx-auto mb-4">
                  Record a meeting and I'll assess your strategic thinking. Where you're operating below your level, what you're missing, and what to change.
                </p>
                <button onClick={() => navigate("/new-note?startFresh=1")} className="rounded-md bg-primary px-3.5 py-1.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90">
                  Quick Note
                </button>
              </div>
            )}

            {/* ── Role not set warning ── */}
            {(meetings.length > 0 || allCoachableNotes.length > 0) && !accountRoleId && (
              <div className="rounded-[10px] border bg-card p-4 mb-6 border-l-[3px] border-l-amber">
                <p className="text-body-sm text-foreground">Set your role in Settings so I can give you role-specific coaching.</p>
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

                {/* Provocative Question — cross-meeting */}
                {crossMeeting?.provocativeQuestion && (
                  <div className="mt-4 rounded-[10px] border border-primary/20 bg-primary/5 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-primary font-medium mb-1.5">Question to sit with</p>
                    <p className="text-[14px] text-foreground leading-relaxed font-display">{crossMeeting.provocativeQuestion}</p>
                  </div>
                )}

                {/* Strategic Challenge — cross-meeting */}
                {crossMeeting?.strategicChallenge && (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Strategic challenge</p>
                    <p className="text-[13.5px] text-foreground leading-relaxed">{crossMeeting.strategicChallenge}</p>
                  </div>
                )}

                {/* Improvement arc */}
                {crossMeeting?.improvementArc && (
                  <p className="mt-3 text-[12px] text-muted-foreground">{crossMeeting.improvementArc}</p>
                )}
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
                          — &ldquo;{mi.evidenceQuote}&rdquo;
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

            {/* ── Meetings — accordion with per-meeting coaching ── */}
            {allCoachableNotes.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">MEETINGS</p>
                <div className="rounded-[10px] border border-border bg-card overflow-hidden">
                  <div className="divide-y divide-border/50">
                    {allCoachableNotes.map(n => {
                      const excluded = !!n.micOnly;
                      const hasInsights = !!n.coachingMetrics?.conversationInsights?.headline;
                      const isSelected = selectedMeetingId === n.id;
                      const isAnalyzing = loadingNoteId === n.id;
                      const conv = n.coachingMetrics?.conversationInsights;

                      return (
                        <div key={n.id} className={cn(excluded && "opacity-50")}>
                          {/* Meeting row */}
                          <button
                            onClick={() => setSelectedMeetingId(isSelected ? null : n.id)}
                            className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-secondary/30 transition-colors group"
                          >
                            <ChevronRight className={cn(
                              "h-3 w-3 text-muted-foreground transition-transform shrink-0",
                              isSelected && "rotate-90"
                            )} />
                            <div className="flex-1 min-w-0">
                              <span className="text-body-sm text-foreground truncate block">{n.title || "Untitled"}</span>
                              <span className="text-[10px] text-muted-foreground">{n.date}{n.timeRange ? ` · ${n.timeRange}` : ''}</span>
                            </div>
                            {excluded ? (
                              <span className="text-[10px] text-muted-foreground shrink-0">excluded</span>
                            ) : hasInsights ? (
                              <span className="rounded-full bg-green-bg text-green border border-green px-2 py-0.5 text-[10px] font-medium shrink-0">Analyzed</span>
                            ) : (
                              <span className="rounded-full bg-secondary text-muted-foreground px-2 py-0.5 text-[10px] font-medium shrink-0">Not analyzed</span>
                            )}
                            {/* Per-meeting action button */}
                            {!excluded && accountRoleId && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void analyze(n);
                                }}
                                disabled={isAnalyzing}
                                className={cn(
                                  "shrink-0 flex items-center gap-1 rounded-[4px] border px-2 py-1 text-[11px] font-medium transition-all",
                                  hasInsights
                                    ? "border-transparent text-muted-foreground opacity-0 group-hover:opacity-100 hover:border-border hover:bg-secondary/50"
                                    : "border-primary/30 text-primary hover:bg-primary/5",
                                  isAnalyzing && "opacity-100"
                                )}
                                title={hasInsights ? "Reanalyze" : "Analyze"}
                              >
                                {isAnalyzing ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : hasInsights ? (
                                  <>
                                    <RefreshCw className="h-3 w-3" />
                                    <span className="hidden group-hover:inline">Reanalyze</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-3 w-3" />
                                    Analyze
                                  </>
                                )}
                              </button>
                            )}
                          </button>

                          {/* Expanded coaching content */}
                          {isSelected && (
                            <div className="px-4 pb-4 pt-1 border-t border-border/30 animate-in fade-in slide-in-from-top-1 duration-200">
                              {isAnalyzing && !conv && (
                                <CoachLoadingLine message={`Analyzing ${n.title || "meeting"}...`} />
                              )}
                              {conv && (
                                <CoachingInsightsDisplay
                                  insights={conv}
                                  compact
                                />
                              )}
                              {!conv && !isAnalyzing && excluded && (
                                <p className="text-[12px] text-muted-foreground py-2">
                                  This meeting is excluded from coaching. Include it in Manage Meetings below to analyze.
                                </p>
                              )}
                              {!conv && !isAnalyzing && !excluded && !accountRoleId && (
                                <div className="py-3">
                                  <p className="text-[12px] text-muted-foreground">Set your role in Settings to analyze this meeting.</p>
                                  <button onClick={() => navigate("/settings?section=account")} className="text-[12px] font-medium text-primary hover:underline mt-1">
                                    Go to Settings →
                                  </button>
                                </div>
                              )}
                              {!conv && !isAnalyzing && !excluded && accountRoleId && (
                                <div className="py-3 text-center">
                                  <button
                                    onClick={() => void analyze(n)}
                                    className="rounded-[10px] border border-border bg-card p-4 w-full hover:bg-secondary/50 transition-colors"
                                  >
                                    <Sparkles className="h-5 w-5 text-primary mx-auto mb-2" />
                                    <p className="text-body-sm font-medium text-foreground">Analyze this meeting</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">Find what you missed — grounded in your transcript and role playbook</p>
                                  </button>
                                </div>
                              )}
                              {/* Link to full meeting */}
                              <button
                                onClick={() => navigate(`/note/${n.id}`)}
                                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors mt-3"
                              >
                                <ArrowRight className="h-3 w-3" />
                                Open full meeting
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                            <span className="text-body-sm text-foreground truncate block">{n.title || "Untitled"}</span>
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

          </div>
        </div>
  );
}
