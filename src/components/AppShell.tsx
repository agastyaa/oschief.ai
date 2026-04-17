import { Outlet, useLocation } from "react-router-dom";
import { Sidebar, SidebarCollapseRail, GlobalDragRegion } from "@/components/Sidebar";
import { ContentHeader } from "@/components/ContentHeader";
import { ContentHeaderProvider, useContentHeaderConfig } from "@/contexts/ContentHeaderContext";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { GlobalRecordingBanner } from "@/components/GlobalRecordingBanner";
import { MeetingDetectionHandler } from "@/components/MeetingDetectionHandler";
import { TranscriptRecoveryModal } from "@/components/TranscriptRecoveryModal";
import { TrayAgendaSync } from "@/components/TrayAgendaSync";
import { isElectron } from "@/lib/electron-api";
import { cn } from "@/lib/utils";
import { PanelLeft, Search } from "lucide-react";
import { useSearchCommand } from "@/components/SearchCommand";

function AppShellInner() {
  const { sidebarOpen, toggleSidebar } = useSidebarVisibility();
  const location = useLocation();
  const config = useContentHeaderConfig();
  const isOnRecordingPage = location.pathname === "/new-note";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <GlobalDragRegion />
      {!isOnRecordingPage && <GlobalRecordingBanner />}
      <MeetingDetectionHandler />
      {isElectron && <TrayAgendaSync />}
      {/* R1.2 — recovers transcripts from crashed recordings with >5s loss */}
      {isElectron && <TranscriptRecoveryModal />}

      {/* Sidebar */}
      {sidebarOpen ? (
        <div className="flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      ) : (
        <SidebarCollapseRail>
          <button
            onClick={toggleSidebar}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground mt-1"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </SidebarCollapseRail>
      )}

      {/* Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        <ContentHeader />
        <div className={cn(
          "flex-1 overflow-y-auto relative flex flex-col bg-background",
          !config.fullWidth && "max-w-none"
        )}>

          {/* Key on pathname so route changes crossfade instead of hard-cut.
              motion-reduce disables the animation for users who opt out. */}
          <div
            key={location.pathname}
            className="flex-1 flex flex-col animate-route-enter motion-reduce:animate-none"
          >
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

export function AppShell() {
  return (
    <ContentHeaderProvider>
      <AppShellInner />
    </ContentHeaderProvider>
  );
}
