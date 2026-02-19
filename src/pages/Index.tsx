import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { MeetingCard } from "@/components/MeetingCard";
import { MeetingDetail } from "@/components/MeetingDetail";
import { meetings } from "@/data/meetings";
import { Plus, PanelLeftClose, PanelLeft, FolderOpen, ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AskBar } from "@/components/AskBar";
import { cn } from "@/lib/utils";
import { useFolders } from "@/contexts/FolderContext";

const Index = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const selectedMeeting = selectedId ? meetings.find((m) => m.id === selectedId) : null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { folders, noteFolders, getNotesInFolder } = useFolders();

  const activeFolderId = searchParams.get("folder");
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : null;

  // Group meetings by date
  const grouped = meetings.reduce<Record<string, typeof meetings>>((acc, m) => {
    (acc[m.date] = acc[m.date] || []).push(m);
    return acc;
  }, {});

  // Upcoming meetings (first 3)
  const upcoming = meetings.slice(0, 3);

  // Folder-filtered meetings
  const folderNoteIds = activeFolderId ? getNotesInFolder(activeFolderId) : [];
  const folderMeetings = activeFolderId ? meetings.filter((m) => folderNoteIds.includes(m.id)) : [];

  if (selectedMeeting) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <div className={cn(
          "transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
          sidebarOpen ? "w-56" : "w-0"
        )}>
          <Sidebar />
        </div>
        <main className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center gap-2 px-4 pt-3 pb-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setSelectedId(null)}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back to notes
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pb-24">
            <div className="mx-auto max-w-3xl px-8 py-4">
              <MeetingDetail meeting={selectedMeeting} />
            </div>
          </div>
          <div className="relative">
            <AskBar context="meeting" meetingTitle={selectedMeeting.title} />
          </div>
        </main>
      </div>
    );
  }

  // Folder view
  if (activeFolder) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex flex-1 flex-col min-w-0 relative">
          <div className="flex-1 overflow-y-auto pb-24">
            <div className="mx-auto max-w-2xl px-6 py-8">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => navigate("/")}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-accent" />
                  <h1 className="font-display text-xl text-foreground">{activeFolder.name}</h1>
                </div>
                <span className="text-xs text-muted-foreground">{folderMeetings.length} notes</span>
              </div>

              {folderMeetings.length === 0 ? (
                <div className="text-center py-16">
                  <FolderOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No notes in this folder yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Open a note and use "Add to folder" to move it here</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {folderMeetings.map((m) => (
                    <MeetingCard
                      key={m.id}
                      meeting={m}
                      selected={false}
                      onClick={() => setSelectedId(m.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0">
            <AskBar context="home" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0 relative">
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="mx-auto max-w-2xl px-6 py-8">
            {/* Quick Note top-right */}
            <div className="flex items-center justify-end mb-6">
              <button
                onClick={() => navigate("/new-note")}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-all hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                Quick Note
              </button>
            </div>

            {/* Coming up */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Coming up</h2>
                <button onClick={() => navigate("/calendar")} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  View calendar →
                </button>
              </div>
              <div className="space-y-1">
                {upcoming.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className="flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-card border border-transparent hover:border-border"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent flex-shrink-0">
                      <span className="text-xs font-semibold">{m.time.split(":")[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-[15px] text-foreground truncate">{m.title}</h3>
                      <span className="text-[11px] text-muted-foreground">{m.time} · {m.duration}</span>
                    </div>
                    <div className="flex -space-x-1.5">
                      {m.participants.slice(0, 3).map((p, i) => (
                        <div
                          key={i}
                          className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[9px] font-medium text-foreground ring-2 ring-background"
                        >
                          {p.charAt(0)}
                        </div>
                      ))}
                      {m.participants.length > 3 && (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground ring-2 ring-background">
                          +{m.participants.length - 3}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes grouped by date */}
            <div>
              {Object.entries(grouped).map(([date, items]) => (
                <div key={date} className="mb-6">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-3 mb-1">
                    {date}
                  </h3>
                  <div className="space-y-0.5">
                    {items.map((m) => (
                      <MeetingCard
                        key={m.id}
                        meeting={m}
                        selected={false}
                        onClick={() => setSelectedId(m.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <AskBar context="home" />
        </div>
      </main>
    </div>
  );
};

export default Index;
