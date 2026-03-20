import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar, SidebarCollapseButton, SidebarCollapseRail, SidebarTopBarLeft } from "@/components/Sidebar";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { AskBar } from "@/components/AskBar";
import { EditableSummary } from "@/components/EditableSummary";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import { useNotes, type SavedNote } from "@/contexts/NotesContext";
import { useRecording } from "@/contexts/RecordingContext";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { Share2, MoreHorizontal, FileText, Hash, Calendar, Clock, EyeOff, Eye, Search, X, Check, ChevronDown, ChevronRight, Loader2, Copy, Download, FileDown, BarChart3, BookOpen, MessageSquare, Sparkles, Quote, Crosshair, Mic } from "lucide-react";
import { MeetingMetadata } from "@/components/MeetingMetadata";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import { cn } from "@/lib/utils";
import { groupTranscriptBySpeaker } from "@/lib/transcript-utils";
import { loadAccountFromStorage } from "@/lib/account-context";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { toast } from "sonner";
import { noteToMarkdown } from "@/lib/export-markdown";
import { CoachingCard } from "@/components/CoachingCard";
import { computeCoachingMetrics } from "@/lib/coaching-analytics";
import { computeConversationHeuristics, findTranscriptLineIndexForQuote } from "@/lib/conversation-heuristics";
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
  const { sidebarOpen } = useSidebarVisibility();
  const [viewMode, setViewMode] = useState<"my-notes" | "ai-notes" | "coaching">("ai-notes");
  const [transcriptVisible, setTranscriptVisible] = useState(false);
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
        <div className={cn(
          "flex items-center justify-between px-4 pb-0",
          isElectron ? "pt-10" : "pt-3",
          !sidebarOpen && isElectron && "pl-20"
        )}>
          <SidebarTopBarLeft
            backLabel="← Back to notes"
            onBack={() => navigate(-1)}
          />
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
                    navigator.clipboard.writeText(md).then(
                      () => toast.success("Copied as Markdown"),
                      () => toast.error("Failed to copy")
                    );
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy as Markdown
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!note) return;
                    const api = isElectron() ? getElectronAPI() : null;
                    if (api?.export?.toDocx) {
                      const result = await api.export.toDocx(note);
                      if (result.ok) toast.success("Word document saved");
                      else toast.error(result.error || "Export failed");
                    } else {
                      toast.error("Word export requires the desktop app");
                    }
                  }}
                >
                  <FileDown className="mr-2 h-3.5 w-3.5" />
                  Export as Word
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!note) return;
                    const api = isElectron() ? getElectronAPI() : null;
                    if (api?.export?.toPdf) {
                      const result = await api.export.toPdf(note);
                      if (result.ok) toast.success("PDF saved");
                      else toast.error(result.error || "Export failed");
                    } else {
                      toast.error("PDF export requires the desktop app");
                    }
                  }}
                >
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (!note) return;
                    const api = isElectron() ? getElectronAPI() : null;
                    if (api?.export?.toObsidian) {
                      const result = await api.export.toObsidian(note);
                      if (result.ok) toast.success("Saved to Obsidian vault");
                      else if (result.error !== "Cancelled") toast.error(result.error || "Export failed");
                    } else {
                      toast.error("Obsidian export requires the desktop app");
                    }
                  }}
                >
                  <BookOpen className="mr-2 h-3.5 w-3.5" />
                  Export to Obsidian
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
                  {note.summary && (
                    <>
                      <NotesViewToggle
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        transcriptVisible={transcriptVisible}
                        onToggleTranscript={() => setTranscriptVisible(!transcriptVisible)}
                        showCoaching={!!note.transcript?.length}
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
                                  if (t.id === meetingTemplate) {
                                    setShowTemplateMenu(false);
                                    return;
                                  }
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

                {/* People, Company, Tags */}
                {id && <MeetingMetadata noteId={id} />}

                {viewMode === "ai-notes" ? (
                  <>
                    {note.summary ? (
                      <EditableSummary
                        summary={{
                          ...note.summary,
                          actionItems: note.summary.actionItems?.map((item: any) => ({
                            ...item,
                            priority: (["high", "medium", "low"].includes(item.priority) ? item.priority : "medium") as "high" | "medium" | "low",
                          })),
                        }}
                        onUpdate={(updated) => {
                          if (id) updateNote(id, { summary: updated });
                        }}
                        meetingTitle={note.title}
                        meetingDate={note.date}
                      />
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
                    return groups.map((group, groupIdx) => {
                    const displayLabel = group.speaker === "You" ? "Me" : "Them";
                    const isNew = group.indices.some((i) => i >= totalSaved);
                    const prevGroup = groupIdx > 0 ? groups[groupIdx - 1] : null;
                    const showLabel = !prevGroup || prevGroup.speaker !== group.speaker;
                    const anchorIndex = group.indices[0];
                    return (
                      <div
                        key={group.indices.join("-")}
                        id={anchorIndex !== undefined ? `syag-transcript-line-${anchorIndex}` : undefined}
                        className={isNew ? "animate-fade-in scroll-mt-4" : "scroll-mt-4"}
                      >
                        {showLabel ? (
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-medium text-foreground">
                              {displayLabel.charAt(0)}
                            </div>
                            <span className="text-[10px] font-medium text-foreground">{displayLabel}</span>
                          </div>
                        ) : (
                          <div className="h-1" />
                        )}
                        <p className="text-[12px] text-muted-foreground leading-relaxed pl-6">
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
            </div>
          )}
        </div>
      </main>
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
  const api = getElectronAPI();
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
    if (note.coachingMetrics) return note.coachingMetrics;
    if (!note.transcript?.length || meetingDurationSec <= 0) return null;
    const computed = computeCoachingMetrics(note.transcript, meetingDurationSec);
    updateNote(note.id, { coachingMetrics: computed });
    return computed;
  }, [note.coachingMetrics, note.transcript, meetingDurationSec, note.id, updateNote]);

  const heuristics = useMemo(() => {
    if (!note.transcript?.length || meetingDurationSec <= 0) return null;
    const h = computeConversationHeuristics(note.transcript, meetingDurationSec, accountRoleId);
    const tags = [...h.suggestedHabitTags];
    if (metrics && metrics.totalFillerCount >= 12) tags.push("filler_heavy");
    if (metrics && metrics.fillerWordsPerMinute >= 3) tags.push("filler_heavy");
    return { ...h, suggestedHabitTags: [...new Set(tags)] };
  }, [note.transcript, meetingDurationSec, accountRoleId, metrics]);

  const [roleInsights, setRoleInsights] = useState<string[]>(metrics?.roleInsights ?? []);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationFailed, setConversationFailed] = useState(false);
  const [conversationErrorDetail, setConversationErrorDetail] = useState<string | null>(null);
  const conversationAnalysisStarted = useRef(false);
  const [metricsExpanded, setMetricsExpanded] = useState(false);

  useEffect(() => {
    setConversationFailed(false);
    setConversationErrorDetail(null);
    conversationAnalysisStarted.current = false;
  }, [note.id]);

  useEffect(() => {
    if (
      !metrics ||
      metrics.conversationInsights != null ||
      !api?.coaching?.analyzeConversation ||
      !note.transcript?.length ||
      !accountRoleId ||
      conversationAnalysisStarted.current
    ) {
      return;
    }
    conversationAnalysisStarted.current = true;
    let cancelled = false;
    setConversationLoading(true);
    (async () => {
      try {
        const { roleInsights: _ri, conversationInsights: _ci, ...metricsForApi } = metrics;
        const result = await api.coaching!.analyzeConversation({
          transcript: note.transcript,
          metrics: metricsForApi as unknown as Record<string, unknown>,
          heuristics,
          roleId: accountRoleId,
        });
        if (cancelled) return;
        if (result.ok) {
          updateNote(note.id, { coachingMetrics: { ...metrics, conversationInsights: result.data } });
          setConversationErrorDetail(null);
        } else {
          setConversationFailed(true);
          setConversationErrorDetail(result.message);
        }
      } catch {
        if (!cancelled) {
          setConversationFailed(true);
          setConversationErrorDetail("Conversation analysis failed unexpectedly.");
        }
      } finally {
        if (!cancelled) setConversationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metrics, api, note.id, note.transcript, updateNote, accountRoleId, heuristics]);

  /** Metrics-only LLM coaching — skipped while transcript+role analysis is expected (primary), or once it exists. */
  useEffect(() => {
    if (!metrics || metrics.roleInsights?.length || !api?.coaching) return;
    if (metrics.conversationInsights) return;
    const transcriptCoachingEligible = !!(
      api?.coaching?.analyzeConversation &&
      accountRoleId &&
      note.transcript?.length
    );
    if (transcriptCoachingEligible && !conversationFailed) return;

    let cancelled = false;
    (async () => {
      if (!accountRoleId || cancelled) return;
      setInsightsLoading(true);
      try {
        const result = await api.coaching!.generateRoleInsights(metrics, accountRoleId);
        if (!cancelled && result.roleInsights.length > 0) {
          setRoleInsights(result.roleInsights);
          updateNote(note.id, { coachingMetrics: { ...metrics, roleInsights: result.roleInsights, roleId: accountRoleId } });
        }
      } catch { /* ignore */ }
      if (!cancelled) setInsightsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [metrics, api, note.id, note.transcript, updateNote, accountRoleId, conversationFailed]);

  const conv = metrics?.conversationInsights;

  if (!metrics) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No transcript data available for coaching analysis.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Record a meeting to get role-aware meeting coaching.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!accountRoleId && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground">
          Choose your <span className="font-medium text-foreground">role</span> in Settings to unlock transcript-grounded coaching and role frameworks.
        </div>
      )}

      {/* Transcript-grounded meeting coaching (primary) */}
      {(conv || conversationLoading) && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
          <div>
            <h4 className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" />
              Meeting effectiveness
            </h4>
            <p className="text-[11px] text-muted-foreground mt-1">
              What you said, when, and how it lines up with your role — not just speaking pace.
            </p>
          </div>
          {conversationLoading && !conv ? (
            <p className="text-[12px] text-muted-foreground animate-pulse">Analyzing transcript against your role and knowledge base…</p>
          ) : conv ? (
            <>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Pattern</p>
                <p className="text-[15px] font-semibold text-foreground leading-snug">{conv.headline}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card/80 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">What we noticed</p>
                <p className="text-[13px] text-foreground leading-relaxed">{conv.narrative}</p>
              </div>
              {conv.habitTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {conv.habitTags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground"
                    >
                      {t.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Micro-insights</p>
                <ul className="space-y-2">
                  {conv.microInsights.map((m, i) => (
                    <li key={i} className="text-[12px] text-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
                      <span>{m.text}</span>
                      {m.framework && (
                        <span className="block text-[10px] text-muted-foreground mt-0.5">Framework: {m.framework}</span>
                      )}
                      {m.evidenceQuote && (
                        <blockquote className="mt-1 text-[11px] text-muted-foreground italic border-l border-border pl-2">
                          “{m.evidenceQuote}”
                          {(m.speaker || m.time) && (
                            <span className="not-italic text-[10px] block mt-0.5">
                              {[m.speaker, m.time].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </blockquote>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              {conv.keyMoments.length > 0 && onJumpToTranscriptLine && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Quote className="h-3 w-3" />
                    Key moments (transcript)
                  </p>
                  <ul className="space-y-2">
                    {conv.keyMoments.map((km, i) => {
                      const idx = findTranscriptLineIndexForQuote(note.transcript, km.quote);
                      return (
                        <li
                          key={i}
                          className="flex items-start justify-between gap-2 rounded-md border border-border bg-background/80 p-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-foreground">{km.title}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">“{km.quote}”</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              {km.speaker} · {km.time}
                            </p>
                          </div>
                          {idx !== undefined && (
                            <button
                              type="button"
                              onClick={() => onJumpToTranscriptLine(idx)}
                              className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              title="Show in transcript"
                            >
                              <Crosshair className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Supporting signals (turns, questions, monologue) — context for the analysis above */}
      {heuristics && (
        <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 space-y-2">
          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Supporting signals</h4>
          <p className="text-[10px] text-muted-foreground/90 -mt-1">Quick counts; the main coaching is transcript + role above.</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-md bg-background border border-border px-2 py-0.5 text-[10px] text-foreground">
              Your turns: {heuristics.yourTurns}
            </span>
            <span className="rounded-md bg-background border border-border px-2 py-0.5 text-[10px] text-foreground">
              Questions (you): {Math.round(heuristics.questionRatioYou * 100)}% of turns
            </span>
            <span className="rounded-md bg-background border border-border px-2 py-0.5 text-[10px] text-foreground">
              Longest run (you): {heuristics.longestYouMonologueWords} words
            </span>
            {heuristics.suggestedHabitTags.map((t) => (
              <span
                key={t}
                className="rounded-md bg-accent/10 border border-accent/25 px-2 py-0.5 text-[10px] text-accent font-medium"
              >
                {t.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {conversationFailed && !conv && !conversationLoading && accountRoleId && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            {conversationErrorDetail || "Conversation analysis didn’t complete. Check your AI model in Settings, or use Ask → Coach me."}
          </p>
          <button
            type="button"
            className="shrink-0 text-[11px] font-medium text-accent hover:underline"
            onClick={async () => {
              if (!api?.coaching?.analyzeConversation || !metrics || !heuristics) return;
              conversationAnalysisStarted.current = true;
              setConversationFailed(false);
              setConversationLoading(true);
              try {
                const { roleInsights: _ri, conversationInsights: _ci, ...metricsForApi } = metrics;
                const result = await api.coaching.analyzeConversation({
                  transcript: note.transcript,
                  metrics: metricsForApi as unknown as Record<string, unknown>,
                  heuristics,
                  roleId: accountRoleId,
                });
                if (result.ok) {
                  updateNote(note.id, { coachingMetrics: { ...metrics, conversationInsights: result.data } });
                  setConversationErrorDetail(null);
                } else {
                  setConversationFailed(true);
                  setConversationErrorDetail(result.message);
                }
              } catch {
                setConversationFailed(true);
                setConversationErrorDetail("Conversation analysis failed unexpectedly.");
              } finally {
                setConversationLoading(false);
              }
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Metrics-only coaching — fallback when transcript analysis isn’t available or failed */}
      {(roleInsights.length > 0 || insightsLoading) && !conv && !conversationLoading && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-2">
          <h4 className="text-xs font-medium text-accent uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Delivery &amp; pace (metrics)
          </h4>
          <p className="text-[10px] text-muted-foreground">
            From talk-time and filler metrics. Prefer <span className="font-medium text-foreground">Meeting effectiveness</span> above when present.
          </p>
          {insightsLoading && roleInsights.length === 0 ? (
            <p className="text-[12px] text-muted-foreground animate-pulse">Generating coaching insights...</p>
          ) : (
            <ul className="space-y-1.5">
              {roleInsights.map((insight, i) => (
                <li key={i} className="text-[12px] text-foreground leading-relaxed flex gap-2">
                  <span className="text-accent flex-shrink-0 mt-0.5">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Speaking Metrics (collapsible — secondary to qualitative coaching above) */}
      <div className="rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setMetricsExpanded(!metricsExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/30 transition-colors rounded-xl"
        >
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Mic className="h-3 w-3" />
            Speaking Metrics
          </h4>
          {metricsExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {metricsExpanded && (
          <div className="px-4 pb-4 space-y-4">
            <CommunicationMixBar metrics={metrics} />
            <CoachingCard metrics={metrics} meetingDurationSec={meetingDurationSec} />
          </div>
        )}
      </div>
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
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Communication Mix</h4>
      <div className="flex rounded-full overflow-hidden h-4">
        {youPct > 0 && (
          <div
            className="bg-[hsl(24,45%,42%)] dark:bg-[hsl(24,42%,55%)] transition-all"
            style={{ width: `${youPct}%` }}
            title={`You: ${youPct}%`}
          />
        )}
        {othersPct > 0 && (
          <div
            className="bg-[hsl(28,18%,72%)] dark:bg-[hsl(28,8%,45%)] transition-all"
            style={{ width: `${othersPct}%` }}
            title={`Others: ${othersPct}%`}
          />
        )}
        {silencePct > 0 && (
          <div
            className="bg-[hsl(25,14%,89%)] dark:bg-[hsl(22,8%,22%)] transition-all"
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
      <mark key={i} className="bg-orange-100/60 dark:bg-orange-900/25 text-orange-700 dark:text-orange-300 rounded-sm px-0.5">{part}</mark>
    ) : (
      part
    )
  );
}
