import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, X, FileText, Play, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { getElectronAPI, isElectron } from "@/lib/electron-api";

interface AskBarProps {
  context?: "home" | "meeting";
  meetingTitle?: string;
  noteContext?: string;
  leftSlot?: React.ReactNode;
  onResumeRecording?: () => void;
  onPauseRecording?: () => void;
  onToggleTranscript?: () => void;
  transcriptVisible?: boolean;
  recordingState?: "recording" | "paused" | "stopped";
  elapsed?: string;
}

export function AskBar({ context = "home", meetingTitle, noteContext, leftSlot, onResumeRecording, onPauseRecording, onToggleTranscript, transcriptVisible, recordingState, elapsed }: AskBarProps) {
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

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const q = input;
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

        const contextData = noteContext
          ? { notes: noteContext }
          : undefined;

        const response = await api.llm.chat({
          messages: chatMessages,
          context: contextData,
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
      setIsActive(false);
      setShowChat(false);
      setMessages([]);
      setInput("");
    }
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
    <div ref={barRef} className="px-4 pb-4 pointer-events-none relative">
      <div className="mx-auto max-w-md pointer-events-auto">
        {showChat && messages.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-2 mx-auto max-w-md">
            <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Context: <span className="text-foreground font-medium">{contextLabel}</span>
                  </span>
                </div>
                <button
                  onClick={handleCloseChat}
                  className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div ref={scrollRef} className="h-64 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                        msg.role === "user"
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-foreground"
                      )}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-secondary rounded-xl px-3 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {leftSlot}

          {context === "meeting" && recordingState && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={onToggleTranscript}
                className="flex items-center justify-center rounded-full border border-border bg-card shadow-lg w-10 h-10 text-muted-foreground hover:text-foreground transition-colors"
                title={transcriptVisible ? "Hide transcript" : "Show transcript"}
              >
                {transcriptVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>

              <button
                onClick={recordingState === "recording" ? onPauseRecording : onResumeRecording}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border shadow-lg px-3 py-2.5 transition-colors",
                  recordingState === "recording"
                    ? "border-border bg-card text-muted-foreground hover:text-foreground"
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
            </div>
          )}

          <div
            onClick={handleBarClick}
            className="flex flex-1 items-center rounded-full border border-border bg-card shadow-lg px-4 py-2.5 cursor-text"
          >
            {isActive ? (
              <>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
                />
                {hasInput && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSend(); }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all hover:opacity-90 ml-2 flex-shrink-0"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Ask anything</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
