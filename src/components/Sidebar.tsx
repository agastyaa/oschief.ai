import { FileText, Search, Settings, Sparkles, FolderOpen, Users, ChevronRight, Plus, NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";

const folders = [
  { icon: Users, label: "Team meetings", color: "bg-accent/20 text-accent" },
  { icon: FolderOpen, label: "Sales calls", color: "bg-amber-100 text-amber-700" },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <aside className="flex h-screen w-56 flex-shrink-0 flex-col bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent">
          <NotebookPen className="h-3.5 w-3.5 text-accent-foreground" />
        </div>
        <span className="font-display text-lg text-foreground">granola</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary">
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <kbd className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 mt-1">
        <button
          onClick={() => navigate("/")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
            isActive("/") && !isActive("/notes") && !isActive("/ask") && !isActive("/calendar") && !isActive("/settings")
              ? "bg-secondary text-foreground font-medium"
              : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          My notes
        </button>
      </nav>

      {/* Folders */}
      <div className="mt-4 px-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Folders</span>
          <button className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {folders.map((f) => (
            <button
              key={f.label}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-sidebar-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <div className={cn("flex h-4 w-4 items-center justify-center rounded", f.color)}>
                <f.icon className="h-2.5 w-2.5" />
              </div>
              {f.label}
            </button>
          ))}
          <button className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground">
            <ChevronRight className="h-3 w-3" />
            Browse all folders...
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom controls */}
      <div className="flex flex-col gap-0.5 px-3 pb-2">
        <button
          onClick={() => navigate("/ask")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
            isActive("/ask")
              ? "bg-secondary text-foreground font-medium"
              : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Granola Chat
        </button>
        <button
          onClick={() => navigate("/calendar")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
            isActive("/calendar")
              ? "bg-secondary text-foreground font-medium"
              : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="12" height="11" rx="1.5" />
            <path d="M2 6.5h12M5.5 2v2M10.5 2v2" />
          </svg>
          Calendar
        </button>
        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
            isActive("/settings")
              ? "bg-secondary text-foreground font-medium"
              : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </button>
      </div>

      {/* Bottom padding */}
      <div className="h-2" />
    </aside>
  );
}
