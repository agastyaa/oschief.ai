import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AskBar } from "@/components/AskBar";
import { EditableSummary } from "@/components/EditableSummary";
import { SummarySkeleton, CoachLoadingLine } from "@/components/SummarySkeleton";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import { useNotes, type SavedNote } from "@/contexts/NotesContext";
import { useRecording } from "@/contexts/RecordingContext";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { Share2, MoreHorizontal, FileText, Hash, Calendar, Clock, EyeOff, Eye, Search, X, Check, ChevronDown, ChevronRight, Loader2, Copy, Download, FileDown, BarChart3, BookOpen, MessageSquare, Sparkles, RefreshCw, Mic, ArrowLeft } from "lucide-react";
import { MeetingMetadata } from "@/components/MeetingMetadata";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { cn } from "@/lib/utils";
import { groupTranscriptBySpeaker, getSpeakerColor, getSpeakerDisplayLabel } from "@/lib/transcript-utils";
import { loadAccountFromStorage } from "@/lib/account-context";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { toast } from "sonner";
import { noteToMarkdown } from "@/lib/export-markdown";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { computeCoachingMetrics } from "@/lib/coaching-analytics";
import { RichTextEditor } from "@/components/RichTextEditor";
import { computeConversationHeuristics } from "@/lib/conversation-heuristics";
import { CoachingInsightsDisplay } from "@/components/CoachingInsightsDisplay";
import { SlackShareDialog } from "@/components/SlackShareDialog";
import { TeamsShareDialog } from "@/components/TeamsShareDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { BUILTIN_TEMPLATES } from "@/data/templates";

export default function NoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notes, updateNote } = useNotes();
  const { activeSession, resumeSession, updateSession, clearSession, pauseAudioCapture } = useRecording();
  const { selectedAIModel } = useModelSettings();
  const api = getElectronAPI();
  const [viewMode, setViewMode] = useState<"my-notes" | "ai-notes" | "coaching">("ai-notes");
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const { width: transcriptWidth, startResize: startTranscriptResize } = useResizablePanel({ storageKey: "syag_transcript_width" });
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [recordingState, setRecordingState] = useState<"recording" | "paused" | "stopped">("stopped");
  const [elapsed, setElapsed] = useState(0);
  const [newLines, setNewLines] = useState<{ speaker: string; time: string; text: string }[]>([]);
  const [meetingTemplate, setMeetingTemplate] = useState("general");
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [slackShareOpen, setSlackShareOpen] = useState(false);
  const [teamsShareOpen, setTeamsShareOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const displayElapsedRef = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const userHasEditedTitleRef = useRef(false);

  // Timer: derive from startTime via hook when active session exists; otherwise local state
  const sessionElapsed = useElapsedTime(
    activeSession?.noteId === id ? (activeSession.startTime ?? null) : null,
    activeSession?.noteId === id && activeSession?.isRecording === true
  );
  const displayElapsed = activeSession?.noteId === id ? sessionElapsed : elapsed;
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
        meetingDuration: note.duration || undefined,
        accountDisplayName: loadAccountFromStorage().name?.trim() || undefined,
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

  // If this note has content but no summary in context, check DB first (summary may have
  // been generated while user was on a different page). Then listen for the IPC event as fallback.
  useEffect(() => {
    if (!note || note.summary || !api?.llm?.onSummaryReady) return;
    const hasContent = (note.transcript?.length ?? 0) > 0 || (note.personalNotes || '').trim().length > 0;
    if (!hasContent) return;

    // Check DB first — summary may already be saved but context missed the update
    api.db?.notes?.get(id!)?.then((dbNote: any) => {
      if (dbNote?.summary) {
        updateNote(id!, { summary: dbNote.summary });
        setIsSummarizing(false);
        return;
      }
      // Not in DB either — show shimmer and wait for the event
      setIsSummarizing(true);
    }).catch(() => {
      setIsSummarizing(true);
    });

    const unsubReady = api.llm.onSummaryReady((incomingId: string, summary: any) => {
      if (incomingId !== id) return;
      updateNote(id!, { summary });
      setIsSummarizing(false);
    });
    const unsubFailed = api.llm.onSummaryFailed((incomingId: string) => {
      if (incomingId !== id) return;
      setIsSummarizing(false);
    });
    return () => { unsubReady(); unsubFailed(); };
  }, [note?.summary, id, api]);

  // Notes load async in Electron — wait before showing "not found"
  const [waitedForLoad, setWaitedForLoad] = useState(false);
  useEffect(() => {
    if (!note && !waitedForLoad) {
      const timer = setTimeout(() => setWaitedForLoad(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [note, waitedForLoad]);

  if (!note) {
    if (!waitedForLoad) {
      // Show loading state while notes are being fetched from DB
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-6 w-6 text-muted-foreground/40 mx-auto mb-3 animate-spin" />
            <p className="text-[12px] text-muted-foreground">Loading note...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-body-sm text-muted-foreground mb-3">Note not found</p>
          <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto">
            <ArrowLeft className="h-3 w-3" />
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <div />
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  <Share2 className="h-3.5 w-3.5" />
                  Export
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => {
                    if (!note) return;
                    const md = noteToMarkdown(note);
                    // Use Electron clipboard (more reliable in dropdown context) with Web API fallback
                    if (api?.app?.writeClipboard) {
                      api.app.writeClipboard(md);
                      toast.success("Copied as Markdown");
                    } else {
                      navigator.clipboard.writeText(md).then(
                        () => toast.success("Copied as Markdown"),
                        () => {
                          // Last resort: textarea trick
                          const ta = document.createElement('textarea');
                          ta.value = md;
                          ta.style.position = 'fixed';
                          ta.style.left = '-9999px';
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                          toast.success("Copied as Markdown");
                        }
                      );
                    }
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy text
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!note) return;
                    try {
                      if (api?.export?.toDocx) {
                        const result = await api.export.toDocx(note);
                        if (result.ok) toast.success("Word document saved");
                        else toast.error(result.error || "Export failed");
                      } else {
                        console.error('[export] api.export.toDocx not available. isElectron:', isElectron, 'api.export:', api?.export);
                        toast.error("Word export requires the desktop app");
                      }
                    } catch (err: any) {
                      console.error('[export:docx]', err);
                      toast.error(`Export failed: ${err.message?.slice(0, 80) || 'Unknown error'}`);
                    }
                  }}
                >
                  <FileDown className="mr-2 h-3.5 w-3.5" />
                  Export as Word
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!note) return;
                    try {
                      if (api?.export?.toPdf) {
                        const result = await api.export.toPdf(note);
                        if (result.ok) toast.success("PDF saved");
                        else toast.error(result.error || "Export failed");
                      } else {
                        console.error('[export] api.export.toPdf not available');
                        toast.error("PDF export requires the desktop app");
                      }
                    } catch (err: any) {
                      console.error('[export:pdf]', err);
                      toast.error(`Export failed: ${err.message?.slice(0, 80) || 'Unknown error'}`);
                    }
                  }}
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!note) return;
                    try {
                      if (api?.export?.toObsidian) {
                        const result = await api.export.toObsidian(note);
                        if (result.ok && !result.skipped) {
                          const obsidianUri = result.obsidianUri;
                          toast.success(
                            <div className="flex items-center gap-2">
                              <span>Saved to vault{result.conflict ? " (as new version)" : ""}</span>
                              {obsidianUri && (
                                <button
                                  className="text-primary font-medium hover:underline"
                                  onClick={() => {
                                    if (api?.app?.openExternal) api.app.openExternal(obsidianUri);
                                    else window.open(obsidianUri, '_blank');
                                  }}
                                >
                                  Open in Obsidian
                                </button>
                              )}
                            </div>,
                            { duration: 5000 }
                          );
                        } else if (result.ok && result.skipped) {
                          toast.success("Already in vault — no changes needed");
                        } else if (result.error !== "Cancelled") {
                          toast.error(result.error || "Export failed");
                        }
                      } else {
                        toast.error("Obsidian export requires the desktop app");
                      }
                    } catch (err: any) {
                      console.error('[export:obsidian]', err);
                      toast.error(`Export failed: ${err.message?.slice(0, 80) || 'Unknown error'}`);
                    }
                  }}
                >
                  <BookOpen className="mr-2 h-3.5 w-3.5" />
                  Export to Vault
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (!note) return;
                    setSlackShareOpen(true);
                  }}
                >
                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                  Share to Slack
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (!note) return;
                    setTeamsShareOpen(true);
                  }}
                >
                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                  Share to Teams
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {/* Content area with side panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: main content + ask bar */}
          <div className="flex flex-1 flex-col min-w-0">
            {/* Title + metadata — fixed at top, not scrollable */}
            <div className="shrink-0">
              <div className="mx-auto max-w-3xl px-8 py-3 pb-0">
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
                      "mb-2 font-display text-[22px] font-normal cursor-text transition-colors leading-snug tracking-tight",
                      (note.title || "").trim() ? "text-foreground hover:text-foreground/80" : "text-foreground/40 hover:text-foreground/60"
                    )}
                  >
                    {note.title || "Meeting title"}
                  </h1>
                )}

                {/* Meta line — clean inline text, not chip pills */}
                <div className="flex items-center gap-3 mb-5 text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {note.date}
                  </span>
                  <span className="text-border">·</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {note.timeRange ?? note.duration}
                  </span>
                  {(note.summary || note.transcript?.length) && (
                    <>
                      {note.summary && (
                        <NotesViewToggle
                          viewMode={viewMode}
                          onViewModeChange={setViewMode}
                          transcriptVisible={transcriptVisible}
                          onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                          showCoaching={!!note.transcript?.length}
                        />
                      )}
                      <div ref={templateMenuRef} className="relative flex items-center gap-0.5">
                        <button
                          onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                          className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-foreground hover:bg-secondary transition-colors"
                          title={note.summary ? "Regenerate with different template" : "Generate summary"}
                        >
                          <span>{BUILTIN_TEMPLATES.find((t) => t.id === meetingTemplate)?.icon ?? "📋"}</span>
                          <span className="max-w-[80px] truncate">{BUILTIN_TEMPLATES.find((t) => t.id === meetingTemplate)?.name ?? "General"}</span>
                          <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", showTemplateMenu && "rotate-180")} />
                        </button>
                        {showTemplateMenu && (
                          <div className="absolute left-0 top-full mt-1 w-52 rounded-[10px] border border-border bg-popover shadow-lg z-50 overflow-hidden py-1">
                            {BUILTIN_TEMPLATES.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => {
                                  if (t.id === meetingTemplate) {
                                    setShowTemplateMenu(false);
                                    return;
                                  }
                                  setMeetingTemplate(t.id);
                                  setShowTemplateMenu(false);
                                  handleRegenerate(t.id);
                                }}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body-sm text-foreground hover:bg-secondary transition-colors"
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

                {/* People, Company, Tags */}
                {id && <MeetingMetadata noteId={id} />}
              </div>
            </div>

            {/* Scrollable content — summary/notes */}
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl px-8">
                <div className="border-t border-border/50 my-4" />

                {viewMode === "ai-notes" ? (
                  <>
                    {isSummarizing ? (
                      <SummarySkeleton />
                    ) : note.summary ? (
                      <div className="animate-fade-in">
                        <EditableSummary
                          summary={{
                            ...note.summary,
                            actionItems: note.summary.actionItems?.map((item: any) => ({
                              ...item,
                              priority: (["high", "medium", "low"].includes(item.priority) ? item.priority : "medium") as "high" | "medium" | "low",
                            })),
                          }}
                          noteId={id}
                          onUpdate={(updated) => {
                            if (id) {
                              updateNote(id, { summary: updated });
                              // Sync action items → commitments (1:1 mirror)
                              const actionItems = updated.actionItems || updated.nextSteps || [];
                              api?.memory?.commitments?.syncActionItems?.(id, actionItems)?.catch(console.error);
                            }
                          }}
                          meetingTitle={note.title}
                          meetingDate={note.date}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No AI summary available for this note.</p>
                    )}
                  </>
                ) : viewMode === "coaching" ? (
                  <CoachingView
                    note={note}
                    updateNote={updateNote}
                    onJumpToTranscriptLine={(lineIndex) => {
                      setTranscriptVisible(true);
                      setTranscriptSearch("");
                      window.requestAnimationFrame(() => {
                        document
                          .getElementById(`syag-transcript-line-${lineIndex}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" });
                      });
                    }}
                  />
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <h2 className="font-display text-base font-normal text-foreground/70">My Notes</h2>
                    </div>
                    <RichTextEditor
                      content={note.personalNotes || ""}
                      onChange={(html) => {
                        if (id) updateNote(id, { personalNotes: html });
                      }}
                      placeholder="Write your personal notes here..."
                      className="w-full bg-transparent text-[15px] text-foreground/70 leading-relaxed pl-6"
                      minHeight="200px"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Ask bar — pinned to bottom */}
            <div className="relative shrink-0">
              <AskBar
                context="meeting"
                meetingTitle={note.title}
                hideTranscriptToggle={!!note.summary}
                noteContext={[
                  `Title: ${note.title}`,
                  note.personalNotes ? `Personal Notes: ${note.personalNotes}` : '',
                  note.summary?.overview ? `Overview: ${note.summary.overview}` : '',
                  (note.transcript?.length || newLines.length) ? `Transcript:\n${[...note.transcript, ...newLines].map((t: any) => `[${t.time}] ${t.speaker}: ${t.text}`).join('\n')}` : '',
                ].filter(Boolean).join('\n\n')}
                coachingMetrics={note.coachingMetrics}
                recordingState={recordingState}
                elapsed={recordingState !== "stopped" ? formatElapsed(displayElapsed) : undefined}
                transcriptVisible={transcriptVisible}
                onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                onResumeRecording={handleResume}
                onPauseRecording={() => {
                  setRecordingState("paused");
                  pauseAudioCapture().catch(console.error);
                }}
                onCorrection={(find, replace) => {
                  if (!note.summary) return;
                  let count = 0;
                  const replaceAll = (s: string | undefined) => {
                    if (!s) return s;
                    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                    return s.replace(regex, () => { count++; return replace; });
                  };
                  const updated = { ...note.summary };
                  updated.overview = replaceAll(updated.overview);
                  (updated as any).tldr = replaceAll((updated as any).tldr);
                  if (updated.keyPoints) updated.keyPoints = updated.keyPoints.map((kp: any) => typeof kp === 'string' ? replaceAll(kp)! : kp);
                  if (updated.actionItems) updated.actionItems = updated.actionItems.map((ai: any) => ({ ...ai, text: replaceAll(ai.text)!, assignee: replaceAll(ai.assignee)! }));
                  if (updated.nextSteps) updated.nextSteps = updated.nextSteps.map((ai: any) => ({ ...ai, text: replaceAll(ai.text)!, assignee: replaceAll(ai.assignee)! }));
                  if (updated.decisions) updated.decisions = updated.decisions.map((d: any) => replaceAll(d)!);
                  if ((updated as any).topics) (updated as any).topics = (updated as any).topics.map((t: any) => ({
                    ...t,
                    title: replaceAll(t.title)!,
                    bullets: t.bullets?.map((b: any) => typeof b === 'string' ? replaceAll(b)! : { ...b, text: replaceAll(b.text)!, subBullets: b.subBullets?.map((sb: string) => replaceAll(sb)!) }),
                    actionItems: t.actionItems?.map((ai: any) => ({ ...ai, text: replaceAll(ai.text)!, assignee: replaceAll(ai.assignee)! })),
                    decisions: t.decisions?.map((d: string) => replaceAll(d)!),
                  }));
                  if (count > 0) {
                    updateNote(note.id, { summary: updated });
                    toast.success(`Corrected: ${find} → ${replace} (${count} replacements)`);
                  } else {
                    toast("No occurrences found in summary.");
                  }
                }}
              />
            </div>
          </div>

          {/* Transcript side panel */}
          {transcriptVisible && (
            <div className="relative flex flex-col flex-shrink-0 border-l border-border bg-card/50 rounded-tl-[10px] animate-slide-in-right overflow-hidden" style={{ width: transcriptWidth }}>
              {/* Resize drag handle */}
              <div
                className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize z-40 hover:bg-primary/20 active:bg-primary/30 transition-colors"
                onMouseDown={startTranscriptResize}
              />
              {/* Transcript header — pinned */}
              <div className="shrink-0 px-4 py-3 border-b border-border bg-card/50 z-10">
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
              {/* Transcript content — scrollable */}
              <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-4">
                {/* Empty state */}
                {note.transcript.length === 0 && newLines.length === 0 && recordingState !== "recording" && (
                  <div className="text-center py-8">
                    <Mic className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[11px] text-muted-foreground">No transcript available</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">Set up an STT model in Settings → AI Models to transcribe meetings</p>
                  </div>
                )}
                {/* Grouped transcript blocks */}
                {(() => {
                  const allLines = [...note.transcript, ...newLines];
                  const filtered = allLines
                    .map((line, idx) => ({ line, originalIndex: idx }))
                    .filter(({ line }) => !transcriptSearch || (line.text ?? '').toLowerCase().includes(transcriptSearch.toLowerCase()));
                  const groups = groupTranscriptBySpeaker(filtered.map(({ line, originalIndex }) => ({ ...line, originalIndex })));
                  const searchRegex = transcriptSearch ? new RegExp(`(${transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi") : null;
                  const totalSaved = note.transcript.length;
                    return groups.map((group, groupIdx) => {
                    const displayLabel = getSpeakerDisplayLabel(group.speaker);
                    const speakerStyle = getSpeakerColor(group.speaker);
                    const isNew = group.indices.some((i) => i >= totalSaved);
                    const prevGroup = groupIdx > 0 ? groups[groupIdx - 1] : null;
                    const showLabel = !prevGroup || prevGroup.speaker !== group.speaker;
                    const anchorIndex = group.indices[0];
                    const isLastGroup = groupIdx === groups.length - 1;
                    return (
                      <div
                        key={group.indices.join("-")}
                        id={anchorIndex !== undefined ? `syag-transcript-line-${anchorIndex}` : undefined}
                        className={cn(
                          "scroll-mt-4",
                          isNew && (isLastGroup ? "animate-slide-in-right" : "animate-fade-in")
                        )}
                      >
                        {showLabel ? (
                          <div className="mb-0.5 flex items-center gap-1.5">
                            <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", speakerStyle.dot)} />
                            <span className={cn("text-[10px] font-semibold", speakerStyle.label)}>{displayLabel}</span>
                          </div>
                        ) : (
                          <div className="h-1" />
                        )}
                        <p className="text-[12px] text-muted-foreground leading-relaxed">
                          {searchRegex ? (
                            group.text.split(searchRegex).map((part, j) =>
                              part.toLowerCase() === transcriptSearch.toLowerCase() ? (
                                <mark key={j} className="bg-accent/20 text-foreground rounded-sm px-0.5">{part}</mark>
                              ) : (
                                part
                              )
                            )
                          ) : viewMode === "coaching" && group.speaker === "You" ? (
                            highlightFillers(group.text)
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
              </div>{/* end transcript scroll */}
            </div>
          )}
        </div>
      {note && (
        <>
          <SlackShareDialog
            open={slackShareOpen}
            onClose={() => setSlackShareOpen(false)}
            noteTitle={note.title || "Untitled Meeting"}
            noteDate={note.date}
            summary={note.summary as any}
          />
          <TeamsShareDialog
            open={teamsShareOpen}
            onClose={() => setTeamsShareOpen(false)}
            noteTitle={note.title || "Untitled Meeting"}
            noteDate={note.date}
            summary={note.summary as any}
          />
        </>
      )}
    </div>
  );
}

// ── Coaching View (computed on demand) ───────────────────────────────

function CoachingView({
  note,
  updateNote,
  onJumpToTranscriptLine,
}: {
  note: SavedNote;
  updateNote: (id: string, updates: Partial<SavedNote>) => void;
  onJumpToTranscriptLine?: (lineIndex: number) => void;
}) {
  const navigate = useNavigate();
  const api = getElectronAPI();
  const { selectedAIModel } = useModelSettings();
  const meetingDurationSec = useMemo(() => {
    const parts = (note.duration || "0:00").split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }, [note.duration]);

  const accountRoleId = useMemo(() => {
    try {
      const raw = localStorage.getItem("syag-account");
      if (raw) return JSON.parse(raw)?.roleId as string | undefined;
    } catch { /* ignore */ }
    return undefined;
  }, []);

  const metrics = useMemo(() => {
    if (note.micOnly) return null; // Skip coaching for mic-only — speaker attribution unreliable
    if (note.coachingMetrics) return note.coachingMetrics;
    if (!note.transcript?.length || meetingDurationSec <= 0) return null;
    const computed = computeCoachingMetrics(note.transcript, meetingDurationSec);
    updateNote(note.id, { coachingMetrics: computed });
    return computed;
  }, [note.coachingMetrics, note.transcript, meetingDurationSec, note.id, updateNote, note.micOnly]);

  const heuristics = useMemo(() => {
    if (!note.transcript?.length || meetingDurationSec <= 0) return null;
    const h = computeConversationHeuristics(note.transcript, meetingDurationSec, accountRoleId);
    const tags = [...h.suggestedHabitTags];
    if (metrics && metrics.totalFillerCount >= 12) tags.push("filler_heavy");
    if (metrics && metrics.fillerWordsPerMinute >= 3) tags.push("filler_heavy");
    return { ...h, suggestedHabitTags: [...new Set(tags)] };
  }, [note.transcript, meetingDurationSec, accountRoleId, metrics]);

  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationFailed, setConversationFailed] = useState(false);

  useEffect(() => {
    setConversationFailed(false);
  }, [note.id]);

  const runConversationAnalysis = useCallback(async () => {
    if (!metrics || !api?.coaching?.analyzeConversation || !note.transcript?.length || !accountRoleId) return;
    if (!selectedAIModel) {
      navigate('/settings?section=ai-models');
      return;
    }
    setConversationLoading(true);
    setConversationFailed(false);
    try {
      const { roleInsights: _ri, conversationInsights: _ci, ...metricsForApi } = metrics;
      const result = await api.coaching.analyzeConversation({
        transcript: note.transcript,
        metrics: metricsForApi as unknown as Record<string, unknown>,
        heuristics,
        roleId: accountRoleId,
        model: selectedAIModel,
      });
      if (result.ok) {
        updateNote(note.id, { coachingMetrics: { ...metrics, conversationInsights: result.data } });
      } else {
        setConversationFailed(true);
      }
    } catch {
      setConversationFailed(true);
    } finally {
      setConversationLoading(false);
    }
  }, [metrics, api, note.id, note.transcript, updateNote, accountRoleId, heuristics, selectedAIModel, navigate]);

  const conv = metrics?.conversationInsights;

  if (!metrics) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No transcript data available for coaching analysis.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Record a meeting to get role-aware meeting coaching.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!accountRoleId && (
        <div className="rounded-[10px] border border-amber/30 bg-amber-bg px-3 py-2 text-[11px] text-muted-foreground">
          Choose your <span className="font-medium text-foreground">role</span> in Settings to unlock transcript-grounded coaching and role frameworks.
        </div>
      )}

      {/* Analyze button — shown when no insights exist */}
      {!conv && !conversationLoading && accountRoleId && note.transcript?.length > 0 && (
        <button
          onClick={runConversationAnalysis}
          className="w-full rounded-[10px] border border-border bg-card p-4 text-center hover:bg-secondary/50 transition-colors"
        >
          <Sparkles className="h-5 w-5 text-primary mx-auto mb-2" />
          <p className="text-body-sm font-medium text-foreground">Analyze this meeting</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Find what you missed — grounded in your transcript and role playbook</p>
        </button>
      )}

      {/* Transcript-grounded meeting coaching */}
      {(conv || conversationLoading) && (
        <div className="space-y-4">
          {conversationLoading && !conv ? (
            <CoachLoadingLine message="Analyzing transcript..." />
          ) : conv ? (
            <CoachingInsightsDisplay
              insights={conv}
              showJumpToTranscript={!!onJumpToTranscriptLine}
              onJumpToTranscriptLine={onJumpToTranscriptLine}
              transcript={note.transcript}
            />
          ) : null}
        </div>
      )}

      {/* Reanalyze button — shown when insights exist, allows re-running with updated prompts */}
      {conv && !conversationLoading && accountRoleId && (
        <button
          onClick={runConversationAnalysis}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Reanalyze this meeting
        </button>
      )}

      {/* Heuristic coaching — shown prominently when LLM analysis hasn't run or failed */}
      {heuristics && !conv && !conversationLoading && (
        <div className="rounded-[10px] border border-border bg-card px-4 py-3.5 space-y-3">
          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">What I can see from the data</h4>
          <div className="space-y-2">
            {heuristics.questionRatioYou < 0.15 && (
              <p className="text-body-sm text-foreground leading-relaxed border-l-2 border-amber pl-3">
                You didn&apos;t ask many questions — only {Math.round(heuristics.questionRatioYou * 100)}% of your {heuristics.yourTurns} turns were questions.
                {accountRoleId === 'pm' || accountRoleId === 'founder-ceo' ? " For a PM or founder, discovery conversations should be 60-70% questions." : " Try opening with a question to draw out the other person's perspective."}
              </p>
            )}
            {heuristics.longestYouMonologueWords > 150 && (
              <p className="text-body-sm text-foreground leading-relaxed border-l-2 border-amber pl-3">
                Your longest uninterrupted run was {heuristics.longestYouMonologueWords} words. That's a monologue — most people stop listening after 60 seconds. Break it up with check-in questions.
              </p>
            )}
            {heuristics.questionRatioYou >= 0.3 && (
              <p className="text-body-sm text-foreground leading-relaxed border-l-2 border-emerald-400 pl-3">
                Good question ratio — {Math.round(heuristics.questionRatioYou * 100)}% of your turns were questions. That's solid discovery behavior.
              </p>
            )}
            {heuristics.yourTurns < 3 && (
              <p className="text-body-sm text-foreground leading-relaxed border-l-2 border-muted-foreground pl-3">
                You only spoke {heuristics.yourTurns} time{heuristics.yourTurns === 1 ? "" : "s"} in this meeting. Either it was a listening session or the transcript didn&apos;t capture you well.
              </p>
            )}
          </div>
          {heuristics.suggestedHabitTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {heuristics.suggestedHabitTags.map((t) => (
                <span key={t} className="rounded-full bg-accent/10 border border-accent/25 px-2.5 py-0.5 text-[10px] text-accent font-medium">
                  {t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compact heuristics when LLM analysis IS present (supplementary) */}
      {heuristics && conv && (
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-muted/50 border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {heuristics.yourTurns} turns · {Math.round(heuristics.questionRatioYou * 100)}% questions · longest run {heuristics.longestYouMonologueWords}w
          </span>
        </div>
      )}

      {/* Error state with retry */}
      {conversationFailed && !conv && !conversationLoading && accountRoleId && (
        <div className="flex items-center justify-between gap-2 rounded-[10px] border border-amber bg-amber-bg px-3 py-2">
          <p className="text-[11px] text-foreground">
            {selectedAIModel
              ? "Analysis failed. Check your AI model connection and try again."
              : <>Connect an AI model in <button onClick={() => navigate('/settings?section=ai-models')} className="text-primary hover:underline">Settings → AI Models</button> to get transcript analysis.</>
            }
          </p>
          <button
            type="button"
            className="shrink-0 text-[11px] font-medium text-accent hover:underline"
            onClick={runConversationAnalysis}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ── Communication mix bar ────────────────────────────────────────────

function CommunicationMixBar({ metrics }: { metrics: import("@/lib/coaching-analytics").CoachingMetrics }) {
  const total = metrics.yourSpeakingTimeSec + metrics.othersSpeakingTimeSec + metrics.silenceTimeSec;
  if (total <= 0) return null;

  const youPct = Math.round((metrics.yourSpeakingTimeSec / total) * 100);
  const othersPct = Math.round((metrics.othersSpeakingTimeSec / total) * 100);
  const silencePct = 100 - youPct - othersPct;

  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Communication Mix</h4>
      <div className="flex rounded-full overflow-hidden h-4">
        {youPct > 0 && (
          <div
            className="bg-primary dark:bg-primary transition-[width]"
            style={{ width: `${youPct}%` }}
            title={`You: ${youPct}%`}
          />
        )}
        {othersPct > 0 && (
          <div
            className="bg-muted-foreground/40 dark:bg-muted-foreground/30 transition-[width]"
            style={{ width: `${othersPct}%` }}
            title={`Others: ${othersPct}%`}
          />
        )}
        {silencePct > 0 && (
          <div
            className="bg-border dark:bg-border transition-[width]"
            style={{ width: `${silencePct}%` }}
            title={`Silence: ${silencePct}%`}
          />
        )}
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-muted-foreground">
        <span>You {youPct}%</span>
        <span>Others {othersPct}%</span>
        <span>Silence {silencePct}%</span>
      </div>
    </div>
  );
}

// ── Filler word highlighting ─────────────────────────────────────────

const FILLER_PATTERN = /\b(um|uh|like|basically|right|actually|literally|so|you know|i mean|kind of|sort of)\b/gi;

function highlightFillers(text: string): ReactNode {
  const parts = text.split(FILLER_PATTERN);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    FILLER_PATTERN.test(part) ? (
      <mark key={i} className="bg-amber-bg text-amber rounded-sm px-0.5">{part}</mark>
    ) : (
      part
    )
  );
}
