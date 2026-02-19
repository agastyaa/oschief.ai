import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { AskBar } from "@/components/AskBar";
import {
  Mic, MicOff, Pause, Play, Eye, EyeOff, Square,
  PanelLeftClose, PanelLeft, MoreHorizontal, Share2,
  Calendar, Users, Plus, FolderOpen, Check, X
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
  const titleRef = useRef<HTMLInputElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const { folders, createFolder } = useFolders();

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

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

  const handleStop = () => {
    setRecordingState("stopped");
    setTranscriptVisible(false);
  };

  const handleCreateAndAssign = () => {
    if (newFolderName.trim()) {
      const folder = createFolder(newFolderName.trim());
      setSelectedFolderId(folder.id);
      setNewFolderName("");
      setCreatingFolder(false);
      setShowFolderPicker(false);
    }
  };

  const elapsedSeconds = visibleLines * 6;
  const elapsed = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Collapsible sidebar */}
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
        sidebarOpen ? "w-56" : "w-0"
      )}>
        <Sidebar />
      </div>

      <main className="flex flex-1 flex-col min-w-0">
        {/* Top bar with back button */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border">
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

          {/* Recording controls */}
          <div className="flex items-center gap-2">
            {recordingState !== "stopped" && (
              <>
                <div className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
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
                  <span>{elapsed}</span>
                </div>

                <button
                  onClick={() => setTranscriptVisible(!transcriptVisible)}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {transcriptVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {transcriptVisible ? "Hide" : "Show"}
                </button>

                {recordingState === "recording" ? (
                  <button
                    onClick={() => setRecordingState("paused")}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Pause className="h-3 w-3" />
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={() => setRecordingState("recording")}
                    className="flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
                  >
                    <Play className="h-3 w-3" />
                    Resume
                  </button>
                )}

                <button
                  onClick={handleStop}
                  className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              </>
            )}

            {recordingState === "stopped" && (
              <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <MicOff className="h-3 w-3" />
                Recording ended · {elapsed}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main notes panel */}
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
                  className="mb-3 w-full font-display text-3xl text-foreground bg-transparent border-none outline-none focus:ring-0"
                  placeholder="New note"
                />
              ) : (
                <h1
                  onClick={() => setIsEditingTitle(true)}
                  className={cn(
                    "mb-3 font-display text-3xl cursor-text transition-colors",
                    title ? "text-foreground hover:text-foreground/80" : "text-foreground/40 hover:text-foreground/60"
                  )}
                >
                  {title || "New note"}
                </h1>
              )}

              {/* Meta chips */}
              <div className="flex items-center gap-2 mb-6 relative">
                <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                  <Calendar className="h-3 w-3" />
                  Today
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                  <Users className="h-3 w-3" />
                  Me
                </span>

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
              </div>

              {/* Notes textarea */}
              <textarea
                value={personalNotes}
                onChange={(e) => setPersonalNotes(e.target.value)}
                placeholder="Write notes..."
                className="min-h-[60vh] w-full resize-none bg-transparent text-[15px] text-foreground leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* Live transcript side panel */}
          {transcriptVisible && recordingState !== "stopped" && (
            <div className="w-72 flex-shrink-0 border-l border-border bg-card/50 overflow-y-auto">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Live Transcript
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
                {fakeTranscriptLines.slice(0, visibleLines).map((line, i) => (
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
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Ask bar */}
        <div className="relative">
          <AskBar context="meeting" meetingTitle={title || "New note"} />
        </div>
      </main>
    </div>
  );
}
