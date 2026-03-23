import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Commitment {
  id: string;
  text: string;
  status: string;
  due_date?: string | null;
  assignee_name?: string | null;
  note_id?: string;
}

interface CommitmentsDueCardProps {
  commitments: Commitment[];
}

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  try {
    const due = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  } catch { return false; }
}

function isDueToday(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  try {
    const due = new Date(dueDate);
    const today = new Date();
    return due.toDateString() === today.toDateString();
  } catch { return false; }
}

export function CommitmentsDueCard({ commitments }: CommitmentsDueCardProps) {
  const navigate = useNavigate();

  const overdue = commitments.filter(c => isOverdue(c.due_date));
  const dueToday = commitments.filter(c => isDueToday(c.due_date) && !isOverdue(c.due_date));
  const urgent = [...overdue, ...dueToday];

  if (urgent.length === 0 && commitments.length === 0) return null;

  const displayItems = urgent.length > 0 ? urgent : commitments.slice(0, 3);

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-[var(--card-shadow-hover)]"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <h3 className="text-[13px] font-semibold text-foreground">
            {overdue.length > 0 ? `${overdue.length} overdue` : dueToday.length > 0 ? `${dueToday.length} due today` : `${commitments.length} open`}
          </h3>
        </div>
        <button
          onClick={() => navigate('/commitments')}
          className="text-[11px] text-primary hover:underline"
        >
          View all
        </button>
      </div>

      <div className="space-y-2">
        {displayItems.slice(0, 4).map((c) => (
          <div
            key={c.id}
            className="flex items-start gap-2 cursor-pointer hover:bg-secondary/50 rounded px-1.5 py-1 -mx-1.5 transition-colors"
            onClick={() => c.note_id && navigate(`/note/${c.note_id}`)}
          >
            {isOverdue(c.due_date) ? (
              <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
            ) : isDueToday(c.due_date) ? (
              <Clock className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border border-border mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-foreground/90 leading-snug truncate">{c.text}</p>
              {c.assignee_name && (
                <p className="text-[11px] text-muted-foreground">{c.assignee_name}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
