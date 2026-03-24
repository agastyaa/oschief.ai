import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sidebar, SidebarCollapseButton, SidebarCollapseRail, SidebarTopBarLeft } from "@/components/Sidebar";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { AskBar } from "@/components/AskBar";
import { EditableSummary } from "@/components/EditableSummary";
import { SummarySkeleton } from "@/components/SummarySkeleton";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import {
  Mic, MicOff, Pause, Play, Eye, EyeOff, Square, Search,
  Share2, MoreHorizontal,
  Calendar, Clock, Plus, FolderOpen, Check, X, Hash,
  CheckCircle2, Circle, Loader2, Copy, Trash2, ChevronDown, FileText, Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KBSuggestionsPanel, type KBSuggestion } from "@/components/KBSuggestionsPanel";
import { useFolders } from "@/contexts/FolderContext";
import { useNotes } from "@/contexts/NotesContext";
import { useRecording } from "@/contexts/RecordingContext";
import { useModelSettings, localModels } from "@/contexts/ModelSettingsContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { toast } from "sonner";
import type { SummaryData } from "@/components/EditableSummary";
import { groupTranscriptBySpeaker } from "@/lib/transcript-utils";
import { useNameMentionContext } from "@/hooks/useNameMentionContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { BUILTIN_TEMPLATES, BUILTIN_TEMPLATE_IDS } from "@/data/templates";
import { loadAccountFromStorage } from "@/lib/account-context";

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
      title: "Meeting Notes",
      overview: hasSTTConfigured
        ? "No content was captured during this session. Try speaking or check that microphone (and system audio) access is allowed."
        : "No content was captured during this session. Select an STT model in Settings > AI Models for live transcription, or speak and ensure mic access is allowed.",
      keyPoints: ["No transcript or notes were recorded"],
      nextSteps: hasSTTConfigured
        ? [{ text: "Speak or allow microphone access to capture transcript", assignee: "", done: false }]
        : [{ text: "Configure an STT model in Settings > AI Models for live transcription", assignee: "", done: false }],
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
    .map(s => ({ text: s, assignee: "", done: false }));

  if (actionItems.length === 0) {
    actionItems.push({ text: "Review notes from this session", assignee: "", done: false });
  }

  // Derive a title from first substantial sentence (Granola-style auto-name fallback)
  const firstSubstantial = allSentences.find((s) => s.length > 20);
  const derivedTitle = firstSubstantial
    ? firstSubstantial.length > 50
      ? firstSubstantial.slice(0, 47).trim() + "..."
      : firstSubstantial
    : "Meeting Notes";

  return {
    title: derivedTitle,
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

function formatTimeRange(startTimeMs: number, durationSeconds: number): string {
  const start = new Date(startTimeMs);
  const end = new Date(startTimeMs + durationSeconds * 1000);
  const fmt = { hour: "numeric" as const, minute: "2-digit" as const, hour12: true };
  return `${start.toLocaleTimeString("en-US", fmt)} – ${end.toLocaleTimeString("en-US", fmt)}`;
}

function isPlaceholderSummary(s: SummaryData | null): boolean {
  if (!s) return true;
  const o = (s.overview || "").toLowerCase();
  return (
    o.includes("no content was captured") ||
    o.includes("no transcript or notes") ||
    o.includes("select an stt model")
  );
}

export default function NewNotePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const eventState = location.state as { eventTitle?: string; eventId?: string; joinLink?: string; startFresh?: boolean; triggerPauseAndSummarize?: boolean } | null;
  const { activeSession, startSession, resumeSession, updateSession, clearSession, transcriptLines, removeTranscriptLineAt, removeTranscriptLinesAt, isCapturing, usingWebSpeech, captureError, clearCaptureError, sttStatus, sttErrorMessage, lastSuccessfulTranscriptTime, startAudioCapture, stopAudioCapture, pauseAudioCapture, resumeAudioCapture, setSessionScratch, getSessionScratch } = useRecording();
  const { selectedSTTModel, selectedAIModel, useLocalModels } = useModelSettings();
  const api = getElectronAPI();

  const searchParams = new URLSearchParams(location.search);
  const existingSessionId = searchParams.get("session");
  const isReturning = !!(existingSessionId && activeSession && activeSession.noteId === existingSessionId);
  const startFreshFromUrl = searchParams.get("startFresh") === "1";
  const startFresh = eventState?.startFresh === true || startFreshFromUrl;

  const { sidebarOpen } = useSidebarVisibility();
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
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const [showRealTimeTranscript, setShowRealTimeTranscript] = useState(true);
  const [autoGenerateNotes, setAutoGenerateNotes] = useState(true);
  const [noteId, setNoteId] = useState(() => isReturning ? existingSessionId! : crypto.randomUUID());
  /** Granola-style: only start mic when user explicitly clicks Start. Prevents mic use when app opens or meeting detected. */
  const [userHasStartedCapture, setUserHasStartedCapture] = useState(false);
  const [kbSuggestions, setKbSuggestions] = useState<KBSuggestion[]>([]);
  const [kbVisible, setKbVisible] = useState(true);
  const [kbLoading, setKbLoading] = useState(false);
  const kbHasFolder = useRef(false);
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
  /** Fire `generateNotes` once 3s after explicit pause when no real summary yet. */
  const pauseAutoSummaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredPauseAndSummarizeRef = useRef(false);
  const lastStartFreshKeyRef = useRef<string | null>(null);
  /** Granola-style: if user manually edited title, don't overwrite with AI-generated one */
  const userHasEditedTitleRef = useRef(false);
  const { folders, createFolder } = useFolders();
  const { addNote, deleteNote } = useNotes();
  const [customTemplates, setCustomTemplates] = useState<Array<{ id: string; name: string; prompt: string }>>([]);

  const MEETING_TEMPLATES = useMemo(() => {
    const custom = customTemplates.map(ct => ({ id: ct.id, name: ct.name, icon: "📝" }));
    return [...BUILTIN_TEMPLATES, ...custom];
  }, [customTemplates]);

  const activeSTTLabel = useMemo(() => {
    if (!selectedSTTModel) return null;
    if (selectedSTTModel === "system:default") return "Apple Speech (macOS)";
    if (selectedSTTModel.startsWith("local:")) {
      const id = selectedSTTModel.slice(6);
      const m = localModels.find(m => m.id === id && m.type === "stt");
      return m ? m.name : id.replace(/-/g, " ");
    }
    const [provider, ...rest] = selectedSTTModel.split(":");
    const model = rest.join(":");
    return provider && model ? `${provider.charAt(0).toUpperCase() + provider.slice(1)} ${model}` : selectedSTTModel;
  }, [selectedSTTModel]);

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
  const elapsedSeconds = useElapsedTime(activeSession?.startTime ?? null, activeSession?.isRecording ?? false);
  const currentTranscript = usingRealAudio ? transcriptLines : fakeTranscriptLines.slice(0, visibleLines);

  // Build context string for AskBar so it can answer questions about the live meeting
  const askBarNoteContext = useMemo(() => {
    const lines = (usingRealAudio ? transcriptLines : fakeTranscriptLines)
      .map(l => `[${l.speaker}] ${l.text}`).join('\n');
    const parts: string[] = [];
    if (personalNotes.trim()) parts.push(`USER NOTES:\n${personalNotes.trim()}`);
    if (lines) parts.push(`TRANSCRIPT:\n${lines}`);
    return parts.join('\n\n') || undefined;
  }, [usingRealAudio, transcriptLines, personalNotes]);

  const { mentionHint, mentionHintLoading, onDismissMentionHint, triggerMentionLLM } = useNameMentionContext(
    transcriptLines,
    recordingState,
    selectedAIModel,
    title || "New note",
    usingRealAudio,
    noteId
  );

  // Tick every 10s while recording so we can show "no transcription for a while" after 45s
  const [, setStaleTick] = useState(0);
  useEffect(() => {
    if (recordingState !== "recording" || !selectedSTTModel) return;
    const id = setInterval(() => setStaleTick((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, [recordingState, selectedSTTModel]);

  const sttStale =
    recordingState === "recording" &&
    !!selectedSTTModel &&
    ((lastSuccessfulTranscriptTime != null && Date.now() - lastSuccessfulTranscriptTime > 45000) ||
      (lastSuccessfulTranscriptTime == null && elapsedSeconds > 45));

  /** Show prominent "no transcript" warning when session has run 2+ min with zero transcript (recording or paused). */
  const noTranscriptYet =
    (recordingState === "recording" || recordingState === "paused") &&
    transcriptLines.length === 0 &&
    elapsedSeconds >= 120;

  useEffect(() => { transcriptRef.current = transcriptLines; }, [transcriptLines]);
  useEffect(() => { meetingTemplateRef.current = meetingTemplate; }, [meetingTemplate]);

  // Check if KB folder is configured on mount
  useEffect(() => {
    api?.db.settings.get("kb-folder-path").then((p) => { kbHasFolder.current = !!p; });
  }, [api]);

  // Poll for KB suggestions every 30s while recording
  useEffect(() => {
    if (recordingState !== "recording" || !kbHasFolder.current || !api?.kb) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled || transcriptLines.length < 3) return;
      setKbLoading(true);
      try {
        const recent = transcriptLines
          .slice(-20)
          .map(l => `${l.speaker}: ${l.text}`)
          .join("\n");
        const results = await api.kb!.getLiveSuggestions(recent);
        if (!cancelled && results.length > 0) setKbSuggestions(results);
      } catch { /* ignore */ }
      if (!cancelled) setKbLoading(false);
    };

    poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [recordingState, transcriptLines.length, api]);

  // Sync personalNotes, title, and user-edited state to session scratch so indicator pause-and-summarize can restore when navigating back
  useEffect(() => {
    if (activeSession?.noteId) {
      setSessionScratch({ personalNotes, title: title || undefined, userEditedTitle: userHasEditedTitleRef.current });
    }
  }, [activeSession?.noteId, personalNotes, title, setSessionScratch]);

  useEffect(() => {
    if (!eventState?.triggerPauseAndSummarize) triggeredPauseAndSummarizeRef.current = false;
  }, [eventState?.triggerPauseAndSummarize]);

  const generateNotes = useCallback(async (override?: { personalNotes?: string; title?: string; noteId?: string }) => {
    if (isSummarizing) return;
    setIsSummarizing(true);
    setTranscriptVisible(true);
    const useNotes = override?.personalNotes ?? personalNotes;
    const useTitle = override?.title ?? title;
    const noteTitle = useTitle || "Meeting notes";
    if (!override && !useTitle) setTitle(noteTitle);

    const finalTranscript = usingRealAudio ? transcriptRef.current : fakeTranscriptLines;

    // Capture session-derived values before async work.
    // Do NOT call clearSession() here — the session must survive pause so the user
    // can resume. Session cleanup happens in handleEndMeeting's finally block (explicit stop)
    // or when navigating to a fresh note.
    const noteIdToSave = override?.noteId ?? noteId;
    const startTimeToUse = activeSession?.startTime;

    let generatedSummary: SummaryData;
    try {
      if (api && selectedAIModel) {
        try {
          const templateId = meetingTemplateRef.current;
          const customPrompt = BUILTIN_TEMPLATE_IDS.has(templateId)
            ? undefined
            : (await api.db.settings.get(`template-prompt-${templateId}`).catch(() => null)) || undefined;
          generatedSummary = await api.llm.summarize({
            transcript: finalTranscript,
            personalNotes: useNotes,
            model: selectedAIModel,
            meetingTemplateId: templateId,
            customPrompt,
            meetingTitle: (eventState?.eventTitle || useTitle || "").trim() || undefined,
            meetingDuration: formatTime(elapsedSeconds),
            accountDisplayName: loadAccountFromStorage().name?.trim() || undefined,
          });
        } catch (err) {
          console.error('LLM summarization failed, using local fallback:', err);
          generatedSummary = generateLocalSummary(useNotes, finalTranscript, !!selectedSTTModel);
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        generatedSummary = generateLocalSummary(useNotes, finalTranscript, !!selectedSTTModel);
      }

      lastGeneratedTranscriptLengthRef.current = finalTranscript.length;
      lastGeneratedNotesRef.current = useNotes;
      setSummary(generatedSummary);

      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const startTimeMs = startTimeToUse ?? now.getTime() - elapsedSeconds * 1000;
      const timeRange = formatTimeRange(startTimeMs, elapsedSeconds);

      const genericTitles = ["meeting notes", "this meeting", "untitled", "untitled meeting"];
      const isGenericTitle = (t: string) => genericTitles.includes((t || "").toLowerCase());
      const aiTitle = generatedSummary.title && !isGenericTitle(generatedSummary.title) ? generatedSummary.title : null;

      try {
        // Granola-style: use user's title if they manually edited; otherwise use AI-generated (never generic)
        const finalTitle = userHasEditedTitleRef.current
          ? useTitle || noteTitle
          : (aiTitle || noteTitle);
        addNote({
          id: noteIdToSave,
          title: finalTitle,
          date: dateStr,
          time: timeStr,
          duration: formatTime(elapsedSeconds),
          timeRange,
          calendarEventId: eventState?.eventId,
          personalNotes: useNotes,
          transcript: finalTranscript,
          summary: generatedSummary,
          folderId: selectedFolderId,
        });
        // Auto-extract entities (people, commitments, topics) in background — fire and forget
        if (api?.memory?.extractEntities && selectedAIModel) {
          api.memory.extractEntities({
            noteId: noteIdToSave,
            summary: generatedSummary,
            transcript: finalTranscript,
            model: selectedAIModel,
          }).then((result) => {
            if (result.ok) {
              console.log(`Entity extraction: ${result.peopleCount ?? 0} people, ${result.commitmentCount ?? 0} commitments, ${result.topicCount ?? 0} topics`);
            }
          }).catch((err) => {
            console.error('Entity extraction failed (non-blocking):', err);
          });
        }
      } catch (err) {
        console.error('Failed to save note:', err);
        toast.error("Note could not be saved. Check console.");
      }
      // Granola-style: only auto-update title from summary if user hasn't manually edited and we got a real title
      if (!userHasEditedTitleRef.current && generatedSummary.title && generatedSummary.title !== noteTitle && !isGenericTitle(generatedSummary.title)) {
        setTitle(generatedSummary.title);
      }
    } finally {
      setIsSummarizing(false);
    }
  }, [title, personalNotes, noteId, elapsedSeconds, selectedFolderId, addNote, api, selectedAIModel, usingRealAudio, isSummarizing, activeSession?.startTime, activeSession?.isRecording, activeSession, clearSession]);
  // Note: userHasEditedTitleRef is a ref, not in deps

  const generateNotesRef = useRef(generateNotes);
  useEffect(() => {
    generateNotesRef.current = generateNotes;
  }, [generateNotes]);

  // Auto-run summary 3s after explicit user pause (no click on Summary); cleared on resume / stop / real summary / unmount.
  useEffect(() => {
    const clearPauseTimer = () => {
      if (pauseAutoSummaryTimerRef.current != null) {
        clearTimeout(pauseAutoSummaryTimerRef.current);
        pauseAutoSummaryTimerRef.current = null;
      }
    };
    clearPauseTimer();

    const hasReal = !!summary && !isPlaceholderSummary(summary);
    if (
      recordingState !== "paused" ||
      hasReal ||
      isSummarizing ||
      !userPausedRef.current ||
      !autoGenerateNotes
    ) {
      return clearPauseTimer;
    }

    const hasContent =
      transcriptRef.current.length > 0 || personalNotes.trim().length > 0;
    if (!hasContent) {
      return clearPauseTimer;
    }

    pauseAutoSummaryTimerRef.current = setTimeout(() => {
      pauseAutoSummaryTimerRef.current = null;
      generateNotesRef
        .current()
        .catch((err) => {
          console.error("Auto summary failed:", err);
          toast.error("Summary failed. Try again.");
        });
    }, 3000);

    return clearPauseTimer;
  }, [recordingState, summary, isSummarizing]);

  // When indicator triggered "pause and summarize", we land here with state; run generateNotes with scratch and clear state
  useEffect(() => {
    if (!eventState?.triggerPauseAndSummarize || !activeSession?.noteId || existingSessionId !== activeSession.noteId) return;
    if (triggeredPauseAndSummarizeRef.current) return;
    triggeredPauseAndSummarizeRef.current = true;
    const scratch = getSessionScratch();
    setPersonalNotes(scratch.personalNotes ?? '');
    setTitle(scratch.title ?? activeSession.title ?? '');
    userHasEditedTitleRef.current = scratch.userEditedTitle ?? false;
    setRecordingState('paused');
    generateNotes({ personalNotes: scratch.personalNotes, title: scratch.title })
      .then(() => {
        navigate(location.pathname + location.search, { replace: true, state: {} });
      })
      .catch((err) => {
        console.error('Indicator pause-and-summarize failed:', err);
        toast.error('Summary failed. Try again.');
        navigate(location.pathname + location.search, { replace: true, state: {} });
      });
  }, [eventState?.triggerPauseAndSummarize, activeSession?.noteId, activeSession?.title, existingSessionId, getSessionScratch, generateNotes, navigate, location.pathname, location.search]);

  const selectedFolder = (folders ?? []).find((f) => f.id === selectedFolderId);

  useEffect(() => {
    try {
      // User explicitly chose "New note" / "Quick Note": stop previous session, run summary for it, then start fresh
      if (startFresh) {
        if (lastStartFreshKeyRef.current === location.key) return;
        lastStartFreshKeyRef.current = location.key;

        const hadSession = activeSession?.noteId;
        const hadContent = transcriptRef.current.length > 0 || (typeof personalNotes === "string" && personalNotes.trim().length > 0);
        const doStartNew = () => {
          clearSession();
          const newId = crypto.randomUUID();
          setNoteId(newId);
          userHasEditedTitleRef.current = false;
          setTitle(eventState?.eventTitle ?? "");
          setSummary(null);
          setPersonalNotes("");
          setRecordingState("recording");
          setViewMode("ai-notes");
          setUserHasStartedCapture(true); // User clicked Quick Note — explicit start
          startSession(newId);
          navigate(`/new-note?session=${newId}`, { replace: true });
          if (usingRealAudio) {
            const meetingTitle = (eventState?.eventTitle ?? title) || undefined;
            startAudioCapture(selectedSTTModel || "", { meetingTitle }).catch((err) => {
              console.error("Audio capture failed:", err);
              toast.error("Recording couldn't start. Check microphone and STT settings.");
            });
          }
        };
        if (hadSession && hadContent && usingRealAudio) {
          pauseAudioCapture()
            .catch(console.error)
            .then(() => { const s = getSessionScratch(); return generateNotes({ personalNotes: s.personalNotes, title: s.title, noteId: activeSession.noteId }); })
            .then(() => stopAudioCapture())
            .then(() => doStartNew())
            .catch((err) => {
              console.error("New note transition error:", err);
              doStartNew();
            });
        } else {
          if (hadSession && usingRealAudio) stopAudioCapture().catch(console.error);
          doStartNew();
        }
        return;
      }

      // Calendar "Meeting starting soon" notification click: start a new note for this event and start listening (do not redirect to any existing session)
      const fromCalendarNotification = (eventState?.eventId != null || !!eventState?.eventTitle) && !existingSessionId;
      if (fromCalendarNotification) {
        clearSession();
        const newId = crypto.randomUUID();
        setNoteId(newId);
        userHasEditedTitleRef.current = false;
        setTitle(eventState?.eventTitle ?? "");
        setSummary(null);
        setPersonalNotes("");
        setRecordingState("recording");
        setViewMode("ai-notes");
        setUserHasStartedCapture(true);
        startSession(newId);
        navigate(`/new-note?session=${newId}`, { replace: true });
        if (usingRealAudio) {
          const meetingTitle = (eventState?.eventTitle ?? eventState?.eventId) || undefined;
          startAudioCapture(selectedSTTModel || "", { meetingTitle }).catch((err) => {
            console.error("Audio capture failed:", err);
            toast.error("Recording couldn't start. Check microphone and STT settings.");
          });
        }
        return;
      }

      // If we have an active session but no session in URL, preserve it so timer and state continue
      if (!existingSessionId && activeSession?.noteId) {
        navigate(`/new-note?session=${activeSession.noteId}`, { replace: true });
        return;
      }
      if (!isReturning) {
        if (activeSession?.isRecording && usingRealAudio) {
          stopAudioCapture().catch(console.error);
        }
        startSession(noteId);
        // Auto-start when: Quick Note (startFresh) OR calendar/meeting entry (eventTitle/eventId)
        const shouldAutoStart = startFresh || !!(eventState?.eventTitle ?? eventState?.eventId);
        if (usingRealAudio && shouldAutoStart) {
          setUserHasStartedCapture(true);
          const meetingTitle = (eventState?.eventTitle ?? title) || undefined;
          startAudioCapture(selectedSTTModel || "", { meetingTitle }).catch((err) => {
            console.error("Audio capture failed:", err);
            toast.error("Recording couldn't start. Check microphone and STT settings.");
          });
        } else {
          setUserHasStartedCapture(false); // Require explicit "Start recording" click
        }
      } else if (activeSession) {
        const scratch = getSessionScratch();
        setTitle(scratch.title ?? (activeSession.title === "New note" ? "" : activeSession.title));
        userHasEditedTitleRef.current = scratch.userEditedTitle ?? false;
        setUserHasStartedCapture(true); // Returning to existing session — was already capturing
        if (activeSession.isRecording) {
          setRecordingState("recording");
        }
      }
    } catch (err) {
      console.error("NewNotePage mount error:", err);
    }
    return () => {};
  }, [location.key, startFresh, getSessionScratch]);

  // Keep the session title synced with local title state
  useEffect(() => {
    if (recordingState !== "recording") return;
    updateSession({ isRecording: true, title: title || "New note" });
  }, [recordingState, title, updateSession]);

  // Add/update draft note in list so it appears while recording (before summary is generated)
  useEffect(() => {
    if (
      !activeSession ||
      activeSession.noteId !== noteId ||
      !userHasStartedCapture ||
      (recordingState !== "recording" && recordingState !== "paused") ||
      summary ||
      isSummarizing
    )
      return;

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const startTimeMs = activeSession.startTime ?? now.getTime() - elapsedSeconds * 1000;
    const timeRange = formatTimeRange(startTimeMs, elapsedSeconds);

    addNote({
      id: noteId,
      title: title || "New note",
      date: dateStr,
      time: timeStr,
      duration: formatTime(elapsedSeconds),
      timeRange,
      calendarEventId: eventState?.eventId,
      personalNotes,
      transcript: transcriptLines,
      summary: null,
      folderId: selectedFolderId,
    });
  }, [
    activeSession,
    noteId,
    userHasStartedCapture,
    recordingState,
    title,
    personalNotes,
    transcriptLines,
    elapsedSeconds,
    summary,
    isSummarizing,
    selectedFolderId,
    addNote,
  ]);

  // Sync recording state with main process (auto-pause disabled — manual pause only)
  useEffect(() => {
    if (recordingState === "stopped") return;
    if (activeSession && !activeSession.isRecording && recordingState === "recording") {
      userPausedRef.current = false;
      setRecordingState("paused");
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

  // Re-summarize when user edits personal notes and we already have a summary (debounced)
  useEffect(() => {
    const hasSummary = summary?.overview != null && summary.overview !== "" || (summary?.keyPoints?.length ?? 0) > 0;
    if (!hasSummary || isSummarizing || personalNotes === lastGeneratedNotesRef.current) return;
    const t = setTimeout(() => {
      if (personalNotes.trim().length > 0 || transcriptRef.current.length > 0) {
        generateNotes();
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [personalNotes, summary?.overview, summary?.keyPoints?.length, isSummarizing, generateNotes]);

  const handleEndMeeting = useCallback(async () => {
    setRecordingState("stopped");

    if (usingRealAudio) {
      await stopAudioCapture();
      await new Promise(r => setTimeout(r, 500));
    }

    try {
      await generateNotes();
    } catch (err) {
      console.error("End meeting summary failed:", err);
      toast.error("Summary failed. Note may not be saved.");
    } finally {
      clearSession();
    }
  }, [usingRealAudio, stopAudioCapture, generateNotes, clearSession]);

  const handleResume = useCallback(() => {
    userPausedRef.current = false;

    // Cancel any pending auto-summary timer so it doesn't fire after resume
    if (pauseAutoSummaryTimerRef.current != null) {
      clearTimeout(pauseAutoSummaryTimerRef.current);
      pauseAutoSummaryTimerRef.current = null;
    }

    setRecordingState("recording");
    setTranscriptVisible(true);
    if (recordingState === "stopped") {
      // Restore session without clearing transcript, then restart capture so new chunks append
      resumeSession(noteId, title || "New note", elapsedSeconds);
      setSummary(null);
      setUserHasStartedCapture(true);
      if (usingRealAudio) {
        const meetingTitle = title || "New note" || undefined;
        startAudioCapture(selectedSTTModel || '', { meetingTitle }).catch(console.error);
      }
    } else {
      // Safety: if activeSession was somehow cleared during pause, restore it
      if (!activeSession) {
        resumeSession(noteId, title || "New note", elapsedSeconds);
      }
      setSummary(null);
      if (usingRealAudio) {
        resumeAudioCapture(selectedSTTModel || '').catch(console.error);
      }
    }
  }, [recordingState, resumeSession, noteId, title, elapsedSeconds, usingRealAudio, startAudioCapture, resumeAudioCapture, selectedSTTModel, activeSession]);

  const handleViewModeChange = useCallback(async (mode: "my-notes" | "ai-notes") => {
    if (mode === "ai-notes" && viewMode === "my-notes") {
      setIsSummarizing(true);
      const finalTranscript = usingRealAudio ? transcriptLines : fakeTranscriptLines;

      if (api && selectedAIModel) {
        try {
          const tid = meetingTemplateRef.current;
          const customPrompt = BUILTIN_TEMPLATE_IDS.has(tid)
            ? undefined
            : (await api.db.settings.get(`template-prompt-${tid}`).catch(() => null)) || undefined;
          const newSummary = await api.llm.summarize({
            transcript: finalTranscript,
            personalNotes,
            model: selectedAIModel,
            meetingTemplateId: tid,
            customPrompt,
            meetingTitle: (eventState?.eventTitle || title || "").trim() || undefined,
            meetingDuration: formatTime(elapsedSeconds),
            accountDisplayName: loadAccountFromStorage().name?.trim() || undefined,
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
      const target = e.target as Node;
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) setShowMoreMenu(false);
      if (templateMenuRef.current && !templateMenuRef.current.contains(target)) setShowTemplateMenu(false);
    };
    if (showMoreMenu || showTemplateMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreMenu, showTemplateMenu]);

  const handleCopyText = () => {
    if (!summary) return;
    const text = [
      `# ${title}`,
      "",
      "## Meeting Overview",
      summary.overview,
      "",
      "## Key Points",
      ...(summary.keyPoints ?? []).map((p) => `• ${p}`),
      "",
      "## Next Steps",
      ...(summary.nextSteps ?? summary.actionItems ?? []).map((s) => `${s.done ? "✓" : "○"} ${s.text} — ${s.assignee}`),
    ].join("\n");
    navigator.clipboard.writeText(text);
    setShowMoreMenu(false);
  };

  const handleDeleteNote = () => {
    deleteNote(noteId);
    navigate("/");
  };

  const elapsed = formatTime(elapsedSeconds);
  const displayTimeRange =
    activeSession?.startTime != null
      ? formatTimeRange(activeSession.startTime, elapsedSeconds)
      : elapsed;
  const isStopped = recordingState === "stopped";
  const showSummaryPanel = (recordingState === "paused" || recordingState === "stopped") && (summary || isSummarizing);
  const hasRealSummary = !!summary && !isPlaceholderSummary(summary);
  const showSummaryControls = hasRealSummary;

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
            {(folders ?? []).map((f) => (
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
      {sidebarOpen ? (
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      ) : (
        <SidebarCollapseRail>
          <SidebarCollapseButton />
        </SidebarCollapseRail>
      )}

      <main className="flex flex-1 flex-col min-w-0">
        {/* Top bar — pl-20 clears macOS traffic lights when sidebar is collapsed */}
        <div className={cn(
          "flex items-center justify-between px-4 pb-0",
          isElectron ? "pt-10" : "pt-3",
          !sidebarOpen && isElectron && "pl-20"
        )}>
          <SidebarTopBarLeft
            backLabel="Back to home"
            onBack={() => navigate("/")}
            backIcon
          />
          <div className="flex items-center gap-1.5">
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

        {/* Content area: stack on small screens so transcript doesn't squeeze layout */}
        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
          <div className="flex flex-1 flex-col min-w-0">
            <div className="flex-1 overflow-y-auto pb-24">
              <div className="mx-auto max-w-3xl px-8 py-3">
                {/* Title */}
                {isEditingTitle ? (
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={(e) => {
                      userHasEditedTitleRef.current = true;
                      setTitle(e.target.value);
                    }}
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
                  {(recordingState === "paused" || recordingState === "stopped") && (
                    <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                      <Clock className="h-3 w-3" />
                      {displayTimeRange}
                    </span>
                  )}
                  {folderChip}
                  {showSummaryControls && (
                    <>
                      <NotesViewToggle
                        viewMode={viewMode}
                        onViewModeChange={handleViewModeChange}
                        transcriptVisible={transcriptVisible}
                        onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                      />
                      <div ref={templateMenuRef} className="relative flex items-center gap-0.5">
                        <button
                          onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                          className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-foreground hover:bg-secondary transition-colors"
                          title="Regenerate with different template"
                        >
                          <span>{MEETING_TEMPLATES.find((t) => t.id === meetingTemplate)?.icon ?? "📋"}</span>
                          <span className="max-w-[80px] truncate">{MEETING_TEMPLATES.find((t) => t.id === meetingTemplate)?.name ?? "General"}</span>
                          <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", showTemplateMenu && "rotate-180")} />
                        </button>
                        {showTemplateMenu && (
                          <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden py-1">
                            {MEETING_TEMPLATES.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => {
                                  if (t.id === meetingTemplate) {
                                    setShowTemplateMenu(false);
                                    return;
                                  }
                                  setMeetingTemplate(t.id);
                                  meetingTemplateRef.current = t.id;
                                  setShowTemplateMenu(false);
                                  // Clear summary so skeleton shimmer shows during regeneration
                                  setSummary(null);
                                  toast.info(`Regenerating with ${t.name} template...`);
                                  generateNotes().catch((err) => {
                                    console.error("Summary failed:", err);
                                    toast.error("Summary failed. Try again.");
                                  });
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

                {/* Content: recording vs paused/stopped with notes */}
                {!showSummaryPanel ? (
                  <textarea
                    value={personalNotes}
                    onChange={(e) => setPersonalNotes(e.target.value)}
                    placeholder="Write notes..."
                    className="min-h-[60vh] w-full resize-none bg-transparent text-[17px] font-medium text-foreground leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <div className="animate-fade-in">
                    {viewMode === "my-notes" ? (
                      <textarea
                        value={personalNotes}
                        onChange={(e) => setPersonalNotes(e.target.value)}
                        placeholder="Add your personal notes..."
                        className="min-h-[40vh] w-full resize-none bg-transparent text-[17px] font-medium text-foreground leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none"
                        autoFocus
                      />
                    ) : isSummarizing ? (
                      <SummarySkeleton />
                    ) : (
                      <div className="animate-fade-in">
                        <EditableSummary
                          summary={summary}
                          onUpdate={(updated) => setSummary(updated)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="relative space-y-2">
              <AskBar
                context="meeting"
                meetingTitle={title || "New note"}
                noteContext={askBarNoteContext}
                recordingState={recordingState}
                mentionContextHint={mentionHint}
                mentionHintLoading={mentionHintLoading}
                onDismissMentionHint={onDismissMentionHint}
                onTriggerMentionLLM={triggerMentionLLM}
                transcriptVisible={transcriptVisible}
                hideTranscriptToggle={showSummaryControls}
                onResumeRecording={handleResume}
                onPauseRecording={() => {
                  userPausedRef.current = true;
                  setRecordingState("paused");
                  if (usingRealAudio) {
                    pauseAudioCapture().catch(console.error);
                  }
                }}
                onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                elapsed={elapsed}
                generateSummarySlot={
                  recordingState === "paused" ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (transcriptRef.current.length > 0 || personalNotes.trim().length > 0) {
                          generateNotes().catch((err) => {
                            console.error("Summary failed:", err);
                            toast.error("Summary failed. Try again.");
                          });
                        } else {
                          toast.error("Add notes or transcript first.");
                        }
                      }}
                      disabled={isSummarizing}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-card shadow-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSummarizing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5" />
                      )}
                      <span>Summary</span>
                    </button>
                  ) : undefined
                }
              />
            </div>
          </div>

          {/* Transcript: full width below notes on small screens, side panel on lg+ */}
          {transcriptVisible && (recordingState === "recording" || showRealTimeTranscript || transcriptLines.length > 0 || noTranscriptYet) && (
            <div className="w-full lg:w-[36rem] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-card/50 overflow-y-auto rounded-tl-2xl rounded-tr-2xl max-h-[45vh] lg:max-h-none animate-slide-in-right">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium uppercase tracking-wider text-foreground/80">
                      {recordingState === "recording" ? "Live Transcript" : "Transcript"}
                    </span>
                    {usingRealAudio && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                            aria-label="About Me and Them labels"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs text-[11px] leading-snug">
                          <strong>Me</strong> = your microphone. <strong>Them</strong> = meeting/system audio. Labels follow audio source, not names in the chat. Unmute your mic for reliable &quot;Me&quot; lines; short replies may show as &quot;Them&quot; if only picked up from the meeting mix.
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {(recordingState === "recording" || recordingState === "paused") && (
                      <div className="flex items-center gap-1.5">
                        {recordingState === "recording" ? (
                          <span className="flex items-center gap-1 text-[10px] text-destructive">
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                            REC
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Pause className="h-2.5 w-2.5" />
                            Paused
                          </span>
                        )}
                        {activeSTTLabel && (
                          <>
                            <span className="text-[10px] text-muted-foreground/40">·</span>
                            <span className="text-[10px] text-muted-foreground">{activeSTTLabel}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {currentTranscript.length > 0 && (
                      <button
                        onClick={() => {
                          const text = currentTranscript.map((l) => `[${l.time}] ${l.speaker}: ${l.text}`).join("\n");
                          void (navigator.clipboard?.writeText(text) ?? Promise.resolve());
                        }}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        title="Copy all"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={() => setTranscriptVisible(false)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                  <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <input
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder="Search transcript..."
                    className="flex-1 min-w-0 bg-transparent text-[13px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  {transcriptSearch && (
                    <button onClick={() => setTranscriptSearch("")} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-3 space-y-4">
                {!transcriptSearch && noTranscriptYet && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3">
                    <p className="text-[13px] font-medium text-amber-800 dark:text-amber-200">
                      No transcript captured yet ({Math.floor(elapsedSeconds / 60)} min)
                    </p>
                    <p className="text-[12px] text-amber-700 dark:text-amber-300/90 mt-1 leading-relaxed">
                      Check <strong>Settings → Transcription</strong>: try another STT model or verify your API key. Resume recording to retry.
                    </p>
                  </div>
                )}
                {(() => {
                  const filtered = currentTranscript
                    .map((line, idx) => ({ line, originalIndex: idx }))
                    .filter(({ line }) => !transcriptSearch || line.text.toLowerCase().includes(transcriptSearch.toLowerCase()));
                  const groups = groupTranscriptBySpeaker(filtered.map(({ line, originalIndex }) => ({ ...line, originalIndex })));
                  const searchRegex = transcriptSearch ? new RegExp(`(${transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi") : null;
                  return groups.map((group, groupIdx) => {
                    const isMe = group.speaker === "You";
                    const displayLabel = isMe ? "Me" : "Them";
                    // Always show speaker label for clarity — especially after time-gap splits
                    const showLabel = true;
                    const isLastGroup = groupIdx === groups.length - 1;
                    return (
                      <div
                        key={group.indices.join("-")}
                        className={cn(
                          "group flex flex-col items-end gap-0.5",
                          isLastGroup ? "animate-slide-in-right" : "animate-fade-in",
                          !isMe && "items-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[92%] rounded-2xl px-3 py-2 text-[14px] font-medium leading-relaxed",
                            isMe
                              ? "bg-green-500/15 text-green-900 dark:text-green-100 rounded-br-md"
                              : "bg-muted/80 text-foreground/90 rounded-bl-md"
                          )}
                        >
                          {showLabel && (
                            <p className="text-[12px] font-medium text-foreground/70 mb-0.5">
                              {displayLabel}
                            </p>
                          )}
                          <p>
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
                        {usingRealAudio && (
                          <div className={cn("flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity", !isMe && "self-start")}>
                            <button
                              onClick={() => {
                                const t = group.indices
                                  .map((i) => {
                                    const l = currentTranscript[i];
                                    return l ? `[${l.time}] ${l.speaker}: ${l.text}` : "";
                                  })
                                  .filter(Boolean)
                                  .join("\n");
                                void (navigator.clipboard?.writeText(t) ?? Promise.resolve());
                              }}
                              className="rounded p-1 text-muted-foreground hover:text-foreground"
                              title="Copy"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => removeTranscriptLinesAt(group.indices)}
                              className="rounded p-1 text-muted-foreground hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
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
                {!transcriptSearch && (recordingState === "recording" || recordingState === "paused") && sttStatus === "error" && sttErrorMessage && (
                  <p className="text-[10px] text-destructive pt-0.5" title={sttErrorMessage}>
                    STT error: {sttErrorMessage.length > 60 ? sttErrorMessage.slice(0, 57) + "…" : sttErrorMessage}
                  </p>
                )}
                {!transcriptSearch && sttStale && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 pt-0.5">
                    No transcription for a while. Check your STT model and connection.
                  </p>
                )}
                {transcriptSearch && currentTranscript.filter(l => l.text.toLowerCase().includes(transcriptSearch.toLowerCase())).length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-4">No results found</p>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* KB suggestions — shown during active recording when KB folder is configured */}
        {recordingState === "recording" && kbHasFolder.current && (
          <KBSuggestionsPanel
            suggestions={kbSuggestions}
            visible={kbVisible}
            loading={kbLoading}
            onDismiss={(i) => setKbSuggestions(prev => prev.filter((_, idx) => idx !== i))}
            onToggle={() => setKbVisible(v => !v)}
          />
        )}

      </main>
    </div>
  );
}
