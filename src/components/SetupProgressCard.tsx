import { CheckCircle2, Loader2, Circle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type SetupPhase = 'detecting' | 'downloading-stt' | 'installing-stt' | 'downloading-llm' | 'configuring' | 'ready' | 'error';

interface SetupProgressCardProps {
  phase: SetupPhase;
  message: string;
  percent: number;
}

const STEPS = [
  { key: 'stt', label: 'Speech recognition' },
  { key: 'llm', label: 'AI summarization' },
  { key: 'config', label: 'Configuration' },
] as const;

function stepStatus(step: typeof STEPS[number]['key'], phase: SetupPhase): 'done' | 'active' | 'pending' {
  if (phase === 'ready') return 'done';
  if (phase === 'error') return step === 'stt' ? 'done' : 'pending';
  if (step === 'stt') {
    if (['downloading-stt', 'installing-stt'].includes(phase)) return 'active';
    if (['downloading-llm', 'configuring', 'ready'].includes(phase)) return 'done';
    return 'pending';
  }
  if (step === 'llm') {
    if (phase === 'downloading-llm') return 'active';
    if (['configuring', 'ready'].includes(phase)) return 'done';
    return 'pending';
  }
  if (step === 'config') {
    if (phase === 'configuring') return 'active';
    if (phase === 'ready') return 'done';
    return 'pending';
  }
  return 'pending';
}

export function SetupProgressCard({ phase, message, percent }: SetupProgressCardProps) {
  const isReady = phase === 'ready';
  const isError = phase === 'error';

  return (
    <div
      className="rounded-lg border border-border bg-card p-5 transition-shadow"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-[14px] font-semibold text-foreground">
          {isReady ? "Syag is ready!" : isError ? "Setup needs attention" : "Setting up Syag..."}
        </h3>
      </div>

      <div className="space-y-2.5 mb-4">
        {STEPS.map((step) => {
          const status = stepStatus(step.key, phase);
          return (
            <div key={step.key} className="flex items-center gap-3">
              {status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
              {status === 'active' && <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />}
              {status === 'pending' && <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
              <span className={cn(
                "text-[13px]",
                status === 'done' && "text-foreground",
                status === 'active' && "text-foreground font-medium",
                status === 'pending' && "text-muted-foreground",
              )}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {!isReady && !isError && (
        <>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {message || "This only happens once."}
          </p>
        </>
      )}

      {isError && (
        <p className="text-[11px] text-destructive mt-1">
          {message}. You can configure models manually in Settings.
        </p>
      )}

      {isReady && (
        <p className="text-[11px] text-muted-foreground mt-1">
          All set! Record your first meeting with the Quick Note button above.
        </p>
      )}
    </div>
  );
}
