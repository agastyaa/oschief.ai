import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";

interface MemoryBannerProps {
  totalNotes: number;
  totalPeople: number;
  totalProjects: number;
  totalDecisions: number;
  totalCommitments: number;
  firstNoteDate: string | null;
}

export function MemoryBanner({
  totalNotes,
  totalPeople,
  totalProjects,
  totalDecisions,
  totalCommitments,
  firstNoteDate,
}: MemoryBannerProps) {
  const navigate = useNavigate();

  if (totalNotes < 5) return null;

  let sinceLabel = "";
  if (firstNoteDate) {
    try {
      const d = parseISO(firstNoteDate);
      if (!isNaN(d.getTime())) sinceLabel = `Since ${format(d, "MMM yyyy")}`;
    } catch {}
  }

  return (
    <div
      className="rounded-[10px] border border-border bg-card p-5 mb-4"
      style={{ borderLeftWidth: '3px', borderLeftColor: 'hsl(var(--primary))' }}
      role="region"
      aria-label="Professional memory summary"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[36px] leading-none text-primary">{totalNotes}</span>
            <span className="text-[14px] text-foreground/80">meetings in your memory</span>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1.5">
            {sinceLabel}{sinceLabel && " · "}All on your device
          </p>
        </div>
        <div className="sm:text-right text-[12px] text-muted-foreground space-y-0.5 pt-1">
          <div>{totalPeople} people · {totalProjects} projects</div>
          <div>{totalDecisions} decisions · {totalCommitments} commitments</div>
          <button
            onClick={() => navigate("/?view=all")}
            className="text-[11px] text-primary underline hover:text-primary/80 mt-1"
          >
            View full history →
          </button>
        </div>
      </div>
    </div>
  );
}
