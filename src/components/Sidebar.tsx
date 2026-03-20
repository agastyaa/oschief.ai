import { useState } from "react";
import { FileText, Search, Settings, Sparkles, FolderOpen, Users, Briefcase, Star, Archive, Plus, X, Check, Home, Trash2, PanelLeftClose, PanelLeft, ArrowLeft, BarChart3, CheckCircle2, Contact } from "lucide-react";
import { SyagLogo } from "@/components/SyagLogo";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron-api";
import { useLocation, useNavigate } from "react-router-dom";
import { useFolders } from "@/contexts/FolderContext";
import { useSearchCommand } from "@/components/SearchCommand";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";

const iconMap = {
  folder: FolderOpen,
  users: Users,
  briefcase: Briefcase,
  star: Star,
  archive: Archive,
};

const COLLAPSE_BTN_CLASS =
  "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

/** Left group for main content top bar: sidebar collapse/expand + optional back link. Use as standard across the app. */
export function SidebarTopBarLeft({
  backLabel,
  onBack,
  backIcon = false,
}: {
  backLabel?: string;
  onBack?: () => void;
  /** When true, show ArrowLeft icon before back label (e.g. for "Back to home") */
  backIcon?: boolean;
}) {
  const { sidebarOpen, toggleSidebar } = useSidebarVisibility();
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleSidebar}
        className={COLLAPSE_BTN_CLASS}
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </button>
      {backLabel != null && onBack != null && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {backIcon && <ArrowLeft className="h-4 w-4" />}
          {backLabel}
        </button>
      )}
    </div>
  );
}

/** Collapse button only (no back link). For pages that only need the sidebar toggle. */
export function SidebarCollapseButton() {
  const { sidebarOpen, toggleSidebar } = useSidebarVisibility();
  return (
    <button
      onClick={toggleSidebar}
      className={COLLAPSE_BTN_CLASS}
      title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
    >
      {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
    </button>
  );
}

/**
 * When the sidebar is collapsed, use this as the left column before `<main>` on Electron so
 * content clears `titleBarStyle: hiddenInset` traffic lights (top + horizontal inset).
 */
export function SidebarCollapseRail({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-shrink-0 flex-col items-center",
        isElectron ? "w-20 min-w-[5rem] pt-10" : "w-10 pt-2"
      )}
    >
      {children}
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { folders, createFolder, deleteFolder } = useFolders();
  const { open: openSearch } = useSearchCommand();
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName("");
      setCreatingFolder(false);
    }
  };

  return (
    <aside className="flex h-screen w-56 flex-shrink-0 flex-col bg-sidebar">
      {/* Logo only — collapse is in content top bar via SidebarTopBarLeft */}
      <div className={cn("flex items-center justify-between px-4 pb-2", isElectron ? "pt-10" : "pt-4")}>
        <div className="flex items-center gap-2">
          <SyagLogo size={24} showText />
        </div>
        <SyncStatusIndicator />
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <button
          onClick={openSearch}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
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
            isActive("/") && !isActive("/notes") && !isActive("/ask") && !isActive("/coaching") && !isActive("/calendar") && !isActive("/settings") && !location.search.includes("folder")
              ? "bg-secondary text-foreground font-medium"
              : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Home className="h-3.5 w-3.5" />
          Home
        </button>
      </nav>

      {/* Folders */}
      <div className="mt-4 px-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Folders</span>
          <button
            onClick={() => setCreatingFolder(true)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {folders.map((f) => {
            const Icon = iconMap[f.icon] || FolderOpen;
            return (
              <div
                key={f.id}
                className={cn(
                  "group/folder flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                  new URLSearchParams(location.search).get("folder") === f.id
                    ? "bg-secondary text-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                <button
                  onClick={() => navigate(`/?folder=${f.id}`)}
                  className="flex flex-1 items-center gap-2.5 min-w-0"
                >
                  <div className={cn("flex h-4 w-4 items-center justify-center rounded flex-shrink-0", f.color)}>
                    <Icon className="h-2.5 w-2.5" />
                  </div>
                  <span className="truncate">{f.name}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFolder(f.id);
                    if (new URLSearchParams(location.search).get("folder") === f.id) {
                      navigate("/");
                    }
                  }}
                  className="hidden group-hover/folder:block rounded p-0.5 text-muted-foreground hover:text-destructive flex-shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          {/* Inline create folder */}
          {creatingFolder && (
            <div className="flex items-center gap-1 px-2 py-1">
              <div className="flex h-4 w-4 items-center justify-center rounded bg-accent/20 text-accent flex-shrink-0">
                <FolderOpen className="h-2.5 w-2.5" />
              </div>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                }}
                placeholder="Folder name"
                className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button onClick={handleCreateFolder} className="rounded p-0.5 text-accent hover:text-accent/80">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={() => { setCreatingFolder(false); setNewFolderName(""); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Intelligence section */}
      <div className="mt-4 px-3">
        <div className="flex items-center px-2 mb-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Intelligence</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => navigate("/ask")}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
              isActive("/ask")
                ? "bg-secondary text-foreground font-medium border-l-2 border-primary -ml-[2px]"
                : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Syag Chat
          </button>
          <button
            onClick={() => navigate("/coaching")}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
              isActive("/coaching")
                ? "bg-secondary text-foreground font-medium border-l-2 border-primary -ml-[2px]"
                : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Coaching
          </button>
          <button
            onClick={() => navigate("/people")}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
              isActive("/people")
                ? "bg-secondary text-foreground font-medium border-l-2 border-primary -ml-[2px]"
                : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            <Contact className="h-3.5 w-3.5" />
            People
          </button>
          <button
            onClick={() => navigate("/commitments")}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
              isActive("/commitments")
                ? "bg-secondary text-foreground font-medium border-l-2 border-primary -ml-[2px]"
                : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Commitments
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom — Calendar + Settings */}
      <div className="flex flex-col gap-0.5 px-3 pb-2">
        <div className="h-px bg-border mx-2 mb-1" />
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

      <div className="h-2" />
    </aside>
  );
}
