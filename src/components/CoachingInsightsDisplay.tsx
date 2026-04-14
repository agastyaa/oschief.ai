import { cn } from "@/lib/utils";
import { Quote, Crosshair } from "lucide-react";
import type { ConversationInsights } from "@/lib/coaching-analytics";
import { findTranscriptLineIndexForQuote } from "@/lib/conversation-heuristics";

interface CoachingInsightsDisplayProps {
  insights: ConversationInsights;
  showJumpToTranscript?: boolean;
  onJumpToTranscriptLine?: (lineIndex: number) => void;
  transcript?: { speaker: string; time: string; text: string }[];
  compact?: boolean;
}

export function CoachingInsightsDisplay({
  insights,
  showJumpToTranscript = false,
  onJumpToTranscriptLine,
  transcript,
  compact = false,
}: CoachingInsightsDisplayProps) {
  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {/* Headline + Narrative */}
      <div>
        <p className={cn("font-semibold text-foreground leading-snug", compact ? "text-[15px]" : "text-[16px]")}>
          {insights.headline}
        </p>
        <p className="text-[13.5px] text-foreground/70 leading-relaxed mt-2">
          {insights.narrative}
        </p>
      </div>

      {/* Provocative Question — accent card */}
      {insights.provocativeQuestion && (
        <div className="rounded-[10px] border border-primary/20 bg-primary/5 p-4">
          <p className="text-[10px] uppercase tracking-wider text-primary font-medium mb-1.5">Question to sit with</p>
          <p className={cn(
            "text-foreground leading-relaxed",
            compact ? "text-[13.5px]" : "text-[14px] font-display"
          )}>
            {insights.provocativeQuestion}
          </p>
        </div>
      )}

      {/* Strategic Challenge */}
      {insights.strategicChallenge && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Strategic challenge</p>
          <p className="text-[13.5px] text-foreground leading-relaxed">{insights.strategicChallenge}</p>
        </div>
      )}

      {/* Habit Tags */}
      {insights.habitTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {insights.habitTags.map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      {/* Micro-insights */}
      <div className="space-y-3">
        {insights.microInsights.map((m, i) => (
          <div key={i}>
            <p className="text-body-sm text-foreground leading-relaxed">{m.text}</p>
            {m.evidenceQuote && (
              <p className="mt-1 text-[12px] text-muted-foreground italic">
                — &ldquo;{m.evidenceQuote}&rdquo;{m.time ? ` [${m.time}]` : ''}
              </p>
            )}
            {m.framework && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{m.framework}</p>
            )}
          </div>
        ))}
      </div>

      {/* Key Moments */}
      {insights.keyMoments.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Quote className="h-3 w-3" />
            Key moments{showJumpToTranscript ? " (transcript)" : ""}
          </p>
          <ul className="space-y-2">
            {insights.keyMoments.map((km, i) => {
              const canJump = showJumpToTranscript && onJumpToTranscriptLine && transcript;
              const idx = canJump ? findTranscriptLineIndexForQuote(transcript, km.quote) : undefined;
              return (
                <li
                  key={i}
                  className="flex items-start justify-between gap-2 rounded-md border border-border bg-background/80 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-foreground">{km.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">&ldquo;{km.quote}&rdquo;</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      {km.speaker} &middot; {km.time}
                    </p>
                  </div>
                  {idx !== undefined && onJumpToTranscriptLine && (
                    <button
                      type="button"
                      onClick={() => onJumpToTranscriptLine(idx)}
                      className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Show in transcript"
                    >
                      <Crosshair className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
