import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  X,
  Play,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  MessageCircle,
  ScrollText,
  MessagesSquare,
  ScanEye,
  Lightbulb,
  Target,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { askSyagInputShell, askSyagPanelShell, askSyagPanelHeader } from "@/lib/ask-syag-styles";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { getElectronAPI, isElectron } from "@/lib/electron-api";
import { ChatMessageContent } from "@/components/ChatMessageContent";

/** Used for one-click “You were mentioned” and / menu — sent with full note context. */
export const WHAT_SHOULD_I_SAY_PROMPT =
  "What should I say next? Using this meeting’s transcript and notes, give 2–4 short, concrete things I could say. If I was just mentioned by name, address that first.";

type SlashPromptGroup = "live" | "catch_up" | "growth";

export type SlashPromptDefinition = {
  label: string;
  prompt: string;
  description: string;
  icon: LucideIcon;
  group: SlashPromptGroup;
};

const SLASH_GROUP_LABEL: Record<SlashPromptGroup, string> = {
  live: "In the moment",
  catch_up: "Catch up",
  growth: "Level up",
};

/** Slash-menu entries (also referenced for `isSlashPrompt` in handleSend). */
export const SLASH_PROMPT_ITEMS: readonly SlashPromptDefinition[] = [
  {
    label: "What should I say?",
    description: "Next lines to say from transcript & notes",
    icon: MessageCircle,
    group: "live",
    prompt: WHAT_SHOULD_I_SAY_PROMPT,
  },
  {
    label: "TL;DR",
    description: "Short summary of what matters",
    icon: ScrollText,
    group: "catch_up",
    prompt: "Give me a brief TL;DR of these notes.",
  },
  {
    label: "What is being discussed",
    description: "Main topics on the table",
    icon: MessagesSquare,
    group: "catch_up",
    prompt: "What are the main topics being discussed?",
  },
  {
    label: "What did I miss",
    description: "Key points you should know",
    icon: ScanEye,
    group: "catch_up",
    prompt: "What did I miss? Summarize the key points I should know.",
  },
  {
    label: "How can I look smart",
    description: "Takeaways & talking points for follow-up",
    icon: Lightbulb,
    group: "growth",
    prompt: "What are the key takeaways and talking points so I can contribute smartly in follow-up?",
  },
  {
    label: "Coach me",
    description: "Role-based coaching on how you ran this meeting",
    icon: Target,
    group: "growth",
    prompt:
      "Coach me on how I ran this meeting based on my role. Focus on: (1) substance — did I say the right things at the right time? (2) questions — did I ask enough discovery/clarifying questions before jumping to solutions? (3) commitments — were next steps clear and assigned? (4) missed opportunities — what should I have said or asked? Reference specific transcript moments. Be direct, no generic praise.",
  },
  {
    label: "Prep for follow-up",
    description: "Who to ping, what to bring, frameworks",
    icon: CalendarCheck,
    group: "growth",
    prompt:
      "Help me prepare for a follow-up to this meeting. What should I bring up, who should I follow up with, and what frameworks should I apply?",
  },
] as const;

interface AskBarProps {
  context?: "home" | "meeting";
  meetingTitle?: string;
  noteContext?: string;
  coachingMetrics?: any;
  leftSlot?: React.ReactNode;
  /** Slot for Generate summary button, shown beside pause when paused */
  generateSummarySlot?: React.ReactNode;
  onResumeRecording?: () => void;
  onPauseRecording?: () => void;
  onToggleTranscript?: () => void;
  transcriptVisible?: boolean;
  /** When true, transcript toggle is shown elsewhere (e.g. beside NotesViewToggle) */
  hideTranscriptToggle?: boolean;
  recordingState?: "recording" | "paused" | "stopped";
  elapsed?: string;
  /** One-line LLM summary when the user's name appears in the live transcript (meeting only). */
  mentionContextHint?: string | null;
  mentionHintLoading?: boolean;
  onDismissMentionHint?: () => void;
  onTriggerMentionLLM?: () => Promise<void>;
}

export function AskBar({ context = "home", meetingTitle, noteContext, coachingMetrics, leftSlot, generateSummarySlot, onResumeRecording, onPauseRecording, onToggleTranscript, transcriptVisible, hideTranscriptToggle, recordingState, elapsed, mentionContextHint, mentionHintLoading, onDismissMentionHint, onTriggerMentionLLM }: AskBarProps) {
  const { getActiveAIModelLabel, selectedAIModel } = useModelSettings();
  const api = getElectronAPI();

  const [input, setInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string; displayText?: string }[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasInput = input.trim().length > 0;
  const contextLabel = context === "meeting" ? meetingTitle || "This note" : "All notes";

  const showSlashMenu = isActive && input === "/";

  useEffect(() => {
    if (showSlashMenu) setSlashHighlightIndex(0);
  }, [showSlashMenu]);

  useEffect(() => {
    if (!showSlashMenu) return;
    const el = document.querySelector(`[data-slash-index="${slashHighlightIndex}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [slashHighlightIndex, showSlashMenu]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setIsActive(false);
        if (!showChat) {
          setMessages([]);
          setInput("");
        }
      }
    };
    if (isActive || showChat) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isActive, showChat]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (override?: string, displayLabel?: string) => {
    const q = (override ?? input).trim();
    if (!q) return;
    setInput("");
    setShowChat(true);

    const userMsg = { role: "user" as const, text: q, displayText: displayLabel };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const isSlashPrompt = SLASH_PROMPT_ITEMS.some((s) => s.prompt === q);

    if (api && selectedAIModel) {
      try {
        const chatMessages = [...messages, userMsg].map(m => ({
          role: m.role,
          content: m.text,
        }));

        let userProfile: any = undefined;
        try {
          const raw = localStorage.getItem("syag-account");
          if (raw) userProfile = JSON.parse(raw);
        } catch {}

        let effectiveNotes = noteContext;
        if (isSlashPrompt && effectiveNotes) {
          const lines = effectiveNotes.split('\n');
          const transcriptIdx = lines.findIndex(l => l.startsWith('TRANSCRIPT:'));
          if (transcriptIdx >= 0) {
            const beforeTranscript = lines.slice(0, transcriptIdx + 1);
            const transcriptLines = lines.slice(transcriptIdx + 1);
            const recentLines = transcriptLines.slice(-25);
            effectiveNotes = [...beforeTranscript, ...recentLines].join('\n');
          }
        }

        const contextData: any = {};
        if (effectiveNotes) contextData.notes = effectiveNotes;
        if (isSlashPrompt) {
          contextData.mode = 'quick';
        } else {
          if (userProfile?.name || userProfile?.role) contextData.userProfile = userProfile;
          if (coachingMetrics) contextData.coachingMetrics = coachingMetrics;
        }

        const response = await api.llm.chat({
          messages: chatMessages,
          context: Object.keys(contextData).length > 0 ? contextData : undefined,
          model: selectedAIModel,
        });

        if (response) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: response },
          ]);
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `Error: ${err.message || 'Failed to get response. Check your AI model in Settings.'}` },
        ]);
      }
    } else {
      const modelLabel = getActiveAIModelLabel();
      await new Promise(r => setTimeout(r, 500));
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `[${modelLabel || 'No model'}] Connect an AI model in Settings to ask questions about your notes.` },
      ]);
    }
    setIsLoading(false);
  }, [input, messages, api, selectedAIModel, noteContext, getActiveAIModelLabel]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSlashMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashHighlightIndex((i) => Math.min(i + 1, SLASH_PROMPT_ITEMS.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashHighlightIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const item = SLASH_PROMPT_ITEMS[slashHighlightIndex];
        if (item) handleSlashSelect(item.prompt, item.label);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape") {
      if (showSlashMenu) {
        setInput("");
      } else {
        setIsActive(false);
        setShowChat(false);
        setMessages([]);
        setInput("");
      }
    }
  };

  const handleSlashSelect = (prompt: string, label?: string) => {
    setInput("");
    handleSend(prompt, label);
  };

  const handleBarClick = () => {
    setIsActive(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCloseChat = () => {
    setShowChat(false);
    setMessages([]);
  };

  return (
    <div ref={barRef} className="px-4 pb-3 pt-2 pointer-events-none relative">
      <div className="mx-auto max-w-2xl pointer-events-auto">
        {showChat && messages.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-2 mx-auto max-w-2xl w-full animate-fade-in">
            <div className={askSyagPanelShell}>
              <div className={cn("flex items-center justify-between px-4 py-2.5", askSyagPanelHeader)}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-sm">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground leading-tight">Ask Syag</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      <span className="font-medium text-foreground/80">{contextLabel}</span>
                      {getActiveAIModelLabel() ? (
                        <span className="text-muted-foreground/90"> · {getActiveAIModelLabel()}</span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseChat}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                  aria-label="Close chat"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div ref={scrollRef} className="h-[28rem] max-h-[75vh] overflow-y-auto px-4 py-4 space-y-3 bg-gradient-to-b from-muted/20 via-transparent to-transparent">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex animate-fade-in", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[90%] text-[13px] leading-relaxed shadow-sm",
                        msg.role === "user"
                          ? "rounded-2xl bg-accent text-accent-foreground px-3.5 py-2.5"
                          : "rounded-2xl border border-border/50 bg-card/90 px-3.5 py-3 text-foreground"
                      )}
                    >
                      {msg.role === "user" ? (
                        <span className="font-medium">{msg.displayText || msg.text}</span>
                      ) : (
                        <ChatMessageContent text={msg.text} className="text-[13px]" />
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="rounded-2xl border border-border/50 bg-muted/40 px-4 py-3 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse" />
                      <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {(context === "meeting" && (mentionHintLoading || (mentionContextHint && mentionContextHint.length > 0))) && (
          <div className="mb-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent flex-shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">You were mentioned</p>
              {mentionHintLoading ? (
                <p className="text-[13px] text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Summarizing what to address…
                </p>
              ) : (
                <>
                  <p className="text-[13px] text-foreground/90 leading-snug">{mentionContextHint}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {onTriggerMentionLLM && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onTriggerMentionLLM();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[12px] font-medium text-accent hover:bg-accent/20 transition-colors"
                      >
                        <Sparkles className="h-3 w-3" />
                        Get context
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismissMentionHint?.();
                        setIsActive(true);
                        setTimeout(() => inputRef.current?.focus(), 50);
                        void handleSend(WHAT_SHOULD_I_SAY_PROMPT, "What should I say?");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary transition-colors"
                    >
                      What should I say?
                    </button>
                  </div>
                </>
              )}
            </div>
            {!mentionHintLoading && onDismissMentionHint && (
              <button
                type="button"
                onClick={onDismissMentionHint}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {leftSlot}

          {context === "meeting" && recordingState && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!hideTranscriptToggle && (
                <button
                  onClick={onToggleTranscript}
                  className="flex items-center justify-center rounded-xl border border-border/60 backdrop-blur-md bg-card/80 shadow-sm w-9 h-9 text-muted-foreground hover:text-foreground transition-colors"
                  title={transcriptVisible ? "Hide transcript" : "Show transcript"}
                >
                  {transcriptVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}

              <button
                onClick={recordingState === "recording" ? onPauseRecording : onResumeRecording}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl border backdrop-blur-md shadow-sm px-3 py-2 transition-colors",
                  recordingState === "recording"
                    ? "border-border/60 bg-card/80 text-muted-foreground hover:text-foreground animate-recording-ring"
                    : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                )}
                title={recordingState === "recording" ? "Pause recording" : "Resume recording"}
              >
                {elapsed && <span className="text-xs font-medium">{elapsed}</span>}
                {recordingState === "recording" ? (
                  <svg className="h-4 w-4 text-accent" viewBox="0 0 18 16" fill="currentColor">
                    <rect x="1" y="6" width="2.5" height="7" rx="1">
                      <animate attributeName="height" values="7;4;7" dur="0.8s" repeatCount="indefinite" />
                      <animate attributeName="y" values="6;8;6" dur="0.8s" repeatCount="indefinite" />
                    </rect>
                    <rect x="5.5" y="3" width="2.5" height="10" rx="1">
                      <animate attributeName="height" values="10;5;10" dur="0.6s" repeatCount="indefinite" />
                      <animate attributeName="y" values="3;6;3" dur="0.6s" repeatCount="indefinite" />
                    </rect>
                    <rect x="10" y="5" width="2.5" height="8" rx="1">
                      <animate attributeName="height" values="8;3;8" dur="0.7s" repeatCount="indefinite" />
                      <animate attributeName="y" values="5;8;5" dur="0.7s" repeatCount="indefinite" />
                    </rect>
                    <rect x="14.5" y="4" width="2.5" height="9" rx="1">
                      <animate attributeName="height" values="9;5;9" dur="0.9s" repeatCount="indefinite" />
                      <animate attributeName="y" values="4;7;4" dur="0.9s" repeatCount="indefinite" />
                    </rect>
                  </svg>
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              {generateSummarySlot}
            </div>
          )}

          <div
            onClick={handleBarClick}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-xl border backdrop-blur-md px-3 py-2 cursor-text relative min-w-[140px]",
              askSyagInputShell,
              isLoading && "border-accent/45 ring-2 ring-accent/20",
              !isLoading && "hover:border-border"
            )}
          >
            {showSlashMenu && (
              <>
              {createPortal(
                <div
                  className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40"
                  onClick={() => { setInput(""); }}
                  aria-hidden
                />,
                document.body
              )}
              <div
                className="absolute bottom-full left-0 right-0 mb-2 z-50 max-h-[min(380px,50vh)] flex flex-col rounded-xl border border-border bg-card shadow-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] overflow-hidden animate-fade-in"
                role="listbox"
                aria-label="Quick prompts"
              >
                <div className="px-4 py-2.5 border-b border-border/60 bg-gradient-to-r from-accent/[0.07] via-transparent to-primary/[0.05] shrink-0">
                  <p className="text-[11px] font-semibold text-foreground">Quick prompts</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">↑↓ to move · Enter to run · Esc to close</p>
                </div>
                <div className="overflow-y-auto py-1.5 px-1.5">
                  {SLASH_PROMPT_ITEMS.map((item, index) => {
                    const Icon = item.icon;
                    const prev = index > 0 ? SLASH_PROMPT_ITEMS[index - 1] : null;
                    const showGroup = !prev || prev.group !== item.group;
                    const isActiveRow = index === slashHighlightIndex;
                    return (
                      <div key={item.label}>
                        {showGroup && (
                          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/90">
                            {SLASH_GROUP_LABEL[item.group]}
                          </p>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActiveRow}
                          data-slash-index={index}
                          onMouseEnter={() => setSlashHighlightIndex(index)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSlashSelect(item.prompt, item.label);
                          }}
                          className={cn(
                            "w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                            isActiveRow
                              ? "bg-accent/14 ring-1 ring-accent/20"
                              : "hover:bg-muted/60"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                              isActiveRow ? "bg-accent/20 text-accent" : "bg-muted/80 text-muted-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0 pt-0.5">
                            <span className="block text-[13px] font-medium text-foreground leading-snug">{item.label}</span>
                            <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">{item.description}</span>
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              </>
            )}
            {isActive ? (
              <>
                <Sparkles className="h-3.5 w-3.5 text-accent/70 shrink-0" aria-hidden />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Syag anything… type / for prompts"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-w-0"
                />
                {hasInput && !showSlashMenu && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSend(); }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-sm transition-all hover:opacity-90 flex-shrink-0"
                    aria-label="Send"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent shrink-0">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="text-sm text-muted-foreground">
                  <span className="text-foreground/90 font-medium">Ask Syag</span>
                  <span className="text-muted-foreground/80"> — your notes &amp; meeting</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
