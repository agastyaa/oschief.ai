import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, ChevronDown, ChevronRight, FileText, Square } from "lucide-react";
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { useNotes } from "@/contexts/NotesContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";

import { cn } from "@/lib/utils";
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
];

export default function AskSyag() {
  const { getActiveAIModelLabel, selectedAIModel } = useModelSettings();
  const { notes } = useNotes();
  const { sidebarOpen } = useSidebarVisibility();
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
      context: { label: "My notes", detail: useTranscripts ? "+ Last 25 transcripts" : "All notes" },
      recipe,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setStreamingText("");
    streamingCompletedRef.current = false;

    if (api && selectedAIModel) {
      try {
        const notesContext = buildNotesContext();
        const chatMessages = [...messages, userMsg].map(m => ({
          role: m.role,
          content: m.recipe?.prompt || m.text,
        }));

        const response = await api.llm.chat({
          messages: chatMessages,
          context: {
            notes: notesContext,
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
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      )}
      <main className={cn("flex flex-1 flex-col min-w-0", !sidebarOpen && isElectron && "pl-20")}>
        <div className={cn("flex items-center justify-between px-4 pb-0", isElectron ? "pt-10" : "pt-3")}>
          <SidebarCollapseButton />
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center px-6">
              <h1 className="font-display text-2xl text-foreground mb-6">Ask anything about your notes</h1>

              {/* Input card */}
              <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-sm p-4 mb-5">
                {/* Context row with dropdown */}
                <div className="relative mb-3">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-secondary"
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
                    <div className="absolute top-full left-0 mt-1 rounded-lg border border-border bg-card shadow-lg py-1 z-50 min-w-[220px]">
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
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything"
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
                  />
                  {input.trim() && (
                    <button
                      onClick={() => handleSend()}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all hover:opacity-90 flex-shrink-0"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Recipe chips */}
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
                {recipes.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => handleSend(r.prompt, r)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-all hover:shadow-sm hover:border-ring/20"
                  >
                    <span className={cn("h-2.5 w-1 rounded-full", r.color)} />
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl px-6 py-6 space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className={cn("animate-fade-in", msg.role === "user" ? "flex flex-col items-end gap-1.5" : "")}>
                  {msg.role === "user" ? (
                    <>
                      {msg.context && (
                        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="font-medium text-foreground">{msg.context.label}</span>
                            <span className="text-muted-foreground ml-1.5 text-xs">{msg.context.detail}</span>
                          </div>
                        </div>
                      )}
                      {msg.recipe ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground shadow-sm">
                          <span className={cn("h-2.5 w-1 rounded-full", msg.recipe.color)} />
                          {msg.text}
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="max-w-[80%] rounded-xl bg-accent text-accent-foreground px-3.5 py-2.5 text-[13px] leading-relaxed">
                          {msg.text}
                        </div>
                      )}
                    </>
                  ) : (
                    <ChatMessageContent text={msg.text} />
                  )}
                </div>
              ))}
              {/* Streaming text display */}
              {streamingText && (
                <div className="animate-fade-in">
                  <ChatMessageContent text={streamingText} />
                </div>
              )}
              {isLoading && !streamingText && (
                <div className="animate-fade-in">
                  <div className="flex gap-1 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom input in chat mode */}
        {!isEmpty && (
          <div className="px-4 py-3">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-center rounded-2xl border border-border bg-card shadow-sm px-4 py-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type / for recipes"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
                />
                {isLoading ? (
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground flex-shrink-0"
                  >
                    <Square className="h-3 w-3" />
                  </button>
                ) : input.trim() ? (
                  <button
                    onClick={() => handleSend()}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all hover:opacity-90 flex-shrink-0"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
