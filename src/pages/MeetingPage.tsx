import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar, SidebarExpandTrigger, SidebarTopBarLeft } from "@/components/Sidebar";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { MeetingDetail } from "@/components/MeetingDetail";
import { AskBar } from "@/components/AskBar";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import { meetings } from "@/data/meetings";
import { Share2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron-api";

export default function MeetingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sidebarOpen } = useSidebarVisibility();
  const [viewMode, setViewMode] = useState<"my-notes" | "ai-notes">("ai-notes");
  const meeting = meetings.find((m) => m.id === id);

  if (!meeting) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-[13px] text-muted-foreground">Meeting not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen ? (
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      ) : (
        <SidebarExpandTrigger />
      )}
      <main className="flex flex-1 flex-col min-w-0">
        <div className={cn(
          "flex items-center justify-between px-4 pt-3 pb-0",
          !sidebarOpen && isElectron && "pl-20"
        )}>
          <SidebarTopBarLeft
            backLabel="← Back to notes"
            onBack={() => navigate(-1)}
          />
          <div className="flex items-center gap-1.5">
            <NotesViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
            <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="mx-auto max-w-3xl px-6 py-4">
            <MeetingDetail meeting={meeting} viewMode={viewMode} />
          </div>
        </div>
        <div className="relative">
          <AskBar context="meeting" meetingTitle={meeting.title} />
        </div>
      </main>
    </div>
  );
}
