import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import type { SummaryData } from "@/components/EditableSummary";

const BUILTIN_TEMPLATES = [
  { id: "general", name: "General", icon: "📋" },
  { id: "standup", name: "Standup", icon: "🏃" },
  { id: "one-on-one", name: "1:1", icon: "🤝" },
  { id: "brainstorm", name: "Brainstorm", icon: "💡" },
  { id: "customer-call", name: "Customer Call", icon: "📞" },
  { id: "interview", name: "Interview", icon: "🎯" },
  { id: "retrospective", name: "Retro", icon: "🔄" },
];

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

const generateLocalSummary = (
  notes: string,
  transcript: { speaker: string; time: string; text: string }[],
  hasSTTConfigured = false
) => {
  const notesSentences = notes
    .split(/[.!?\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
  const transcriptSentences = transcript.map(l => l.text.trim()).filter(s => s.length > 5);
  const allSentences = [...notesSentences, ...transcriptSentences];

  if (allSentences.length === 0) {
    return {
      overview: hasSTTConfigured
        ? "No content was captured during this session. Try speaking or check that microphone (and system audio) access is allowed."
        : "No content was captured during this session. Select an STT model in Settings > AI Models for live transcription, or speak and ensure mic access is allowed.",
      keyPoints: ["No transcript or notes were recorded"],
      nextSteps: hasSTTConfigured
        ? [{ text: "Speak or allow microphone access to capture transcript", assignee: "You", done: false }]
        : [{ text: "Configure an STT model in Settings > AI Models for live transcription", assignee: "You", done: false }],
    };
  }

  const overviewParts: string[] = [];
  if (notesSentences.length > 0) {
    overviewParts.push(`Personal notes: ${notesSentences.slice(0, 2).join(". ")}.`);
  }
  if (transcriptSentences.length > 0) {
    const duration = transcript.length > 0 ? transcript[transcript.length - 1].time : "0:00";
    const speakers = [...new Set(transcript.map(l => l.speaker))];
    overviewParts.push(
      `Transcript captured ${transcriptSentences.length} segment${transcriptSentences.length !== 1 ? "s" : ""} over ${duration} from ${speakers.join(", ")}.`
    );
    if (transcriptSentences.length >= 2) {
      overviewParts.push(`Topics discussed: ${transcriptSentences.slice(0, 3).join("; ")}.`);
    }
  }

  const keyPoints = allSentences
    .filter(s => s.length > 15)
    .slice(0, 6);

  const actionKeywords = /\b(need to|should|must|will|todo|action|follow up|schedule|finalize|review|complete|send|prepare|create|update|fix|check)\b/i;
  const actionItems = allSentences
    .filter(s => actionKeywords.test(s))
    .slice(0, 4)
    .map(s => ({ text: s, assignee: "You", done: false }));

  if (actionItems.length === 0) {
    actionItems.push({ text: "Review notes from this session", assignee: "You", done: false });
  }

  return {
    overview: overviewParts.join(" ") || "A session was recorded.",
    keyPoints: keyPoints.length > 0 ? keyPoints : ["Session captured but no distinct points identified"],
    nextSteps: actionItems,
  };
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function NewNotePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const eventState = location.state as { eventTitle?: string; eventId?: string } | null;
  const { activeSession, startSession, resumeSession, updateSession, clearSession, transcriptLines, isCapturing, usingWebSpeech, captureError, clearCaptureError, startAudioCapture, stopAudioCapture, pauseAudioCapture, resumeAudioCapture } = useRecording();
  const { selectedSTTModel, selectedAIModel } = useModelSettings();
  const api = getElectronAPI();

  const searchParams = new URLSearchParams(location.search);
  const existingSessionId = searchParams.get("session");
  const isReturning = !!(existingSessionId && activeSession && activeSession.noteId === existingSessionId);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>(() => {
    if (isReturning && activeSession) {
      return activeSession.isRecording ? "recording" : "paused";
    }
    return "recording";
  });
  const [transcriptVisible, setTranscriptVisible] = useState(isElectron);
  const [personalNotes, setPersonalNotes] = useState("");
  const [visibleLines, setVisibleLines] = useState(2);
  const [title, setTitle] = useState(() => eventState?.eventTitle || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"my-notes" | "ai-notes">("ai-notes");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [meetingTemplate, setMeetingTemplate] = useState("general");
  const meetingTemplateRef = useRef(meetingTemplate);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showRealTimeTranscript, setShowRealTimeTranscript] = useState(true);
  const [autoGenerateNotes, setAutoGenerateNotes] = useState(true);
  const [noteId, setNoteId] = useState(() => isReturning ? existingSessionId! : crypto.randomUUID());
  useEffect(() => {
    if (existingSessionId && noteId !== existingSessionId) setNoteId(existingSessionId);
  }, [existingSessionId]);
  const titleRef = useRef<HTMLInputElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef(transcriptLines);
  const lastGeneratedTranscriptLengthRef = useRef(-1);
  const lastGeneratedNotesRef = useRef("");
  const userPausedRef = useRef(false);
  const { folders, createFolder } = useFolders();
  const { addNote, deleteNote } = useNotes();
  const [customTemplates, setCustomTemplates] = useState<Array<{ id: string; name: string; prompt: string }>>([]);

  const MEETING_TEMPLATES = useMemo(() => {
    const custom = customTemplates.map(ct => ({ id: ct.id, name: ct.name, icon: "📝" }));
    return [...BUILTIN_TEMPLATES, ...custom];
  }, [customTemplates]);

  useEffect(() => {
    if (!api) return;
    api.db.settings.get('custom-templates').then((val: string | null) => {
      if (val) {
        try { setCustomTemplates(JSON.parse(val)); } catch {}
      }
    });
  }, []);

  useEffect(() => {
    if (!api) return;
    api.db.settings.get('real-time-transcription').then(val => {
      if (val !== null) setShowRealTimeTranscript(JSON.parse(val));
    }).catch(() => {});
    api.db.settings.get('auto-generate-notes').then(val => {
      if (val !== null) setAutoGenerateNotes(JSON.parse(val));
    }).catch(() => {});
  }, []);

  const usingRealAudio = isElectron;
  const elapsedSeconds = activeSession?.elapsedSeconds ?? 0;
  const currentTranscript = usingRealAudio ? transcriptLines : fakeTranscriptLines.slice(0, visibleLines);

  useEffect(() => { transcriptRef.current = transcriptLines; }, [transcriptLines]);
  useEffect(() => { meetingTemplateRef.current = meetingTemplate; }, [meetingTemplate]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  useEffect(() => {
    // If we have an active session but no session in URL, preserve it so timer and state continue
    if (!existingSessionId && activeSession?.noteId) {
      navigate(`/new-note?session=${activeSession.noteId}`, { replace: true });
      return;
    }
    if (!isReturning) {
      // Stop any previous recording before starting a new one
      if (activeSession?.isRecording && usingRealAudio) {
        stopAudioCapture().catch(console.error);
      }
      startSession(noteId);
      if (usingRealAudio) {
        startAudioCapture(selectedSTTModel || '').catch((err) => {
          console.error('Audio capture failed:', err);
        });
      }
    } else if (activeSession) {
      setTitle(activeSession.title === "New note" ? "" : activeSession.title);
      if (activeSession.isRecording) {
        setRecordingState("recording");
      }
    }
    return () => {};
  }, []);

  // Keep the session title synced with local title state
  useEffect(() => {
    if (recordingState !== "recording") return;
    updateSession({ isRecording: true, title: title || "New note" });
  }, [recordingState, title, updateSession]);

  // Sync recording state with auto-pause/resume from main process
  // Auto-pause from silence detection auto-generates notes. Do not overwrite user-initiated pause when main state is delayed.
  useEffect(() => {
    if (recordingState === "stopped") return;
    if (activeSession && !activeSession.isRecording && recordingState === "recording") {
      userPausedRef.current = false;
      setRecordingState("paused");
      // Auto-paused by main process (silence detection) -- auto-generate notes if enabled
      if (autoGenerateNotes && !isSummarizing && (transcriptRef.current.length > 0 || (typeof personalNotes === 'string' && personalNotes.trim().length > 0))) {
        generateNotes();
      }
    } else if (activeSession && activeSession.isRecording && recordingState === "paused" && !userPausedRef.current) {
      setRecordingState("recording");
    }
  }, [activeSession?.isRecording]);

  // Simulate live transcription for web mode only
  useEffect(() => {
    if (usingRealAudio) return;
    if (recordingState !== "recording") return;
    if (visibleLines >= fakeTranscriptLines.length) return;
    const timer = setInterval(() => {
      setVisibleLines((prev) => Math.min(prev + 1, fakeTranscriptLines.length));
    }, 3000);
    return () => clearInterval(timer);
  }, [recordingState, visibleLines, usingRealAudio]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleLines, transcriptLines.length]);

  useEffect(() => {
    if (isEditingTitle) titleRef.current?.select();
  }, [isEditingTitle]);

  const generateNotes = useCallback(async () => {
    if (isSummarizing) return;
    setIsSummarizing(true);
    setTranscriptVisible(true);
    const noteTitle = title || "Meeting notes";
    if (!title) setTitle(noteTitle);

    const finalTranscript = usingRealAudio ? transcriptRef.current : fakeTranscriptLines;

    let generatedSummary: SummaryData;
    if (api && selectedAIModel) {
      try {
        const templateId = meetingTemplateRef.current;
        const customPrompt = await api.db.settings.get(`template-prompt-${templateId}`).catch(() => null);
        generatedSummary = await api.llm.summarize({
          transcript: finalTranscript,
          personalNotes,
          model: selectedAIModel,
          meetingTemplateId: templateId,
          customPrompt: customPrompt || undefined,
        });
      } catch (err) {
        console.error('LLM summarization failed, using local fallback:', err);
        generatedSummary = generateLocalSummary(personalNotes, finalTranscript, !!selectedSTTModel);
      }
    } else {
      await new Promise(r => setTimeout(r, 1500));
      generatedSummary = generateLocalSummary(personalNotes, finalTranscript, !!selectedSTTModel);
    }

    lastGeneratedTranscriptLengthRef.current = finalTranscript.length;
    lastGeneratedNotesRef.current = personalNotes;
    setSummary(generatedSummary);
    setIsSummarizing(false);

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    addNote({
      id: noteId,
      title: generatedSummary.title || noteTitle,
      date: dateStr,
      time: timeStr,
      duration: formatTime(elapsedSeconds),
      personalNotes,
      transcript: finalTranscript,
      summary: generatedSummary,
      folderId: selectedFolderId,
    });
    if (generatedSummary.title && generatedSummary.title !== noteTitle) {
      setTitle(generatedSummary.title);
    }
  }, [title, personalNotes, noteId, elapsedSeconds, selectedFolderId, addNote, api, selectedAIModel, usingRealAudio, isSummarizing]);

  const handleEndMeeting = useCallback(async () => {
    setRecordingState("stopped");

    if (usingRealAudio) {
      await stopAudioCapture();
      await new Promise(r => setTimeout(r, 500));
    }

    await generateNotes();
    clearSession();
  }, [usingRealAudio, stopAudioCapture, generateNotes, clearSession]);

  const handleResume = useCallback(() => {
    userPausedRef.current = false;
    setRecordingState("recording");
    setTranscriptVisible(true);
    if (recordingState === "stopped") {
      // Restore session without clearing transcript, then restart capture so new chunks append
      resumeSession(noteId, title || "New note", elapsedSeconds);
      setSummary(null);
      if (usingRealAudio) {
        startAudioCapture(selectedSTTModel || '').catch(console.error);
      }
    } else {
      setSummary(null);
      if (usingRealAudio) {
        resumeAudioCapture(selectedSTTModel || '').catch(console.error);
      }
    }
  }, [recordingState, resumeSession, noteId, title, elapsedSeconds, usingRealAudio, startAudioCapture, resumeAudioCapture, selectedSTTModel]);

  const handleViewModeChange = useCallback(async (mode: "my-notes" | "ai-notes") => {
    if (mode === "ai-notes" && viewMode === "my-notes") {
      setIsSummarizing(true);
      const finalTranscript = usingRealAudio ? transcriptLines : fakeTranscriptLines;

      if (api && selectedAIModel) {
        try {
          const tid = meetingTemplateRef.current;
          const cp = await api.db.settings.get(`template-prompt-${tid}`).catch(() => null);
          const newSummary = await api.llm.summarize({
            transcript: finalTranscript,
            personalNotes,
            model: selectedAIModel,
            meetingTemplateId: tid,
            customPrompt: cp || undefined,
          });
          setSummary(newSummary);
        } catch {
          setSummary(generateLocalSummary(personalNotes, finalTranscript, !!selectedSTTModel));
        }
      } else {
        await new Promise(r => setTimeout(r, 1200));
        setSummary(generateLocalSummary(personalNotes, finalTranscript, !!selectedSTTModel));
      }
      setIsSummarizing(false);
    }
    setViewMode(mode);
  }, [viewMode, personalNotes, api, selectedAIModel, usingRealAudio, transcriptLines, meetingTemplate]);

  const handleCreateAndAssign = () => {
    if (newFolderName.trim()) {
      const folder = createFolder(newFolderName.trim());
      setSelectedFolderId(folder.id);
      setNewFolderName("");
      setCreatingFolder(false);
      setShowFolderPicker(false);
    }
  };

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
  const showSummaryPanel = (recordingState === "paused" || recordingState === "stopped") && (summary || isSummarizing);

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
        {/* Top bar — pl-20 clears macOS traffic lights when sidebar is collapsed */}
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
              onClick={() => navigate("/")}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back to notes
            </button>
          </div>
          {showSummaryPanel && (
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

        {/* Capture error banner — mic / system audio not allowed or worklet failed */}
        {captureError && (
          <div className="mx-4 mt-2 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <p className="flex-1 min-w-0">{captureError}</p>
            <button
              type="button"
              onClick={() => { clearCaptureError(); }}
              className="flex-shrink-0 rounded p-1 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden">
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
                  {showSummaryPanel && (
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

                {/* Content: recording vs paused/stopped with notes */}
                {!showSummaryPanel ? (
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

            <div className="relative">
              <AskBar
                context="meeting"
                meetingTitle={title || "New note"}
                recordingState={recordingState}
                transcriptVisible={transcriptVisible}
                onResumeRecording={handleResume}
                onPauseRecording={() => {
                  userPausedRef.current = true;
                  setRecordingState("paused");
                  if (usingRealAudio) {
                    pauseAudioCapture().catch(console.error);
                  }
                  if (transcriptRef.current.length > 0 || personalNotes.trim().length > 0) {
                    generateNotes();
                  }
                }}
                onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                elapsed={elapsed}
              />
            </div>
          </div>

          {/* Transcript side panel — hidden during active recording if real-time transcription is off */}
          {transcriptVisible && (showRealTimeTranscript || recordingState !== "recording") && (
            <div className="w-72 flex-shrink-0 border-l border-border bg-card/50 overflow-y-auto rounded-tl-2xl rounded-tr-2xl">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {recordingState === "recording" ? "Live Transcript" : "Transcript"}
                  </span>
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
                {currentTranscript
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
                {!transcriptSearch && recordingState === "recording" && usingRealAudio && !selectedSTTModel && (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 mb-2">
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed">
                      <Mic className="h-3 w-3 inline mr-1 -mt-0.5" />
                      {usingWebSpeech
                        ? <>Using browser speech recognition. For better accuracy, download a Whisper model in <strong>Settings → Transcription</strong>.</>
                        : <>No STT model configured. Go to <strong>Settings → Transcription</strong> to download a Whisper model or connect a cloud STT provider.</>
                      }
                    </p>
                  </div>
                )}
                {!transcriptSearch && recordingState === "recording" && (
                  <div className="flex items-center gap-1.5 pt-1 animate-pulse">
                    <div className="h-1 w-1 rounded-full bg-destructive" />
                    <span className="text-[10px] text-muted-foreground">
                      {usingRealAudio && isCapturing
                        ? (usingWebSpeech ? "Listening (browser speech recognition)..." : "Listening to mic & system audio...")
                        : "Listening..."}
                    </span>
                  </div>
                )}
                {!transcriptSearch && recordingState === "paused" && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <Pause className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Paused</span>
                  </div>
                )}
                {transcriptSearch && currentTranscript.filter(l => l.text.toLowerCase().includes(transcriptSearch.toLowerCase())).length === 0 && (
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
