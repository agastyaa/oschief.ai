import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";

export interface TabDef {
  label: string;
  path: string;
  /** Match also on query param, e.g. "view=all" */
  matchQuery?: string;
}

export function SectionTabs({ tabs }: { tabs: TabDef[] }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isTabActive = (tab: TabDef) => {
    if (tab.matchQuery) {
      return location.search.includes(tab.matchQuery);
    }
    return tab.path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(tab.path);
  };

  return (
    <div className="flex gap-1 border-b border-border px-1 pb-0">
      {tabs.map((tab) => (
        <button
          key={tab.path + (tab.matchQuery || "")}
          onClick={() => navigate(tab.path + (tab.matchQuery ? `?${tab.matchQuery}` : ""))}
          className={cn(
            "px-3 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px",
            isTabActive(tab)
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Pre-defined tab sets for each merged section */
export const MEETING_TABS: TabDef[] = [
  { label: "Notes", path: "/", matchQuery: "view=all" },
  { label: "Calendar", path: "/calendar" },
  { label: "Series", path: "/series" },
];

export const WORK_TABS: TabDef[] = [
  { label: "People", path: "/people" },
  { label: "Projects", path: "/projects" },
  { label: "Commitments", path: "/commitments" },
  { label: "Decisions", path: "/decisions" },
];

export const INTELLIGENCE_TABS: TabDef[] = [
  { label: "Ask", path: "/ask" },
  { label: "Coaching", path: "/coaching" },
  { label: "Routines", path: "/routines" },
];
