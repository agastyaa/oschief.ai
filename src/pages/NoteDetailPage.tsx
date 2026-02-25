import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { AskBar } from "@/components/AskBar";
import { EditableSummary } from "@/components/EditableSummary";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import { useNotes } from "@/contexts/NotesContext";
import { useRecording } from "@/contexts/RecordingContext";
import { PanelLeftClose, PanelLeft, Share2, MoreHorizontal, FileText, Hash, Calendar, Clock, EyeOff, Eye, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron-api";

export default function NoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notes, updateNote } = useNotes();
  const { activeSession, startSession, updateSession, clearSession } = useRecording();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"my-notes" | "ai-notes">("ai-notes");
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [recordingState, setRecordingState] = useState<"recording" | "paused" | "stopped">("stopped");
  const [elapsed, setElapsed] = useState(0);
  const [newLines, setNewLines] = useState<{ speaker: string; time: string; text: string }[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer logic
  useEffect(() => {
    if (recordingState === "recording") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recordingState]);

  // Simulate new transcript lines while recording
  const simulatedLines = [
    "Continuing from where we left off...",
    "Let me add a few more thoughts on this topic.",
    "We should also consider the timeline for next steps.",
    "I think we can wrap up the remaining items quickly.",
  ];

  useEffect(() => {
    if (recordingState === "recording") {
      let lineIndex = 0;
      lineTimerRef.current = setInterval(() => {
        if (lineIndex >= simulatedLines.length) {
          if (lineTimerRef.current) clearInterval(lineTimerRef.current);
          return;
        }
        const time = formatElapsed(elapsed);
        setNewLines((prev) => [...prev, { speaker: "You", time, text: simulatedLines[lineIndex] }]);
        lineIndex++;
      }, 4000);
    } else if (lineTimerRef.current) {
      clearInterval(lineTimerRef.current);
      lineTimerRef.current = null;
    }
    return () => { if (lineTimerRef.current) clearInterval(lineTimerRef.current); };
  }, [recordingState]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const parseDuration = (dur: string) => {
    const parts = dur.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  };

  const handleResume = () => {
    if (elapsed === 0 && note) {
      setElapsed(parseDuration(note.duration));
    }
    setRecordingState("recording");
    setTranscriptVisible(true);
    if (id) startSession(id);
  };

  const handleStop = () => {
    setRecordingState("stopped");
    clearSession();
    // Append new lines to the saved note
    if (id && newLines.length > 0) {
      const note = notes.find((n) => n.id === id);
      if (note) {
        updateNote(id, {
          transcript: [...note.transcript, ...newLines],
          duration: formatElapsed(elapsed),
        });
      }
    }
  };

  const note = notes.find((n) => n.id === id);

  if (!note) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground mb-3">Note not found</p>
          <button onClick={() => navigate("/")} className="text-xs text-accent hover:underline">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
        sidebarOpen ? "w-56" : "w-0"
      )}>
        <Sidebar />
      </div>
      <main className="flex flex-1 flex-col min-w-0">
        <div className={cn(
          "flex items-center justify-between px-4 pt-3 pb-0",
          !sidebarOpen && isElectron && "pl-20"
        )}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigate(-1)}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back to notes
            </button>
          </div>
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
        {/* Content area with side panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: main content + ask bar */}
          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex-1 overflow-y-auto pb-24">
              <div className="mx-auto max-w-3xl px-8 py-3">
                {/* Title */}
                <h1 className="mb-3 font-display text-2xl text-foreground leading-tight">{note.title}</h1>

                {/* Meta chips */}
                <div className="flex items-center gap-2 mb-6 flex-wrap">
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                    <Calendar className="h-3 w-3" />
                    {note.date}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                    <Clock className="h-3 w-3" />
                    {note.timeRange ?? note.duration}
                  </span>
                </div>

                {viewMode === "ai-notes" ? (
                  <>
                    {note.summary ? (
                      <EditableSummary
                        summary={note.summary}
                        onUpdate={(updated) => {
                          if (id) updateNote(id, { summary: updated });
                        }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">No AI summary available for this note.</p>
                    )}
                  </>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <h2 className="font-display text-base font-semibold text-foreground/70">My Notes</h2>
                    </div>
                    <textarea
                      value={note.personalNotes || ""}
                      onChange={(e) => {
                        if (id) updateNote(id, { personalNotes: e.target.value });
                      }}
                      placeholder="Write your personal notes here..."
                      className="w-full min-h-[200px] resize-none bg-transparent text-[15px] text-foreground/70 leading-relaxed whitespace-pre-line pl-6 focus:outline-none placeholder:text-muted-foreground/50"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Ask bar */}
            <div className="relative">
              <AskBar
                context="meeting"
                meetingTitle={note.title}
                noteContext={[
                  `Title: ${note.title}`,
                  note.personalNotes ? `Personal Notes: ${note.personalNotes}` : '',
                  note.summary?.overview ? `Overview: ${note.summary.overview}` : '',
                  note.transcript?.length ? `Transcript:\n${note.transcript.map((t: any) => `[${t.time}] ${t.speaker}: ${t.text}`).join('\n')}` : '',
                ].filter(Boolean).join('\n\n')}
                recordingState={recordingState}
                elapsed={recordingState !== "stopped" ? formatElapsed(elapsed) : undefined}
                transcriptVisible={transcriptVisible}
                onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                onResumeRecording={handleResume}
              />
            </div>
          </div>

          {/* Transcript side panel */}
          {transcriptVisible && (note.transcript.length > 0 || newLines.length > 0) && (
            <div className="w-72 flex-shrink-0 border-l border-border bg-card/50 overflow-y-auto rounded-tl-2xl rounded-tr-2xl">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Transcript</span>
                  <button
                    onClick={() => setTranscriptVisible(false)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                </div>
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
                {/* Existing transcript lines */}
                {[...note.transcript, ...newLines]
                  .filter(line => !transcriptSearch || line.text.toLowerCase().includes(transcriptSearch.toLowerCase()))
                  .map((line, i) => (
                  <div key={i} className={i >= note.transcript.length ? "animate-fade-in" : ""}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-medium text-foreground">
                        {(line.speaker === "You" ? "Me" : "Them").charAt(0)}
                      </div>
                      <span className="text-[10px] font-medium text-foreground">{line.speaker === "You" ? "Me" : "Them"}</span>
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
                {recordingState === "recording" && !transcriptSearch && (
                  <div className="flex items-center gap-1.5 pt-1 animate-pulse">
                    <div className="h-1 w-1 rounded-full bg-destructive" />
                    <span className="text-[10px] text-muted-foreground">Listening...</span>
                  </div>
                )}
                {transcriptSearch && [...note.transcript, ...newLines].filter(l => l.text.toLowerCase().includes(transcriptSearch.toLowerCase())).length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-4">No results found</p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
