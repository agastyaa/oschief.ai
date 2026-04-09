import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getElectronAPI } from "@/lib/electron-api";
import { cn } from "@/lib/utils";
import {
  BarChart3, Users, FolderKanban, Scale, CheckCircle2,
  AlertTriangle, Clock, Calendar, Mail, ChevronDown, ChevronRight,
} from "lucide-react";

type DigestData = {
  mode: 'current' | 'retrospective';
  weekRange: { from: string; to: string };
  currentWeekRange?: { from: string; to: string };
  narrative?: string | null;
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
  mailActivity?: { threadCount: number; topCorrespondents: { name: string; threadCount: number }[] } | null;
  upcoming?: {
    meetings: { title: string; date: string; time: string; attendees: string[] }[];
    commitmentsDue: { text: string; owner: string; due_date: string; assigneeName: string }[];
  } | null;
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

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime12(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h)) return time;
  const h12 = h > 12 ? h - 12 : h || 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function WeeklyDigestPage() {
  const navigate = useNavigate();
  const api = getElectronAPI();

  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'current' | 'retrospective' | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const loadDigest = (requestedMode?: 'current' | 'retrospective') => {
    setLoading(true);
    api?.digest?.getWeekly?.(requestedMode ? { mode: requestedMode } : undefined)
      .then((d: any) => {
        setData(d);
        if (!mode) setMode(d.mode);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDigest() }, [api]);

  const handleModeChange = (newMode: 'current' | 'retrospective') => {
    setMode(newMode);
    setExpandedSection(null);
    loadDigest(newMode);
  };

  const toggleSection = (key: string) => {
    setExpandedSection(prev => prev === key ? null : key);
  };

  const avgCoachingScore = useMemo(() => {
    if (!data?.coachingScores?.length) return null;
    return Math.round(data.coachingScores.reduce((s, c) => s + c.score, 0) / data.coachingScores.length);
  }, [data]);

  // Group upcoming meetings by date
  const upcomingByDate = useMemo(() => {
    if (!data?.upcoming?.meetings?.length) return [];
    const groups: Record<string, typeof data.upcoming.meetings> = {};
    for (const m of data.upcoming.meetings) {
      if (!groups[m.date]) groups[m.date] = [];
      groups[m.date].push(m);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-6">

            {/* Header + Mode Toggle */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <BarChart3 className="h-4 w-4 text-accent" />
              </div>
              <div className="flex-1">
                <h1 className="font-display text-xl font-semibold text-foreground">Weekly Summary</h1>
                {data && (
                  <p className="text-xs text-muted-foreground">
                    {mode === 'retrospective'
                      ? formatDateRange(data.weekRange.from, data.weekRange.to)
                      : data.currentWeekRange
                        ? formatDateRange(data.currentWeekRange.from, data.currentWeekRange.to)
                        : formatDateRange(data.weekRange.from, data.weekRange.to)
                    }
                  </p>
                )}
              </div>
              {mode && (
                <div className="flex gap-1 p-1 rounded-lg bg-secondary/50">
                  <button
                    onClick={() => handleModeChange('retrospective')}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                      mode === 'retrospective' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Last Week
                  </button>
                  <button
                    onClick={() => handleModeChange('current')}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                      mode === 'current' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    This Week
                  </button>
                </div>
              )}
            </div>

            {loading && (
              <div className="py-16 text-center">
                <div className="inline-block h-5 w-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                <p className="text-sm text-muted-foreground mt-3">Generating summary...</p>
              </div>
            )}

            {!loading && data && (
              <>
                {/* ── Quick Stats Bar ── */}
                <div className="flex items-center gap-4 rounded-[10px] border border-border bg-card px-4 py-3 mb-5">
                  <MiniStat icon={<BarChart3 className="h-3 w-3" />} value={data.meetingCount} label="meetings" />
                  <span className="text-border">|</span>
                  <MiniStat icon={<Clock className="h-3 w-3" />} value={formatDuration(data.totalDurationMin)} label="in calls" />
                  <span className="text-border">|</span>
                  <MiniStat icon={<Scale className="h-3 w-3" />} value={data.decisions.length} label="decisions" />
                  <span className="text-border">|</span>
                  <MiniStat icon={<CheckCircle2 className="h-3 w-3" />} value={`${data.commitments.completed}/${data.commitments.created}`} label="commitments" />
                  {data.commitments.overdue > 0 && (
                    <>
                      <span className="text-border">|</span>
                      <MiniStat icon={<AlertTriangle className="h-3 w-3 text-amber-500" />} value={data.commitments.overdue} label="overdue" className="text-amber-600" />
                    </>
                  )}
                  {avgCoachingScore != null && (
                    <>
                      <span className="text-border">|</span>
                      <MiniStat icon={<BarChart3 className="h-3 w-3" />} value={avgCoachingScore} label="coaching" />
                    </>
                  )}
                  {data.mailActivity && data.mailActivity.threadCount > 0 && (
                    <>
                      <span className="text-border">|</span>
                      <MiniStat icon={<Mail className="h-3 w-3" />} value={data.mailActivity.threadCount} label="emails" />
                    </>
                  )}
                </div>

                {/* ── AI Narrative Summary ── */}
                {data.narrative && (
                  <div className="rounded-[10px] border border-border bg-card p-4 mb-5">
                    <p className="text-[13px] leading-relaxed text-foreground">{data.narrative}</p>
                  </div>
                )}

                {/* ── Forward-Looking: Coming Up (current mode only) ── */}
                {mode === 'current' && data.upcoming && (upcomingByDate.length > 0 || data.upcoming.commitmentsDue.length > 0) && (
                  <div className="mb-5">
                    {upcomingByDate.length > 0 && (
                      <CollapsibleSection
                        title={`Coming Up (${data.upcoming?.meetings?.length || 0} meetings)`}
                        icon={<Calendar className="h-3 w-3" />}
                        expanded={expandedSection === 'upcoming'}
                        onToggle={() => toggleSection('upcoming')}
                      >
                        <div className="space-y-2">
                          {upcomingByDate.map(([date, meetings]) => (
                            <div key={date}>
                              <p className="text-[11px] font-medium text-muted-foreground mb-1">{formatShortDate(date)}</p>
                              {meetings.map((m, i) => (
                                <div key={i} className="flex items-center gap-2 py-1 text-[12px]">
                                  {m.time && <span className="text-muted-foreground tabular-nums w-14 shrink-0">{formatTime12(m.time)}</span>}
                                  <span className="text-foreground truncate">{m.title || 'Untitled'}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </CollapsibleSection>
                    )}

                    {data.upcoming.commitmentsDue.length > 0 && (
                      <CollapsibleSection
                        title={`Due This Week (${data.upcoming.commitmentsDue.length})`}
                        icon={<CheckCircle2 className="h-3 w-3" />}
                        expanded={expandedSection === 'due'}
                        onToggle={() => toggleSection('due')}
                      >
                        {data.upcoming.commitmentsDue.map((c, i) => (
                          <div key={i} className="flex items-start gap-2 py-1 text-[12px]">
                            <span className="text-foreground">{c.text}</span>
                            <span className="text-muted-foreground shrink-0 ml-auto">{c.due_date}</span>
                          </div>
                        ))}
                      </CollapsibleSection>
                    )}
                  </div>
                )}

                {mode === 'current' && data.upcoming && (upcomingByDate.length > 0 || data.upcoming.commitmentsDue.length > 0) && (
                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Last Week</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                {/* ── Overdue (always visible if any) ── */}
                {data.commitments.overdue > 0 && (
                  <div className="rounded-[10px] border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 mb-5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider">Overdue ({data.commitments.overdue})</span>
                    </div>
                    {data.commitments.overdueItems.map((c, i) => (
                      <div key={i} className="text-[12px] py-0.5">
                        <span className="text-foreground">{c.text}</span>
                        <span className="text-muted-foreground"> — {c.owner === "you" ? "You" : (c.assigneeName || c.owner)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Collapsible detail sections ── */}
                {data.decisions.length > 0 && (
                  <CollapsibleSection
                    title={`Decisions (${data.decisions.length})`}
                    icon={<Scale className="h-3 w-3" />}
                    expanded={expandedSection === 'decisions'}
                    onToggle={() => toggleSection('decisions')}
                  >
                    {data.decisions.slice(0, 8).map((d) => (
                      <div key={d.id} className="py-1">
                        <button
                          onClick={() => navigate(`/note/${d.noteId}`)}
                          className="text-[12px] text-foreground hover:text-primary text-left"
                        >
                          {d.text}
                        </button>
                      </div>
                    ))}
                  </CollapsibleSection>
                )}

                {data.people.length > 0 && (
                  <CollapsibleSection
                    title={`People (${data.people.length})`}
                    icon={<Users className="h-3 w-3" />}
                    expanded={expandedSection === 'people'}
                    onToggle={() => toggleSection('people')}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {data.people.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => navigate(`/people`)}
                          className="rounded-full border border-border px-2.5 py-0.5 text-[11px] hover:bg-secondary/50 transition-colors"
                        >
                          {p.name} <span className="text-muted-foreground">({p.meetingCount})</span>
                        </button>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                {data.projects.length > 0 && (
                  <CollapsibleSection
                    title={`Projects (${data.projects.length})`}
                    icon={<FolderKanban className="h-3 w-3" />}
                    expanded={expandedSection === 'projects'}
                    onToggle={() => toggleSection('projects')}
                  >
                    {data.projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/project/${p.id}`)}
                        className="flex w-full items-center justify-between py-1 text-[12px] hover:text-primary"
                      >
                        <span className="text-foreground">{p.name}</span>
                        <span className="text-muted-foreground">{p.weekMeetings} mtg{p.weekMeetings !== 1 ? "s" : ""}</span>
                      </button>
                    ))}
                  </CollapsibleSection>
                )}

                {data.meetings.length > 0 && (
                  <CollapsibleSection
                    title={`Meetings (${data.meetings.length})`}
                    icon={<BarChart3 className="h-3 w-3" />}
                    expanded={expandedSection === 'meetings'}
                    onToggle={() => toggleSection('meetings')}
                  >
                    {data.meetings.slice(0, 10).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => navigate(`/note/${m.id}`)}
                        className="flex w-full items-center gap-2 py-1 text-[12px] text-left hover:text-primary"
                      >
                        <span className="text-muted-foreground shrink-0 tabular-nums">{m.date}</span>
                        <span className="text-foreground truncate">{m.title || "Untitled"}</span>
                        {m.duration > 0 && <span className="text-muted-foreground ml-auto shrink-0">{formatDuration(m.duration)}</span>}
                      </button>
                    ))}
                  </CollapsibleSection>
                )}

                {/* Empty state */}
                {data.meetingCount === 0 && data.decisions.length === 0 && !data.narrative && (
                  <div className="py-16 text-center">
                    <BarChart3 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-base font-medium text-foreground mb-1">No activity yet.</p>
                    <p className="text-sm text-muted-foreground">Record meetings and the summary will populate automatically.</p>
                  </div>
                )}
              </>
            )}
      </div>
    </div>
  );
}

function MiniStat({
  icon, value, label, className,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function CollapsibleSection({
  title, icon, expanded, onToggle, children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 py-2 text-left group"
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium group-hover:text-foreground transition-colors">{title}</span>
      </button>
      {expanded && (
        <div className="pl-6 pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
