import { useEffect } from "react";
import { FileText, Settings, Sparkles, Home, PanelLeftClose, PanelLeft, BarChart3, CheckCircle2, Contact, FolderKanban, Repeat, Calendar } from "lucide-react";
import { OSChiefLogo } from "@/components/OSChiefLogo";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import { PrivacyIndicator } from "@/components/PrivacyIndicator";
import { cn } from "@/lib/utils";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { useLocation, useNavigate } from "react-router-dom";
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
      {/* Only show collapse button when sidebar is open — when collapsed, SidebarCollapseRail already renders one */}
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
        "flex flex-shrink-0 flex-col items-center relative",
        isElectron ? "w-20 min-w-[5rem] pt-10" : "w-10 pt-2"
      )}
    >
      {/* Drag region when sidebar is collapsed — allows window movement from the rail area */}
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
 * sidebar is collapsed. Pages that use `pl-20` instead of SidebarCollapseRail
 * need this to remain draggable.
 */
export function GlobalDragRegion() {
  const { sidebarOpen } = useSidebarVisibility();
  if (!isElectron || sidebarOpen) return null;
  return (
    <div
      className="fixed top-0 left-0 right-0 h-10 z-40 pointer-events-auto"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    />
  );
}

// Calendar icon (inline SVG — matches existing style)
const calendarIcon = ({ className }: { className?: string }) => (
  <svg className={className || "h-3.5 w-3.5"} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 2v2M10.5 2v2" />
  </svg>
);

/** Sub-navigation item for sidebar sections */
function SubNavItem({ icon: Icon, label, to, active, navigate }: { icon?: any; label: string; to: string; active: boolean; navigate: (to: string) => void }) {
  return (
    <button
      onClick={() => navigate(to)}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors text-left",
        active
          ? "bg-secondary text-foreground font-medium"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { open: openSearch } = useSearchCommand();

  // Projects for sidebar nav (replaces folders)
  const [sidebarProjects, setSidebarProjects] = useState<any[]>([]);

  // Commitment weather dot — fetch once on mount, refresh on location change (user navigated)
  const [riskLevels, setRiskLevels] = useState<any[]>([]);
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.intelligence?.getRiskLevels) return;
    api.intelligence.getRiskLevels().then(setRiskLevels).catch(() => {});
    api?.memory?.projects?.getAll({ status: 'active' }).then((p: any[]) => setSidebarProjects((p || []).slice(0, 5))).catch(() => {});
  }, [location.pathname]);
  const redCount = riskLevels.filter((c: any) => c.risk_level === 'RED').length;
  const amberCount = riskLevels.filter((c: any) => c.risk_level === 'AMBER').length;

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  // Reusable nav item — icon is optional (Dia-style: labels-only for primary nav)
  const NavItem = ({ icon: Icon, label, to, onClick, active, iconClass }: {
    icon?: any; label: string; to?: string; onClick?: () => void;
    active?: boolean; iconClass?: string;
  }) => {
    const isItemActive = active ?? (to ? isActive(to) : false);
    return (
      <button
        onClick={onClick || (() => to && navigate(to))}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1 text-[13px] transition-colors",
          isItemActive
            ? "bg-secondary text-foreground font-medium"
            : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
        )}
      >
        {Icon && <Icon className={cn("h-3.5 w-3.5", iconClass)} />}
        {label}
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
      {/* Drag region for window movement (Electron hiddenInset titlebar) */}
      {isElectron && (
        <div
          className="absolute top-0 left-0 right-0 h-10 z-50"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      )}
      {/* Logo only — collapse is in content top bar via SidebarTopBarLeft */}
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
          {redCount + amberCount > 0 ? (
            <button
              onClick={() => navigate('/commitments')}
              className="ml-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
              style={{
                backgroundColor: redCount > 0 ? 'hsl(25 65% 45% / 0.15)' : 'hsl(30 55% 64% / 0.15)',
                color: redCount > 0 ? 'hsl(25 65% 40%)' : 'hsl(30 55% 45%)',
              }}
              aria-label={`${redCount + amberCount} commitments at risk`}
            >
              {redCount + amberCount} at risk
            </button>
          ) : null}
        </div>
      </div>

      {/* Today */}
      <nav className="flex flex-col gap-0.5 px-3 mt-4">
        <NavItem icon={Home} label="Today" to="/" active={
          isActive("/") && !isActive("/notes") && !isActive("/ask") && !isActive("/coaching") && !isActive("/calendar") && !isActive("/settings") && !location.search.includes("folder") && !location.search.includes("view=all")
        } />
      </nav>

      {/* All Meetings — projects as sub-items */}
      <nav className="flex flex-col gap-0.5 px-3 mt-0.5">
        <NavItem
          icon={FileText}
          label="All Meetings"
          to="/?view=all"
          active={location.search.includes("view=all") || isActive("/project/")}
        />
        {sidebarProjects.length > 0 && (
          <div className="flex flex-col gap-0.5 ml-6 mt-0.5">
            {sidebarProjects.map((p: any) => (
              <button
                key={p.id}
                onClick={() => navigate(`/project/${p.id}`)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-[12px] transition-colors text-left",
                  location.pathname === `/project/${p.id}`
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                <FolderKanban className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Flat nav — no section labels */}
      <nav className="flex flex-col gap-0.5 px-3 mt-2">
        <NavItem icon={Contact} label="People" to="/people" />
        <NavItem icon={CheckCircle2} label="Commitments" to="/commitments" />
      </nav>

      <nav className="flex flex-col gap-0.5 px-3 mt-2">
        <NavItem icon={Sparkles} label="Ask" to="/ask" />
        <NavItem icon={BarChart3} label="Coaching" to="/coaching" />
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom — Settings + Routines */}
      <div className="flex flex-col gap-0.5 px-3 pb-2">
        <div className="h-px bg-border mx-2 mb-1" />
        <NavItem icon={Calendar} label="Calendar" to="/calendar" />
        <NavItem icon={Repeat} label="Routines" to="/routines" />
        <NavItem icon={Settings} label="Settings" to="/settings" />
      </div>

      <div className="h-2" />
    </aside>
  );
}
