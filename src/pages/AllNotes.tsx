import { Sidebar, SidebarExpandTrigger, SidebarCollapseButton } from "@/components/Sidebar";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron-api";

export default function AllNotes() {
  const navigate = useNavigate();
  const { sidebarOpen } = useSidebarVisibility();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen ? (
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      ) : (
        <SidebarExpandTrigger />
      )}
      <main className={cn("flex-1 overflow-y-auto", !sidebarOpen && isElectron && "pl-20")}>
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <SidebarCollapseButton />
        </div>
        <div className="mx-auto max-w-2xl px-6 py-8">
          <h1 className="font-display text-2xl text-foreground mb-1">All Notes</h1>
          <p className="text-xs text-muted-foreground mb-6">0 notes</p>

          <div className="py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent mx-auto mb-4">
              <Plus className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">No notes yet. Start a quick recording to get started.</p>
            <button
              onClick={() => navigate("/new-note?startFresh=1", { state: { startFresh: true } })}
              className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 transition-all"
            >
              Start Recording
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
