import { CheckSquare, FolderKanban, Calendar, Gavel } from "lucide-react";

interface StatsRowProps {
  openCommitments: number;
  overdueCommitments: number;
  activeProjects: number;
  meetingsThisWeek: number;
  decisionsThisMonth: number;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  subAmber,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  subAmber?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-border bg-card p-3" role="group" aria-label={`${label}: ${value}${sub ? `, ${sub}` : ''}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
      {sub && <div className={`text-[11px] mt-0.5 ${subAmber ? '' : 'text-muted-foreground'}`} style={subAmber ? { color: 'hsl(var(--amber, 30 55% 64%))' } : undefined}>{sub}</div>}
    </div>
  );
}

export function StatsRow({
  openCommitments,
  overdueCommitments,
  activeProjects,
  meetingsThisWeek,
  decisionsThisMonth,
}: StatsRowProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
      <StatCard
        icon={<CheckSquare className="h-3.5 w-3.5" />}
        label="Open"
        value={openCommitments}
        sub={overdueCommitments > 0 ? `${overdueCommitments} overdue` : undefined}
        subAmber={overdueCommitments > 0}
      />
      <StatCard
        icon={<FolderKanban className="h-3.5 w-3.5" />}
        label="Projects"
        value={activeProjects}
      />
      <StatCard
        icon={<Calendar className="h-3.5 w-3.5" />}
        label="This week"
        value={meetingsThisWeek}
      />
      <StatCard
        icon={<Gavel className="h-3.5 w-3.5" />}
        label="Decisions"
        value={decisionsThisMonth}
        sub="this month"
      />
    </div>
  );
}
