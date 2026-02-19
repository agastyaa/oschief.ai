import { useState } from "react";
import { Hash, CheckCircle2, Circle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryData {
  overview: string;
  keyPoints: string[];
  nextSteps: { text: string; assignee: string; done: boolean }[];
}

interface EditableSummaryProps {
  summary: SummaryData;
  onUpdate?: (summary: SummaryData) => void;
}

export function EditableSummary({ summary, onUpdate }: EditableSummaryProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [localSummary, setLocalSummary] = useState<SummaryData>(summary);

  const commit = (updated: SummaryData) => {
    setLocalSummary(updated);
    onUpdate?.(updated);
    setEditingField(null);
  };

  const handleOverviewChange = (value: string) => {
    commit({ ...localSummary, overview: value });
  };

  const handleKeyPointChange = (index: number, value: string) => {
    const updated = [...localSummary.keyPoints];
    updated[index] = value;
    commit({ ...localSummary, keyPoints: updated });
  };

  const handleNextStepTextChange = (index: number, value: string) => {
    const updated = [...localSummary.nextSteps];
    updated[index] = { ...updated[index], text: value };
    commit({ ...localSummary, nextSteps: updated });
  };

  const handleToggleDone = (index: number) => {
    const updated = [...localSummary.nextSteps];
    updated[index] = { ...updated[index], done: !updated[index].done };
    const newSummary = { ...localSummary, nextSteps: updated };
    setLocalSummary(newSummary);
    onUpdate?.(newSummary);
  };

  return (
    <div className="animate-fade-in">
      {/* Overview */}
      <div className="mb-8 group/section">
        <div className="flex items-center gap-2 mb-2">
          <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
          <h2 className="font-display text-base font-semibold text-foreground/70">Meeting Overview</h2>
        </div>
        {editingField === "overview" ? (
          <textarea
            autoFocus
            defaultValue={localSummary.overview}
            onBlur={(e) => handleOverviewChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleOverviewChange((e.target as HTMLTextAreaElement).value);
              }
              if (e.key === "Escape") setEditingField(null);
            }}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground/70 pl-6 focus:outline-none border-b border-accent/30"
            rows={3}
          />
        ) : (
          <p
            onClick={() => setEditingField("overview")}
            className="text-[15px] leading-relaxed text-foreground/70 pl-6 cursor-text rounded px-1 -mx-1 hover:bg-secondary/50 transition-colors"
          >
            {localSummary.overview}
            <Pencil className="inline-block ml-2 h-3 w-3 text-muted-foreground/0 group-hover/section:text-muted-foreground/40 transition-colors" />
          </p>
        )}
      </div>

      {/* Key Points */}
      {localSummary.keyPoints.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
            <h2 className="font-display text-base font-semibold text-foreground/70">Key Points</h2>
          </div>
          <ul className="space-y-2 pl-6">
            {localSummary.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-2.5 text-[15px] text-foreground/70 leading-relaxed group/item">
                <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground/30" />
                {editingField === `kp-${i}` ? (
                  <input
                    autoFocus
                    defaultValue={point}
                    onBlur={(e) => handleKeyPointChange(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleKeyPointChange(i, (e.target as HTMLInputElement).value);
                      if (e.key === "Escape") setEditingField(null);
                    }}
                    className="flex-1 bg-transparent text-[15px] leading-relaxed text-foreground/70 focus:outline-none border-b border-accent/30"
                  />
                ) : (
                  <span
                    onClick={() => setEditingField(`kp-${i}`)}
                    className="cursor-text rounded px-1 -mx-1 hover:bg-secondary/50 transition-colors"
                  >
                    {point}
                    <Pencil className="inline-block ml-2 h-3 w-3 text-muted-foreground/0 group-hover/item:text-muted-foreground/40 transition-colors" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next Steps */}
      {localSummary.nextSteps.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
            <h2 className="font-display text-base font-semibold text-foreground/70">Next Steps</h2>
          </div>
          <div className="space-y-2 pl-6">
            {localSummary.nextSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed group/step">
                <button onClick={() => handleToggleDone(i)} className="mt-1 flex-shrink-0">
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                  ) : (
                    <Circle className="h-4 w-4 text-foreground/30 hover:text-foreground/50 transition-colors" />
                  )}
                </button>
                <div className="flex-1">
                  {editingField === `ns-${i}` ? (
                    <input
                      autoFocus
                      defaultValue={step.text}
                      onBlur={(e) => handleNextStepTextChange(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleNextStepTextChange(i, (e.target as HTMLInputElement).value);
                        if (e.key === "Escape") setEditingField(null);
                      }}
                      className="w-full bg-transparent text-[15px] leading-relaxed text-foreground/70 focus:outline-none border-b border-accent/30"
                    />
                  ) : (
                    <span
                      onClick={() => setEditingField(`ns-${i}`)}
                      className={cn(
                        "cursor-text rounded px-1 -mx-1 hover:bg-secondary/50 transition-colors",
                        step.done ? "text-muted-foreground line-through" : "text-foreground/70"
                      )}
                    >
                      {step.text}
                      <Pencil className="inline-block ml-2 h-3 w-3 text-muted-foreground/0 group-hover/step:text-muted-foreground/40 transition-colors" />
                    </span>
                  )}
                  {step.assignee && <span className="text-xs text-muted-foreground ml-2">— {step.assignee}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
