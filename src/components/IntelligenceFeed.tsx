import { Brain, Users, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface IntelligenceFeedProps {
  /** Latest coaching micro-insight from recent meetings */
  coachingInsight?: { text: string; meetingTitle?: string } | null;
  /** People the user is meeting today */
  todaysPeople?: { name: string; meetingCount: number; lastMet?: string }[];
  /** People not met in a while */
  staleRelationships?: { name: string; daysSince: number }[];
}

export function IntelligenceFeed({ coachingInsight, todaysPeople, staleRelationships }: IntelligenceFeedProps) {
  const navigate = useNavigate();
  const hasContent = coachingInsight || (todaysPeople && todaysPeople.length > 0) || (staleRelationships && staleRelationships.length > 0);

  if (!hasContent) return null;

  return (
    <div
      className="rounded-[10px] border border-border bg-card p-5 transition-shadow hover:shadow-[var(--card-shadow-hover)]"
      style={{ boxShadow: "var(--card-shadow)", borderLeftWidth: '3px', borderLeftColor: 'hsl(var(--primary))' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4 text-primary" />
        <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Intelligence</span>
      </div>

      <div className="space-y-3">
        {coachingInsight && (
          <div
            className="cursor-pointer hover:bg-secondary/50 rounded px-2 py-1.5 -mx-2 transition-colors"
            onClick={() => navigate('/coaching')}
          >
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Coaching insight</p>
            <p className="text-body-sm text-foreground/90 leading-relaxed">{coachingInsight.text}</p>
            {coachingInsight.meetingTitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5">from: {coachingInsight.meetingTitle}</p>
            )}
          </div>
        )}

        {todaysPeople && todaysPeople.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Meeting today</p>
            <div className="flex flex-wrap gap-1.5">
              {todaysPeople.map((p) => (
                <button
                  key={p.name}
                  onClick={() => navigate('/people')}
                  className="inline-flex items-center gap-1 text-[12px] bg-secondary/60 hover:bg-secondary text-foreground/80 px-2 py-0.5 rounded-full transition-colors"
                >
                  <Users className="h-2.5 w-2.5" />
                  {p.name}
                  {p.meetingCount > 1 && <span className="text-muted-foreground">({p.meetingCount}x)</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {staleRelationships && staleRelationships.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Haven't met in a while</p>
            {staleRelationships.slice(0, 3).map((r) => (
              <p key={r.name} className="text-[12px] text-foreground/70 leading-relaxed">
                {r.name} — {r.daysSince} days ago
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
