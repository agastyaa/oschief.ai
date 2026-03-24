import { cn } from "@/lib/utils";

function ShimmerBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded bg-gradient-to-r from-muted via-muted-foreground/15 to-muted bg-[length:200%_100%] animate-shimmer",
        className
      )}
      aria-hidden
    />
  );
}

type SummarySkeletonProps = {
  /** Footer line under skeleton blocks */
  message?: string;
  className?: string;
};

/** Loading placeholder while LLM generates meeting summary (shimmer skeleton). */
export function SummarySkeleton({ message = "Generating summary…", className }: SummarySkeletonProps) {
  return (
    <div className={cn("space-y-8 py-4", className)}>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShimmerBar className="h-3.5 w-3.5 shrink-0 rounded-sm" />
          <ShimmerBar className="h-4 w-36" />
        </div>
        <div className="space-y-2 pl-6">
          <ShimmerBar className="h-4 w-full" />
          <ShimmerBar className="h-4 w-4/5" />
          <ShimmerBar className="h-4 w-3/5" />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShimmerBar className="h-3.5 w-3.5 shrink-0 rounded-sm" />
          <ShimmerBar className="h-4 w-24" />
        </div>
        <div className="space-y-2.5 pl-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <ShimmerBar className="h-1.5 w-1.5 shrink-0 rounded-full" />
              <ShimmerBar className="h-4" style={{ width: `${70 - i * 10}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShimmerBar className="h-3.5 w-3.5 shrink-0 rounded-sm" />
          <ShimmerBar className="h-4 w-28" />
        </div>
        <div className="space-y-2.5 pl-6">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <ShimmerBar className="h-4 w-4 shrink-0 rounded-full" />
              <ShimmerBar className="h-4" style={{ width: `${55 - i * 10}%` }} />
            </div>
          ))}
        </div>
      </div>
      <p
        className={cn(
          "text-xs text-center bg-gradient-to-r from-muted-foreground/50 via-foreground/70 to-muted-foreground/50 bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer"
        )}
      >
        {message}
      </p>
    </div>
  );
}

/** Single-line coaching / analysis loading (matches summary shimmer language). */
export function CoachLoadingLine({ message = "Generating coaching insights…" }: { message?: string }) {
  return (
    <p
      className={cn(
        "text-[12px] text-center sm:text-left bg-gradient-to-r from-muted-foreground/45 via-foreground/75 to-muted-foreground/45 bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer"
      )}
    >
      {message}
    </p>
  );
}
