import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, X, FileText, Play, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { getElectronAPI, isElectron } from "@/lib/electron-api";
import { ChatMessageContent } from "@/components/ChatMessageContent";

/** Used for one-click “You were mentioned” and / menu — sent with full note context. */
export const WHAT_SHOULD_I_SAY_PROMPT =
  "What should I say next? Using this meeting’s transcript and notes, give 2–4 short, concrete things I could say. If I was just mentioned by name, address that first.";

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
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasInput = input.trim().length > 0;
  const contextLabel = context === "meeting" ? meetingTitle || "This note" : "All notes";

  const SLASH_PROMPTS = [
    { label: "What should I say?", prompt: WHAT_SHOULD_I_SAY_PROMPT },
    { label: "TL;DR", prompt: "Give me a brief TL;DR of these notes." },
    { label: "What is being discussed", prompt: "What are the main topics being discussed?" },
    { label: "What did I miss", prompt: "What did I miss? Summarize the key points I should know." },
    { label: "How can I look smart", prompt: "What are the key takeaways and talking points so I can contribute smartly in follow-up?" },
    { label: "Coach me", prompt: "Based on this meeting, give me personalized coaching tips. How did I do? What could I improve? Reference specific moments from the transcript and my coaching metrics if available." },
    { label: "Prep for follow-up", prompt: "Help me prepare for a follow-up to this meeting. What should I bring up, who should I follow up with, and what frameworks should I apply?" },
  ];
  const showSlashMenu = isActive && input === "/";

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

  const handleSend = useCallback(async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q) return;
    setInput("");
    setShowChat(true);

    const userMsg = { role: "user" as const, text: q };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    if (api && selectedAIModel) {
      try {
        const chatMessages = [...messages, userMsg].map(m => ({
          role: m.role,
          content: m.text,
        }));

        // Load user profile from localStorage for coaching context
        let userProfile: any = undefined;
        try {
          const raw = localStorage.getItem("syag-account");
          if (raw) userProfile = JSON.parse(raw);
        } catch {}

        const contextData: any = {};
        if (noteContext) contextData.notes = noteContext;
        if (userProfile?.name || userProfile?.role) contextData.userProfile = userProfile;
        if (coachingMetrics) contextData.coachingMetrics = coachingMetrics;

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

  const handleSlashSelect = (prompt: string) => {
    setInput("");
    handleSend(prompt);
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
          <div className="absolute bottom-full left-4 right-4 mb-2 mx-auto max-w-2xl w-full">
            <div className="rounded-lg border border-border/60 backdrop-blur-xl bg-card/90 shadow-lg overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[12px] text-muted-foreground">
                    Context: <span className="text-foreground font-medium">{contextLabel}</span>
                  </span>
                </div>
                <button
                  onClick={handleCloseChat}
                  className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div ref={scrollRef} className="h-[28rem] max-h-[75vh] overflow-y-auto px-3.5 py-3 space-y-2.5">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[88%] rounded-lg px-3 py-2.5 text-[13px] leading-relaxed",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                      )}
                    >
                      {msg.role === "user" ? msg.text : <ChatMessageContent text={msg.text} />}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-secondary rounded-lg px-3 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
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
                        void handleSend(WHAT_SHOULD_I_SAY_PROMPT);
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
                  className="flex items-center justify-center rounded-lg border border-border/60 backdrop-blur-md bg-card/80 shadow-sm w-9 h-9 text-muted-foreground hover:text-foreground transition-colors"
                  title={transcriptVisible ? "Hide transcript" : "Show transcript"}
                >
                  {transcriptVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}

              <button
                onClick={recordingState === "recording" ? onPauseRecording : onResumeRecording}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border backdrop-blur-md shadow-sm px-3 py-2 transition-colors",
                  recordingState === "recording"
                    ? "border-border/60 bg-card/80 text-muted-foreground hover:text-foreground"
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
              "flex flex-1 items-center rounded-lg border backdrop-blur-md bg-card/80 px-3.5 py-2 cursor-text relative min-w-[140px] transition-all",
              isLoading
                ? "border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)] ring-1 ring-primary/20"
                : "border-border/60 hover:border-muted-foreground/30 shadow-sm"
            )}
          >
            {showSlashMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border/60 backdrop-blur-xl bg-card/90 shadow-md overflow-hidden z-50">
                {SLASH_PROMPTS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSlashSelect(item.prompt); }}
                    className="w-full px-3.5 py-2 text-left text-[13px] text-foreground hover:bg-secondary transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {isActive ? (
              <>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything… type / for prompts"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-w-0"
                />
                {hasInput && !showSlashMenu && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSend(); }}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground transition-all hover:brightness-110 ml-2 flex-shrink-0"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground/60">Ask anything…</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
