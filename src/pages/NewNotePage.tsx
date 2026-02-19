import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { AskBar } from "@/components/AskBar";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import {
  Mic, MicOff, Pause, Play, Eye, EyeOff, Square,
  PanelLeftClose, PanelLeft, Share2, MoreHorizontal,
  Calendar, Clock, Users, Plus, FolderOpen, Check, X, Hash,
  CheckCircle2, Circle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFolders } from "@/contexts/FolderContext";

type RecordingState = "recording" | "paused" | "stopped";

const fakeTranscriptLines = [
  { speaker: "You", time: "0:00", text: "Alright, let's get started with today's meeting." },
  { speaker: "You", time: "0:04", text: "I wanted to go over a few things from last week first." },
  { speaker: "You", time: "0:12", text: "The main item is the product launch timeline." },
  { speaker: "You", time: "0:18", text: "We need to finalize the feature list by end of this week." },
  { speaker: "You", time: "0:25", text: "Let me check the status of each item..." },
  { speaker: "You", time: "0:32", text: "Marketing materials are nearly done." },
  { speaker: "You", time: "0:38", text: "The landing page still needs copy review." },
  { speaker: "You", time: "0:45", text: "And we should schedule the demo recording for next Tuesday." },
];

const fakeSummary = {
  overview: "This was a planning session focused on the upcoming product launch timeline, covering feature prioritization, marketing materials status, and scheduling key deliverables.",
  keyPoints: [
    "Product launch timeline needs to be finalized by end of week",
    "Marketing materials are nearly complete and in review",
    "Landing page copy still requires a final review pass",
    "Demo recording needs to be scheduled for next Tuesday",
  ],
  nextSteps: [
    { text: "Finalize the feature list", assignee: "You", done: false },
    { text: "Complete landing page copy review", assignee: "You", done: false },
    { text: "Schedule demo recording for Tuesday", assignee: "You", done: false },
  ],
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function NewNotePage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("recording");
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [personalNotes, setPersonalNotes] = useState("");
  const [visibleLines, setVisibleLines] = useState(2);
  const [title, setTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [viewMode, setViewMode] = useState<"my-notes" | "ai-notes">("ai-notes");
  const titleRef = useRef<HTMLInputElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const { folders, createFolder } = useFolders();

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  // Real-time timer
  useEffect(() => {
    if (recordingState !== "recording") return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [recordingState]);

  // Simulate live transcription
  useEffect(() => {
    if (recordingState !== "recording") return;
    if (visibleLines >= fakeTranscriptLines.length) return;
    const timer = setInterval(() => {
      setVisibleLines((prev) => Math.min(prev + 1, fakeTranscriptLines.length));
    }, 3000);
    return () => clearInterval(timer);
  }, [recordingState, visibleLines]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleLines]);

  useEffect(() => {
    if (isEditingTitle) titleRef.current?.select();
  }, [isEditingTitle]);

  const handleStop = useCallback(() => {
    setRecordingState("stopped");
    setTranscriptVisible(true);
    if (!title) setTitle("Meeting notes");
  }, [title]);

  const handleCreateAndAssign = () => {
    if (newFolderName.trim()) {
      const folder = createFolder(newFolderName.trim());
      setSelectedFolderId(folder.id);
      setNewFolderName("");
      setCreatingFolder(false);
      setShowFolderPicker(false);
    }
  };

  const elapsed = formatTime(elapsedSeconds);
  const isStopped = recordingState === "stopped";

  const folderChip = (
    <>
      {selectedFolder ? (
        <button
          onClick={() => setShowFolderPicker(!showFolderPicker)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
        >
          <FolderOpen className="h-3 w-3 text-accent" />
          {selectedFolder.name}
          <X
            className="h-3 w-3 text-muted-foreground hover:text-foreground ml-0.5"
            onClick={(e) => { e.stopPropagation(); setSelectedFolderId(null); }}
          />
        </button>
      ) : (
        <button
          onClick={() => setShowFolderPicker(!showFolderPicker)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add to folder
        </button>
      )}

      {showFolderPicker && (
        <div className="absolute top-full left-0 mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Move to folder</span>
          </div>
          <div className="max-h-40 overflow-y-auto py-1">
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => { setSelectedFolderId(f.id); setShowFolderPicker(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
              >
                <FolderOpen className="h-3 w-3 text-accent" />
                {f.name}
                {selectedFolderId === f.id && <Check className="h-3 w-3 ml-auto text-accent" />}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border">
            {creatingFolder ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateAndAssign();
                    if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                  }}
                  placeholder="Folder name"
                  className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button onClick={handleCreateAndAssign} className="text-accent"><Check className="h-3 w-3" /></button>
                <button onClick={() => { setCreatingFolder(false); setNewFolderName(""); }} className="text-muted-foreground"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <button onClick={() => setCreatingFolder(true)} className="flex items-center gap-1.5 text-xs text-accent hover:underline">
                <Plus className="h-3 w-3" />
                New folder
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
        sidebarOpen ? "w-56" : "w-0"
      )}>
        <Sidebar />
      </div>

      <main className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigate("/")}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back to notes
            </button>
          </div>
          {/* Show toggle + share/more only after summary */}
          {isStopped && (
            <div className="flex items-center gap-1.5">
              <NotesViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
              <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Share2 className="h-3.5 w-3.5" />
              </button>
              <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: main content + ask bar */}
          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex-1 overflow-y-auto pb-24">
              <div className="mx-auto max-w-3xl px-8 py-6">
                {/* Title */}
                {isEditingTitle ? (
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                    className="mb-3 w-full font-display text-2xl text-foreground bg-transparent border-none outline-none focus:ring-0"
                    placeholder="New note"
                  />
                ) : (
                  <h1
                    onClick={() => setIsEditingTitle(true)}
                    className={cn(
                      "mb-3 font-display text-2xl cursor-text transition-colors leading-tight",
                      title ? "text-foreground hover:text-foreground/80" : "text-foreground/40 hover:text-foreground/60"
                    )}
                  >
                    {title || "New note"}
                  </h1>
                )}

                {/* Meta chips - only show during recording */}
                {!isStopped && (
                  <div className="flex items-center gap-2 mb-6 flex-wrap relative">
                    <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                      <Calendar className="h-3 w-3" />
                      Today
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                      <Users className="h-3 w-3" />
                      Me
                    </span>
                    {folderChip}
                  </div>
                )}

                {/* Content: recording vs stopped */}
                {!isStopped ? (
                  <textarea
                    value={personalNotes}
                    onChange={(e) => setPersonalNotes(e.target.value)}
                    placeholder="Write notes..."
                    className="min-h-[60vh] w-full resize-none bg-transparent text-[15px] text-foreground leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <div className="animate-fade-in">
                    {viewMode === "my-notes" ? (
                      <textarea
                        value={personalNotes}
                        onChange={(e) => setPersonalNotes(e.target.value)}
                        placeholder="Add your personal notes..."
                        className="min-h-[40vh] w-full resize-none bg-transparent text-[15px] text-foreground leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <>
                        {/* Show personal notes above AI notes if any exist */}
                        {personalNotes && (
                          <div className="mb-8 pb-6 border-b border-border/50">
                            <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">{personalNotes}</p>
                          </div>
                        )}

                        <div className="mb-8">
                          <div className="flex items-center gap-2 mb-2">
                            <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                            <h2 className="font-display text-base font-semibold text-foreground/70">Meeting Overview</h2>
                          </div>
                          <p className="text-[15px] leading-relaxed text-foreground/70 pl-6">{fakeSummary.overview}</p>
                        </div>

                        <div className="mb-8">
                          <div className="flex items-center gap-2 mb-3">
                            <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                            <h2 className="font-display text-base font-semibold text-foreground/70">Key Points</h2>
                          </div>
                          <ul className="space-y-2 pl-6">
                            {fakeSummary.keyPoints.map((point, i) => (
                              <li key={i} className="flex gap-2.5 text-[15px] text-foreground/70 leading-relaxed">
                                <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground/30" />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="mb-8">
                          <div className="flex items-center gap-2 mb-3">
                            <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                            <h2 className="font-display text-base font-semibold text-foreground/70">Next Steps</h2>
                          </div>
                          <div className="space-y-2 pl-6">
                            {fakeSummary.nextSteps.map((item, i) => (
                              <div key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
                                {item.done ? (
                                  <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-accent" />
                                ) : (
                                  <Circle className="mt-1 h-4 w-4 flex-shrink-0 text-foreground/30" />
                                )}
                                <div>
                                  <span className={cn(item.done ? "text-muted-foreground line-through" : "text-foreground/70")}>
                                    {item.text}
                                  </span>
                                  <span className="text-xs text-muted-foreground ml-2">— {item.assignee}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Ask bar - inside left column so it doesn't overlap transcript */}
            <div className="relative">
              <AskBar
                context="meeting"
                meetingTitle={title || "New note"}
                recordingState={recordingState}
                transcriptVisible={transcriptVisible}
                onResumeRecording={() => {
                  setRecordingState("recording");
                  setTranscriptVisible(true);
                }}
                onPauseRecording={() => setRecordingState("paused")}
                onStopRecording={handleStop}
                onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                leftSlot={
                  !isStopped ? (
                    <div className={cn(
                      "flex items-center gap-1.5 rounded-full border border-border bg-card shadow-lg px-3 py-2.5 text-xs font-medium flex-shrink-0",
                      recordingState === "recording"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-secondary text-muted-foreground"
                    )}>
                      {recordingState === "recording" && (
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                        </span>
                      )}
                      <Mic className="h-3 w-3" />
                    </div>
                  ) : undefined
                }
                elapsed={elapsed}
              />
            </div>
          </div>

          {/* Transcript side panel */}
          {transcriptVisible && (
            <div className="w-72 flex-shrink-0 border-l border-border bg-card/50 overflow-y-auto">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {isStopped ? "Transcript" : "Live Transcript"}
                  </span>
                  <button
                    onClick={() => setTranscriptVisible(false)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {fakeTranscriptLines.slice(0, isStopped ? fakeTranscriptLines.length : visibleLines).map((line, i) => (
                  <div key={i} className="animate-fade-in">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-medium text-foreground">
                        {line.speaker.charAt(0)}
                      </div>
                      <span className="text-[10px] font-medium text-foreground">{line.speaker}</span>
                      <span className="text-[10px] text-muted-foreground">{line.time}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed pl-6">
                      {line.text}
                    </p>
                  </div>
                ))}
                {recordingState === "recording" && (
                  <div className="flex items-center gap-1.5 pt-1 animate-pulse">
                    <div className="h-1 w-1 rounded-full bg-destructive" />
                    <span className="text-[10px] text-muted-foreground">Listening...</span>
                  </div>
                )}
                {recordingState === "paused" && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <Pause className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Paused</span>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
