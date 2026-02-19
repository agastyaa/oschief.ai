import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { AskBar } from "@/components/AskBar";
import { EditableSummary } from "@/components/EditableSummary";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import {
  Mic, MicOff, Pause, Play, Eye, EyeOff, Square, Search,
  PanelLeftClose, PanelLeft, Share2, MoreHorizontal,
  Calendar, Clock, Users, Plus, FolderOpen, Check, X, Hash,
  CheckCircle2, Circle, Loader2, Copy, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFolders } from "@/contexts/FolderContext";
import { useNotes } from "@/contexts/NotesContext";
import { useRecording } from "@/contexts/RecordingContext";

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

const generateSummary = (notes: string, transcript: typeof fakeTranscriptLines) => {
  const transcriptText = transcript.map(l => l.text).join(" ");
  const combined = [notes, transcriptText].filter(Boolean).join(" ");
  
  // Simulate AI summarization based on content
  const sentences = combined.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const keyPoints = sentences.slice(0, Math.min(4, sentences.length)).map(s => s.trim());
  
  return {
    overview: combined.length > 100 
      ? `This session covered: ${combined.substring(0, 150).trim()}...`
      : "A brief session covering key discussion points.",
    keyPoints: keyPoints.length > 0 ? keyPoints : ["No key points identified yet"],
    nextSteps: [
      { text: "Review and finalize discussed items", assignee: "You", done: false },
      { text: "Follow up on action items", assignee: "You", done: false },
    ],
  };
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function NewNotePage() {
  const navigate = useNavigate();
  const { activeSession, startSession, updateSession, clearSession } = useRecording();
  
  // Check if returning to an existing session
  const searchParams = new URLSearchParams(window.location.search);
  const existingSessionId = searchParams.get("session");
  const isReturning = !!(existingSessionId && activeSession && activeSession.noteId === existingSessionId);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("recording");
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [personalNotes, setPersonalNotes] = useState("");
  const [visibleLines, setVisibleLines] = useState(2);
  const [title, setTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => isReturning && activeSession ? activeSession.elapsedSeconds : 0);
  const [viewMode, setViewMode] = useState<"my-notes" | "ai-notes">("ai-notes");
  const [summary, setSummary] = useState<ReturnType<typeof generateSummary> | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [noteId] = useState(() => isReturning ? existingSessionId! : crypto.randomUUID());
  const titleRef = useRef<HTMLInputElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const { folders, createFolder } = useFolders();
  const { addNote, deleteNote } = useNotes();

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  // Start recording session on mount (only if not returning to existing)
  useEffect(() => {
    if (!isReturning) {
      startSession(noteId);
    } else if (activeSession) {
      setTitle(activeSession.title === "New note" ? "" : activeSession.title);
    }
    return () => {};
  }, []);

  // Real-time timer + sync to recording context
  useEffect(() => {
    if (recordingState !== "recording") return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        updateSession({ elapsedSeconds: next, isRecording: true, title: title || "New note" });
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [recordingState, title, updateSession]);

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
    clearSession();
    setTranscriptVisible(true);
    const noteTitle = title || "Meeting notes";
    if (!title) setTitle(noteTitle);
    setIsSummarizing(true);
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    // Simulate AI processing delay
    setTimeout(() => {
      const generatedSummary = generateSummary(personalNotes, fakeTranscriptLines);
      setSummary(generatedSummary);
      setIsSummarizing(false);
      // Save note
      addNote({
        id: noteId,
        title: noteTitle,
        date: dateStr,
        time: timeStr,
        duration: formatTime(elapsedSeconds),
        personalNotes,
        transcript: fakeTranscriptLines,
        summary: generatedSummary,
        folderId: selectedFolderId,
      });
    }, 1500);
  }, [title, personalNotes, noteId, elapsedSeconds, selectedFolderId, addNote, clearSession]);

  const handleViewModeChange = useCallback((mode: "my-notes" | "ai-notes") => {
    if (mode === "ai-notes" && viewMode === "my-notes") {
      // Re-summarize when switching back to AI notes
      setIsSummarizing(true);
      setTimeout(() => {
        setSummary(generateSummary(personalNotes, fakeTranscriptLines));
        setIsSummarizing(false);
      }, 1200);
    }
    setViewMode(mode);
  }, [viewMode, personalNotes]);

  const handleCreateAndAssign = () => {
    if (newFolderName.trim()) {
      const folder = createFolder(newFolderName.trim());
      setSelectedFolderId(folder.id);
      setNewFolderName("");
      setCreatingFolder(false);
      setShowFolderPicker(false);
    }
  };

  // Close more menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreMenu]);

  const handleCopyText = () => {
    if (!summary) return;
    const text = [
      `# ${title}`,
      "",
      "## Meeting Overview",
      summary.overview,
      "",
      "## Key Points",
      ...summary.keyPoints.map((p) => `• ${p}`),
      "",
      "## Next Steps",
      ...summary.nextSteps.map((s) => `${s.done ? "✓" : "○"} ${s.text} — ${s.assignee}`),
    ].join("\n");
    navigator.clipboard.writeText(text);
    setShowMoreMenu(false);
  };

  const handleDeleteNote = () => {
    deleteNote(noteId);
    navigate("/");
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
              <NotesViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
              <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Share2 className="h-3.5 w-3.5" />
              </button>
              <div ref={moreMenuRef} className="relative">
                <button
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {showMoreMenu && (
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
                    <button
                      onClick={handleCopyText}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-secondary transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      Copy text
                    </button>
                    <div className="border-t border-border" />
                    <button
                      onClick={handleDeleteNote}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: main content + ask bar */}
          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex-1 overflow-y-auto pb-24">
              <div className="mx-auto max-w-3xl px-8 py-3">
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

                {/* Meta chips */}
                <div className="flex items-center gap-2 mb-6 flex-wrap relative">
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                    <Calendar className="h-3 w-3" />
                    Today
                  </span>
                  {isStopped && (
                    <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                      <Clock className="h-3 w-3" />
                      {elapsed}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                    <Users className="h-3 w-3" />
                    Me
                  </span>
                  {folderChip}
                </div>

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
                    ) : isSummarizing ? (
                      <div className="space-y-8 py-4">
                        {/* Shimmer: Overview */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-3.5 w-3.5 rounded bg-muted-foreground/10 animate-pulse" />
                            <div className="h-4 w-36 rounded bg-muted-foreground/10 animate-pulse" />
                          </div>
                          <div className="space-y-2 pl-6">
                            <div className="h-4 w-full rounded bg-muted-foreground/10 animate-pulse" />
                            <div className="h-4 w-4/5 rounded bg-muted-foreground/10 animate-pulse" />
                            <div className="h-4 w-3/5 rounded bg-muted-foreground/10 animate-pulse" />
                          </div>
                        </div>
                        {/* Shimmer: Key Points */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-3.5 w-3.5 rounded bg-muted-foreground/10 animate-pulse" />
                            <div className="h-4 w-24 rounded bg-muted-foreground/10 animate-pulse" />
                          </div>
                          <div className="space-y-2.5 pl-6">
                            {[1, 2, 3, 4].map((i) => (
                              <div key={i} className="flex items-center gap-2.5">
                                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/10 animate-pulse" />
                                <div className="h-4 rounded bg-muted-foreground/10 animate-pulse" style={{ width: `${70 - i * 10}%` }} />
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Shimmer: Next Steps */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="h-3.5 w-3.5 rounded bg-muted-foreground/10 animate-pulse" />
                            <div className="h-4 w-28 rounded bg-muted-foreground/10 animate-pulse" />
                          </div>
                          <div className="space-y-2.5 pl-6">
                            {[1, 2].map((i) => (
                              <div key={i} className="flex items-center gap-2.5">
                                <div className="h-4 w-4 rounded-full bg-muted-foreground/10 animate-pulse" />
                                <div className="h-4 rounded bg-muted-foreground/10 animate-pulse" style={{ width: `${55 - i * 10}%` }} />
                              </div>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground text-center animate-pulse">Generating summary...</p>
                      </div>
                    ) : (
                      <EditableSummary
                        summary={summary}
                        onUpdate={(updated) => setSummary(updated)}
                      />
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
                  startSession(noteId);
                }}
                onPauseRecording={() => setRecordingState("paused")}
                onStopRecording={handleStop}
                onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                elapsed={elapsed}
              />
            </div>
          </div>

          {/* Transcript side panel */}
          {transcriptVisible && (
            <div className="w-72 flex-shrink-0 border-l border-border bg-card/50 overflow-y-auto rounded-tl-2xl rounded-tr-2xl">
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
                {/* Search bar */}
                <div className="mt-2 flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                  <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <input
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder="Search transcript..."
                    className="flex-1 min-w-0 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  {transcriptSearch && (
                    <button onClick={() => setTranscriptSearch("")} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-3">
                {fakeTranscriptLines
                  .slice(0, isStopped ? fakeTranscriptLines.length : visibleLines)
                  .filter(line => !transcriptSearch || line.text.toLowerCase().includes(transcriptSearch.toLowerCase()))
                  .map((line, i) => (
                  <div key={i} className="animate-fade-in">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-medium text-foreground">
                        {line.speaker.charAt(0)}
                      </div>
                      <span className="text-[10px] font-medium text-foreground">{line.speaker}</span>
                      <span className="text-[10px] text-muted-foreground">{line.time}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed pl-6">
                      {transcriptSearch ? (
                        line.text.split(new RegExp(`(${transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, j) =>
                          part.toLowerCase() === transcriptSearch.toLowerCase() 
                            ? <mark key={j} className="bg-accent/20 text-foreground rounded-sm px-0.5">{part}</mark>
                            : part
                        )
                      ) : line.text}
                    </p>
                  </div>
                ))}
                {!transcriptSearch && recordingState === "recording" && (
                  <div className="flex items-center gap-1.5 pt-1 animate-pulse">
                    <div className="h-1 w-1 rounded-full bg-destructive" />
                    <span className="text-[10px] text-muted-foreground">Listening...</span>
                  </div>
                )}
                {!transcriptSearch && recordingState === "paused" && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <Pause className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Paused</span>
                  </div>
                )}
                {transcriptSearch && fakeTranscriptLines.filter(l => l.text.toLowerCase().includes(transcriptSearch.toLowerCase())).length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-4">No results found</p>
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
