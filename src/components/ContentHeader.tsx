import { useContentHeaderConfig } from "@/contexts/ContentHeaderContext";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { isElectron } from "@/lib/electron-api";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeft, ArrowLeft } from "lucide-react";

const COLLAPSE_BTN_CLASS =
  "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

export function ContentHeader() {
  const config = useContentHeaderConfig();
  const { sidebarOpen, toggleSidebar } = useSidebarVisibility();

  if (config.hideHeader) return null;

  // When sidebar is collapsed and no back/actions, still render a spacer in Electron for traffic lights
  const hasContent = sidebarOpen || config.backLabel || config.actions;
  if (!hasContent) {
    if (isElectron) return <div className="pt-8 flex-shrink-0" />;
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 pb-0 flex-shrink-0",
        isElectron ? "pt-10" : "pt-3"
      )}
      style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined}
    >
      <div className="flex items-center gap-2">
        {/* Only show collapse button when sidebar is open — rail handles expand when collapsed */}
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
        {config.backLabel && config.onBack && (
          <button
            onClick={config.onBack}
            className="flex items-center gap-1.5 text-body-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {config.backLabel}
          </button>
        )}
      </div>
      {config.actions && (
        <div className="flex items-center gap-2">
          {config.actions}
        </div>
      )}
    </div>
  );
}
