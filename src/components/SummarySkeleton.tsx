import { cn } from "@/lib/utils";

function ShimmerBar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      style={style}
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
    <div className={cn("space-y-4 py-3", className)}>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ShimmerBar className="h-3 w-3 shrink-0 rounded-sm" />
          <ShimmerBar className="h-3.5 w-36" />
        </div>
        <div className="space-y-1.5 pl-5">
          <ShimmerBar className="h-3.5 w-full" />
          <ShimmerBar className="h-3.5 w-4/5" />
          <ShimmerBar className="h-3.5 w-3/5" />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ShimmerBar className="h-3 w-3 shrink-0 rounded-sm" />
          <ShimmerBar className="h-3.5 w-24" />
        </div>
        <div className="space-y-1.5 pl-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <ShimmerBar className="h-1 w-1 shrink-0 rounded-full" />
              <ShimmerBar className="h-3.5" style={{ width: `${70 - i * 12}%` }} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ShimmerBar className="h-3 w-3 shrink-0 rounded-sm" />
          <ShimmerBar className="h-3.5 w-28" />
        </div>
        <div className="space-y-1.5 pl-5">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <ShimmerBar className="h-3.5 w-3.5 shrink-0 rounded-full" />
              <ShimmerBar className="h-3.5" style={{ width: `${55 - i * 12}%` }} />
            </div>
          ))}
        </div>
      </div>
      <p
        className={cn(
          "text-[11px] text-center bg-gradient-to-r from-muted-foreground/50 via-foreground/70 to-muted-foreground/50 bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer"
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
