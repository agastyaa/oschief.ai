import { useState, useEffect } from "react";
import {
  FileText, Settings, Sparkles, Home, PanelLeftClose, PanelLeft, ArrowLeft,
  BarChart3, CheckCircle2, Contact, FolderKanban, Repeat, Calendar,
  Search, Plus, Gavel, BookOpen,
} from "lucide-react";
import { OSChiefLogo } from "@/components/OSChiefLogo";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { PrivacyIndicator } from "@/components/PrivacyIndicator";
import { cn } from "@/lib/utils";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { useLocation, useNavigate } from "react-router-dom";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { useSearchCommand } from "@/components/SearchCommand";

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
  backIcon?: boolean;
}) {
  const { sidebarOpen, toggleSidebar } = useSidebarVisibility();
  return (
    <div className="flex items-center gap-2">
      {sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className={COLLAPSE_BTN_CLASS}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      )}
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

/** Collapse button only (no back link). */
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
 * content clears `titleBarStyle: hiddenInset` traffic lights.
 */
export function SidebarCollapseRail({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-shrink-0 flex-col items-center relative",
        isElectron ? "w-20 min-w-[5rem] pt-10" : "w-10 pt-2"
      )}
    >
      {isElectron && (
        <div
          className="absolute top-0 left-0 right-0 h-10 z-50"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      )}
      {children}
    </div>
  );
}

/**
 * Global drag region for Electron — covers the full top of the window when
 * sidebar is collapsed.
 */
export function GlobalDragRegion() {
  if (!isElectron) return null;
  return (
    <div
      className="fixed top-0 left-0 right-0 h-10 z-40 pointer-events-auto"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    />
  );
}

/** Section label for sidebar grouping */
function SectionLabel({ label }: { label: string }) {
  return (
    <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground px-2.5 pt-3 pb-1 block select-none">
      {label}
    </span>
  );
}


export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { open: openSearch } = useSearchCommand();

  // Risk levels for commitment badge
  const [riskLevels, setRiskLevels] = useState<any[]>([]);
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.intelligence?.getRiskLevels) return;
    api.intelligence.getRiskLevels().then(setRiskLevels).catch(() => {});
  }, [location.pathname]);

  const riskCount = riskLevels.filter((c: any) => c.risk_level === 'RED' || c.risk_level === 'AMBER').length;

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  // Reusable nav item
  const NavItem = ({ icon: Icon, label, to, onClick, active, badge }: {
    icon?: any; label: string; to?: string; onClick?: () => void;
    active?: boolean; badge?: React.ReactNode;
  }) => {
    const isItemActive = active ?? (to ? isActive(to) : false);
    return (
      <button
        onClick={onClick || (() => to && navigate(to))}
        className={cn(
          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors w-full text-left",
          isItemActive
            ? "bg-secondary text-foreground font-medium"
            : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
        <span className="truncate flex-1">{label}</span>
        {badge}
      </button>
    );
  };

  const { sidebarWidth, startResize } = useSidebarVisibility();

  return (
    <aside className="relative flex h-screen flex-shrink-0 flex-col bg-sidebar" style={{ width: sidebarWidth }}>
      {/* Resize drag handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-40 hover:bg-primary/20 active:bg-primary/30 transition-colors"
        onMouseDown={startResize}
      />
      {/* Drag region for Electron */}
      {isElectron && (
        <div
          className="absolute top-0 left-0 right-0 h-10 z-50"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      )}

      {/* Workspace Header — Logo + Status */}
      <div
        className={cn("flex items-center justify-between px-4 pb-2", isElectron ? "pt-10" : "pt-4")}
        style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}
      >
        <div className="flex items-center gap-2">
          <OSChiefLogo size={24} showText />
        </div>
        <div className="flex items-center gap-1">
          <PrivacyIndicator />
          <SyncStatusIndicator />
        </div>
      </div>

      {/* New Note button row */}
      <div className="flex items-center gap-1.5 px-3 pb-1" style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}>
        <button
          onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
          className="flex items-center gap-2 flex-1 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
          title="New Note"
          aria-label="New Note"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Note</span>
        </button>
      </div>

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* BRIEFING */}
        <nav className="flex flex-col gap-0.5 px-3">
          <SectionLabel label="Briefing" />
          <NavItem icon={Home} label="Today" to="/" active={
            isActive("/") && !location.search.includes("view=all") && !location.search.includes("folder")
          } />
          <NavItem icon={BookOpen} label="Digest" to="/digest" />
        </nav>

        {/* MEETINGS */}
        <nav className="flex flex-col gap-0.5 px-3 mt-1">
          <SectionLabel label="Meetings" />
          <NavItem
            icon={FileText}
            label="All Meetings"
            to="/?view=all"
            active={location.search.includes("view=all")}
          />
        </nav>

        {/* WORKSPACE */}
        <nav className="flex flex-col gap-0.5 px-3 mt-1">
          <SectionLabel label="Workspace" />
          <NavItem icon={Contact} label="People" to="/people" />
          <NavItem
            icon={CheckCircle2}
            label="Commitments"
            to="/commitments"
            badge={riskCount > 0 ? (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
                style={{
                  backgroundColor: 'hsl(30 55% 64% / 0.15)',
                  color: 'hsl(30 55% 45%)',
                }}
              >
                {riskCount}
              </span>
            ) : undefined}
          />
          <NavItem icon={FolderKanban} label="Projects" to="/projects" />
          <NavItem icon={Gavel} label="Decisions" to="/decisions" />
        </nav>

        {/* INTELLIGENCE */}
        <nav className="flex flex-col gap-0.5 px-3 mt-1">
          <SectionLabel label="Intelligence" />
          <NavItem icon={Sparkles} label="Ask OSChief" to="/ask" />
          <NavItem icon={BarChart3} label="Coaching" to="/coaching" />
        </nav>
      </div>

      {/* Bottom — Search, Calendar, Routines, Settings */}
      <div className="flex flex-col gap-0.5 px-3 pb-2 flex-shrink-0">
        <div className="h-px bg-border mx-2 mb-1" />
        {/* Search */}
        <button
          onClick={openSearch}
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground bg-secondary/50 hover:bg-secondary transition-colors w-full"
        >
          <Search className="h-3 w-3" />
          <span>Search</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60">&#8984;K</span>
        </button>
        <NavItem icon={Calendar} label="Calendar" to="/calendar" />
        <NavItem icon={Repeat} label="Routines" to="/routines" />
        <NavItem icon={Settings} label="Settings" to="/settings" />
      </div>

      <div className="h-2" />
    </aside>
  );
}
