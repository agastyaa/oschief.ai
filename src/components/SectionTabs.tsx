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
      // For Notes tab: also match folder views (/?folder=...)
      if (tab.matchQuery === "view=all") {
        return location.pathname === "/" && (location.search.includes("view=all") || location.search.includes("folder="));
      }
      return location.search.includes(tab.matchQuery);
    }
    return tab.path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(tab.path);
  };

  return (
    <div className="flex gap-0.5 px-1">
      {tabs.map((tab) => (
        <button
          key={tab.path + (tab.matchQuery || "")}
          onClick={() => navigate(tab.path + (tab.matchQuery ? `?${tab.matchQuery}` : ""))}
          className={cn(
            "px-2.5 py-1.5 text-[13px] font-medium transition-colors rounded-md",
            isTabActive(tab)
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/40"
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
];

export const INTELLIGENCE_TABS: TabDef[] = [
  { label: "Ask", path: "/ask" },
  { label: "Coaching", path: "/coaching" },
  { label: "Digest", path: "/digest" },
  { label: "Routines", path: "/routines" },
];
