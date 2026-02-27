import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { AskBar } from "@/components/AskBar";
import { EditableSummary } from "@/components/EditableSummary";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import { useNotes } from "@/contexts/NotesContext";
import { useRecording } from "@/contexts/RecordingContext";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { PanelLeftClose, PanelLeft, Share2, MoreHorizontal, FileText, Hash, Calendar, Clock, EyeOff, Eye, Search, X, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { groupTranscriptBySpeaker } from "@/lib/transcript-utils";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { toast } from "sonner";

const BUILTIN_TEMPLATES = [
  { id: "general", name: "General", icon: "📋" },
  { id: "standup", name: "Standup", icon: "🏃" },
  { id: "one-on-one", name: "1:1", icon: "🤝" },
  { id: "brainstorm", name: "Brainstorm", icon: "💡" },
  { id: "customer-call", name: "Customer Call", icon: "📞" },
  { id: "interview", name: "Interview", icon: "🎯" },
  { id: "retrospective", name: "Retro", icon: "🔄" },
];

export default function NoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notes, updateNote } = useNotes();
  const { activeSession, resumeSession, updateSession, clearSession } = useRecording();
  const { selectedAIModel } = useModelSettings();
  const api = getElectronAPI();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"my-notes" | "ai-notes">("ai-notes");
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [recordingState, setRecordingState] = useState<"recording" | "paused" | "stopped">("stopped");
  const [elapsed, setElapsed] = useState(0);
  const [newLines, setNewLines] = useState<{ speaker: string; time: string; text: string }[]>([]);
  const [meetingTemplate, setMeetingTemplate] = useState("general");
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const displayElapsedRef = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const userHasEditedTitleRef = useRef(false);

  // Timer logic: use activeSession.elapsedSeconds when we have an active session for this note; otherwise local state
  const displayElapsed = activeSession?.noteId === id ? (activeSession.elapsedSeconds ?? 0) : elapsed;
  displayElapsedRef.current = displayElapsed;
  useEffect(() => {
    const hasActiveSessionForNote = activeSession?.noteId === id;
    if (recordingState === "recording" && !hasActiveSessionForNote) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recordingState, activeSession?.noteId, id]);

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
        const time = formatElapsed(displayElapsedRef.current);
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
    setRecordingState("recording");
    setTranscriptVisible(true);
    if (id && note) {
      const initialElapsed = parseDuration(note.duration || "0:00");
      resumeSession(id, note.title || "Note", initialElapsed);
    }
  };

  const handleStop = () => {
    setRecordingState("stopped");
    clearSession();
    // Append new lines to the saved note
    if (id && newLines.length > 0) {
      const note = notes.find((n) => n.id === id);
      if (note) {
        const finalElapsed = activeSession?.noteId === id ? (activeSession.elapsedSeconds ?? 0) : elapsed;
        updateNote(id, {
          transcript: [...note.transcript, ...newLines],
          duration: formatElapsed(finalElapsed),
        });
      }
    }
  };

  const note = notes.find((n) => n.id === id);

  const handleTitleSave = useCallback((newTitle: string) => {
    if (id && newTitle.trim() !== (note?.title || "").trim()) {
      userHasEditedTitleRef.current = true;
      updateNote(id, { title: newTitle.trim() || note?.title || "Meeting Notes" });
    }
  }, [id, note?.title, updateNote]);

  const handleRegenerate = useCallback(async (templateId?: string) => {
    if (!id || !note || !api || !selectedAIModel) {
      toast.error("Select an AI model in Settings to regenerate the summary.");
      return;
    }
    const transcript = note.transcript || [];
    if (transcript.length === 0 && !(note.personalNotes || "").trim()) {
      toast.error("No transcript or notes to summarize.");
      return;
    }
    const effectiveTemplateId = templateId ?? meetingTemplate;
    setIsSummarizing(true);
    try {
      const customPrompt = BUILTIN_TEMPLATES.some(t => t.id === effectiveTemplateId)
        ? undefined
        : (await api.db.settings.get(`template-prompt-${effectiveTemplateId}`).catch(() => null)) || undefined;
      const summary = await api.llm.summarize({
        transcript,
        personalNotes: note.personalNotes || "",
        model: selectedAIModel,
        meetingTemplateId: effectiveTemplateId,
        customPrompt,
        meetingTitle: note.title?.trim() || undefined,
      });
      // Granola-style: update title from regenerated summary when we have a meaningful one (never overwrite user edits)
      const updates: { summary: typeof summary; title?: string } = { summary };
      const genericTitles = ["meeting notes", "this meeting", "untitled", "untitled meeting"];
      const isGeneric = (t: string) => genericTitles.includes((t || "").toLowerCase());
      if (!userHasEditedTitleRef.current && summary.title && summary.title !== note.title && !isGeneric(summary.title)) {
        updates.title = summary.title;
      }
      updateNote(id, updates);
      toast.success("Summary regenerated.");
    } catch (err: any) {
      console.error("Regenerate summary failed:", err);
      toast.error("Summary failed. Try again.");
    } finally {
      setIsSummarizing(false);
    }
  }, [id, note, api, selectedAIModel, meetingTemplate, updateNote]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (templateMenuRef.current && !templateMenuRef.current.contains(target)) setShowTemplateMenu(false);
    };
    if (showTemplateMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTemplateMenu]);

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
                {/* Title — editable */}
                {isEditingTitle ? (
                  <input
                    ref={titleRef}
                    defaultValue={note.title}
                    onBlur={(e) => {
                      handleTitleSave(e.target.value);
                      setIsEditingTitle(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleTitleSave((e.target as HTMLInputElement).value);
                        setIsEditingTitle(false);
                      }
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    autoFocus
                    className="mb-3 w-full font-display text-2xl text-foreground bg-transparent border-none outline-none focus:ring-0"
                    placeholder="Meeting title"
                  />
                ) : (
                  <h1
                    onClick={() => setIsEditingTitle(true)}
                    className={cn(
                      "mb-3 font-display text-2xl cursor-text transition-colors leading-tight",
                      (note.title || "").trim() ? "text-foreground hover:text-foreground/80" : "text-foreground/40 hover:text-foreground/60"
                    )}
                  >
                    {note.title || "Meeting title"}
                  </h1>
                )}

                {/* Meta chips — date, time, then My note / AI + template (only when summary exists and not regenerating) */}
                <div className="flex items-center gap-2 mb-6 flex-wrap">
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                    <Calendar className="h-3 w-3" />
                    {note.date}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                    <Clock className="h-3 w-3" />
                    {note.timeRange ?? note.duration}
                  </span>
                  {note.summary && !isSummarizing && (
                    <>
                      <NotesViewToggle
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        transcriptVisible={transcriptVisible}
                        onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                      />
                      <div ref={templateMenuRef} className="relative flex items-center gap-0.5">
                        <button
                          onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                          className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-foreground hover:bg-secondary transition-colors"
                          title="Regenerate with different template"
                        >
                          <span>{BUILTIN_TEMPLATES.find((t) => t.id === meetingTemplate)?.icon ?? "📋"}</span>
                          <span className="max-w-[80px] truncate">{BUILTIN_TEMPLATES.find((t) => t.id === meetingTemplate)?.name ?? "General"}</span>
                          <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", showTemplateMenu && "rotate-180")} />
                        </button>
                        {showTemplateMenu && (
                          <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden py-1">
                            {BUILTIN_TEMPLATES.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => {
                                  setMeetingTemplate(t.id);
                                  setShowTemplateMenu(false);
                                  handleRegenerate(t.id);
                                }}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-secondary transition-colors"
                              >
                                <span className="flex items-center gap-2">
                                  <span>{t.icon}</span>
                                  <span>{t.name}</span>
                                </span>
                                {meetingTemplate === t.id && <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />}
                              </button>
                            ))}
                            <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border mt-1">Select a template to regenerate summary.</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
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
                hideTranscriptToggle={!!note.summary && !isSummarizing}
                noteContext={[
                  `Title: ${note.title}`,
                  note.personalNotes ? `Personal Notes: ${note.personalNotes}` : '',
                  note.summary?.overview ? `Overview: ${note.summary.overview}` : '',
                  note.transcript?.length ? `Transcript:\n${note.transcript.map((t: any) => `[${t.time}] ${t.speaker}: ${t.text}`).join('\n')}` : '',
                ].filter(Boolean).join('\n\n')}
                recordingState={recordingState}
                elapsed={recordingState !== "stopped" ? formatElapsed(displayElapsed) : undefined}
                transcriptVisible={transcriptVisible}
                onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                onResumeRecording={handleResume}
              />
            </div>
          </div>

          {/* Transcript side panel */}
          {transcriptVisible && (note.transcript.length > 0 || newLines.length > 0) && (
            <div className="w-[27rem] flex-shrink-0 border-l border-border bg-card/50 overflow-y-auto rounded-tl-2xl rounded-tr-2xl">
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
              <div className="p-4 space-y-4">
                {/* Grouped transcript blocks */}
                {(() => {
                  const allLines = [...note.transcript, ...newLines];
                  const filtered = allLines
                    .map((line, idx) => ({ line, originalIndex: idx }))
                    .filter(({ line }) => !transcriptSearch || line.text.toLowerCase().includes(transcriptSearch.toLowerCase()));
                  const groups = groupTranscriptBySpeaker(filtered.map(({ line, originalIndex }) => ({ ...line, originalIndex })));
                  const searchRegex = transcriptSearch ? new RegExp(`(${transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi") : null;
                  const totalSaved = note.transcript.length;
                  return groups.map((group) => {
                    const displayLabel = group.speaker === "You" ? "Me" : "Them";
                    const isNew = group.indices.some((i) => i >= totalSaved);
                    return (
                      <div key={group.indices.join("-")} className={isNew ? "animate-fade-in" : ""}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-medium text-foreground">
                            {displayLabel.charAt(0)}
                          </div>
                          <span className="text-[10px] font-medium text-foreground">{displayLabel}</span>
                        </div>
                        <p className="text-[12px] text-muted-foreground leading-relaxed pl-6">
                          {searchRegex ? (
                            group.text.split(searchRegex).map((part, j) =>
                              part.toLowerCase() === transcriptSearch.toLowerCase() ? (
                                <mark key={j} className="bg-accent/20 text-foreground rounded-sm px-0.5">{part}</mark>
                              ) : (
                                part
                              )
                            )
                          ) : (
                            group.text
                          )}
                        </p>
                      </div>
                    );
                  });
                })()}
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
