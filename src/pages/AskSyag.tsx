import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, ChevronDown, ChevronRight, FileText, Square, Sparkles } from "lucide-react";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { useNotes } from "@/contexts/NotesContext";
import { getElectronAPI } from "@/lib/electron-api";

import { cn } from "@/lib/utils";
import { askSyagInputShell } from "@/lib/ask-syag-styles";
import { ChatMessageContent } from "@/components/ChatMessageContent";

interface Message {
  role: "user" | "assistant";
  text: string;
  context?: { label: string; detail: string };
  recipe?: { label: string; color: string; prompt: string };
}

const recipes = [
  { label: "TL;DR", color: "bg-blue-400/70", prompt: "Give me a concise TL;DR of my most recent meetings. Include top decisions and next steps." },
  { label: "Action items", color: "bg-emerald-400/70", prompt: "List my open action items across recent meetings, grouped by urgency and owner." },
  { label: "Weekly recap", color: "bg-orange-400/70", prompt: "Create a weekly recap from recent meetings: wins, risks, blockers, and follow-ups." },
  { label: "What's critical?", color: "bg-red-400/70", prompt: "What needs my attention right now? Surface overdue commitments, unresolved decisions, and any risks or blockers from recent meetings. Be direct — tell me what's falling through the cracks." },
];

export default function AskSyag() {
  const { getActiveAIModelLabel, selectedAIModel } = useModelSettings();
  const { notes } = useNotes();
  const api = getElectronAPI();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useTranscripts, setUseTranscripts] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingCompletedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  // Listen for streaming chat chunks
  useEffect(() => {
    if (!api) return;

    const cleanup = api.llm.onChatChunk((chunk) => {
      if (chunk.done) {
        streamingCompletedRef.current = true;
        setStreamingText((current) => {
          if (current) {
            setMessages((prev) => [...prev, { role: "assistant", text: current }]);
          }
          return "";
        });
        setIsLoading(false);
      } else {
        setStreamingText((prev) => prev + chunk.text);
      }
    });

    return cleanup;
  }, [api]);

  const buildNotesContext = useCallback(() => {
    if (notes.length === 0) return "";

    const relevantNotes = (useTranscripts ? notes.slice(0, 25) : notes).slice(0, 25);
    const NOTE_CHAR_LIMIT = useTranscripts ? 1200 : 700;
    const TOTAL_CHAR_LIMIT = useTranscripts ? 18000 : 12000;
    let totalChars = 0;

    const chunks: string[] = [];
    for (const note of relevantNotes) {
      const timeInfo = note.timeRange ? `, ${note.timeRange}` : "";
      const parts = [`## ${note.title} (${note.date}${timeInfo})`];
      if (useTranscripts && note.transcript?.length > 0) {
        const transcriptText = note.transcript.map((t) => t.text).join(" ").trim();
        if (transcriptText) {
          parts.push("Transcript: " + transcriptText.slice(0, 8500));
        }
      }
      if (note.summary) {
        parts.push("Summary: " + note.summary.overview);
        if (note.summary.keyPoints?.length > 0) {
          parts.push("Key Points: " + note.summary.keyPoints.join("; "));
        }
      }
      if (note.personalNotes) {
        parts.push("Notes: " + note.personalNotes);
      }
      const noteChunk = parts.join("\n").trim().slice(0, NOTE_CHAR_LIMIT);
      if (!noteChunk) continue;
      if (totalChars + noteChunk.length > TOTAL_CHAR_LIMIT) break;
      chunks.push(noteChunk);
      totalChars += noteChunk.length;
    }

    return chunks.join("\n\n");
  }, [notes, useTranscripts]);

  const handleSend = useCallback(async (text?: string, recipe?: { label: string; color: string; prompt: string }) => {
    const question = text || input.trim();
    if (!question) return;
    setInput("");
    const modelLabel = getActiveAIModelLabel();

    const userMsg: Message = {
      role: "user",
      text: recipe ? recipe.label : question,
      context: { label: "My notes + graph", detail: useTranscripts ? "+ Transcripts + People/Projects/Decisions" : "Notes + People/Projects/Decisions" },
      recipe,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setStreamingText("");
    streamingCompletedRef.current = false;

    if (api && selectedAIModel) {
      try {
        const notesContext = buildNotesContext();
        // Fetch full graph context (people, projects, decisions, commitments)
        const graphContext = await api.llm.buildGraphContext?.() || '';
        const chatMessages = [...messages, userMsg].map(m => ({
          role: m.role,
          content: m.recipe?.prompt || m.text,
        }));

        const response = await api.llm.chat({
          messages: chatMessages,
          context: {
            notes: notesContext,
            graph: graphContext,
            mode: "ask-syag",
          },
          model: selectedAIModel,
        });

        // Only add direct response if we did NOT receive streaming (avoid duplicate)
        if (response && !streamingCompletedRef.current) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: response },
          ]);
          setIsLoading(false);
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `Error: ${err.message || 'Failed to get response. Check your model settings.'}` },
        ]);
        setIsLoading(false);
      }
    } else {
      // Web fallback: simulated response
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `[${modelLabel || 'No model selected'}] Here's what I found across your notes: Simulated response to "${question}". Connect an AI model in Settings to get real responses.`,
          },
        ]);
        setIsLoading(false);
      }, 800);
    }
  }, [input, messages, getActiveAIModelLabel, useTranscripts, api, selectedAIModel, buildNotesContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center px-6 pb-8">
              <div className="mb-8 text-center max-w-lg">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-accent/12 text-accent mb-4 shadow-sm ring-1 ring-accent/20">
                  <Sparkles className="h-7 w-7" aria-hidden />
                </div>
                <h1 className="font-display text-2xl sm:text-3xl text-foreground tracking-tight mb-2">
                  {localStorage.getItem('assistant-name') || 'Your Chief of Staff'}
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Ask about your meetings, people, projects, and commitments. {localStorage.getItem('assistant-name') || 'OSChief'} searches your full work graph to give answers grounded in what actually happened.
                </p>
                {getActiveAIModelLabel() && (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Using <span className="font-medium text-foreground/90">{getActiveAIModelLabel()}</span>
                  </p>
                )}
              </div>

              {/* Input card */}
              <div className={cn("w-full max-w-xl p-4 mb-6", askSyagInputShell)}>
                {/* Context row with dropdown */}
                <div className="relative mb-3">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/30 px-3 py-1.5 text-sm transition-all hover:bg-muted/50 hover:border-accent/25"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    {useTranscripts ? (
                      <>
                        <span className="font-medium text-foreground">My transcripts</span>
                        <span className="text-muted-foreground">Last 25 meetings</span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-foreground">My notes</span>
                        <span className="text-muted-foreground">All meetings</span>
                      </>
                    )}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                  {dropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 rounded-[10px] border border-border/70 bg-popover shadow-lg py-1 z-50 min-w-[220px] ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
                      <button
                        onClick={() => { setUseTranscripts(false); setDropdownOpen(false); }}
                        className={cn(
                          "block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-secondary",
                          !useTranscripts ? "text-accent font-medium" : "text-foreground"
                        )}
                      >
                        My notes · All meetings
                      </button>
                      <button
                        onClick={() => { setUseTranscripts(true); setDropdownOpen(false); }}
                        className={cn(
                          "block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-secondary",
                          useTranscripts ? "text-accent font-medium" : "text-foreground"
                        )}
                      >
                        Use transcripts (max 25)
                      </button>
                    </div>
                  )}
                </div>

                {/* Input row */}
                <div className="flex items-center gap-2.5">
                  <Sparkles className="h-4 w-4 text-accent/60 shrink-0" aria-hidden />
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything about your notes…"
                    className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none min-w-0"
                  />
                  {input.trim() && (
                    <button
                      onClick={() => handleSend()}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-sm transition-all hover:opacity-90 flex-shrink-0"
                      aria-label="Send"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Recipe chips */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-xl">
                {recipes.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => handleSend(r.prompt, r)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3.5 py-2 text-xs font-medium text-foreground",
                      "shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-accent/35 hover:bg-accent/5"
                    )}
                  >
                    <span className={cn("h-2.5 w-1 rounded-full shrink-0", r.color)} />
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl px-6 py-6 space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className={cn("animate-fade-in", msg.role === "user" ? "flex flex-col items-end gap-2" : "")}>
                  {msg.role === "user" ? (
                    <>
                      {msg.context && (
                        <div className="inline-flex items-center gap-2 rounded-[10px] border border-border/60 bg-muted/25 px-3 py-2 text-sm shadow-sm">
                          <FileText className="h-4 w-4 text-accent/80" />
                          <div>
                            <span className="font-medium text-foreground">{msg.context.label}</span>
                            <span className="text-muted-foreground ml-1.5 text-xs">{msg.context.detail}</span>
                          </div>
                        </div>
                      )}
                      {msg.recipe ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3.5 py-2 text-sm text-foreground shadow-sm">
                          <span className={cn("h-2.5 w-1 rounded-full", msg.recipe.color)} />
                          {msg.text}
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="max-w-[85%] rounded-2xl bg-accent text-accent-foreground px-4 py-3 text-[13px] leading-relaxed shadow-sm font-medium">
                          {msg.text}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-border/50 bg-card/80 px-4 py-3 shadow-sm">
                      <ChatMessageContent text={msg.text} className="text-[13px]" />
                    </div>
                  )}
                </div>
              ))}
              {/* Streaming text display */}
              {streamingText && (
                <div className="animate-fade-in rounded-2xl border border-border/50 bg-card/80 px-4 py-3 shadow-sm">
                  <ChatMessageContent text={streamingText} className="text-[13px]" />
                </div>
              )}
              {isLoading && !streamingText && (
                <div className="animate-fade-in rounded-2xl border border-border/50 bg-muted/30 px-4 py-3 inline-flex">
                  <div className="flex gap-1.5 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom input in chat mode */}
        {!isEmpty && (
          <div className="px-4 py-3 border-t border-border/50 bg-gradient-to-t from-muted/15 to-transparent">
            <div className="mx-auto max-w-2xl">
              <div className={cn("flex items-center gap-2.5 px-4 py-3", askSyagInputShell)}>
                <Sparkles className="h-4 w-4 text-accent/60 shrink-0" aria-hidden />
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your meetings, people, or commitments…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none min-w-0"
                />
                {isLoading ? (
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground flex-shrink-0 cursor-default"
                    aria-label="Loading"
                  >
                    <Square className="h-3 w-3" />
                  </button>
                ) : input.trim() ? (
                  <button
                    onClick={() => handleSend()}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-sm transition-all hover:opacity-90 flex-shrink-0"
                    aria-label="Send"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
