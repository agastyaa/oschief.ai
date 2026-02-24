import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowUp, ChevronDown, ChevronRight, FileText, Square } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { useNotes } from "@/contexts/NotesContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";

import { cn, normalizeChatResponse } from "@/lib/utils";
import { ChatMessageContent } from "@/components/ChatMessageContent";

interface Message {
  role: "user" | "assistant";
  text: string;
  context?: { label: string; detail: string };
  recipe?: { label: string; color: string };
}

const recipes = [
  { label: "TL;DR", color: "bg-blue-400/70", prompt: "Give me a brief TL;DR of these notes." },
  { label: "Action items", color: "bg-emerald-400/70", prompt: "List all action items with owners. Format: **Name** — task." },
  { label: "My action items", color: "bg-emerald-400/70", prompt: "Only things I need to do from these notes/meetings. Include enough context so I remember what it's about in 3 days. Ignore everyone else's tasks." },
  { label: "Follow-up email", color: "bg-violet-400/70", prompt: "Draft a follow-up email: One line thanks (not effusive), 2-3 key decisions/takeaways as bullets, action items with owners, next meeting if scheduled. Under 150 words. Professional, direct." },
  { label: "Slack update", color: "bg-amber-400/70", prompt: "Slack message for people who weren't there. 3-5 bullets. Casual but informative. No emoji. No fluff." },
  { label: "Decisions only", color: "bg-sky-400/70", prompt: "List only the decisions made. For each: what was decided, who decided it, and any caveats." },
  { label: "Weekly recap", color: "bg-orange-400/70", prompt: "Weekly recap of key outcomes and action items across these notes." },
];

export default function AskSyag() {
  const location = useLocation();
  const navigate = useNavigate();
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
  const addedFromStreamRef = useRef(false);

  // Apply initial messages when navigated from home Ask bar
  useEffect(() => {
    const initial = location.state?.initialMessages as { role: string; text: string }[] | undefined;
    if (Array.isArray(initial) && initial.length > 0) {
      setMessages(
        initial.map((m) => ({ role: m.role as "user" | "assistant", text: m.text ?? "" }))
      );
      navigate("/ask", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  // Listen for streaming chat chunks
  useEffect(() => {
    if (!api) return;

    const cleanup = api.llm.onChatChunk((chunk) => {
      if (chunk.done) {
        setStreamingText((current) => {
          if (current) {
            addedFromStreamRef.current = true;
            setMessages((prev) => [...prev, { role: "assistant", text: normalizeChatResponse(current) }]);
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

    const relevantNotes = useTranscripts
      ? notes.slice(0, 25)
      : notes;

    return relevantNotes.map((note) => {
      const parts = [`## ${note.title} (${note.date})`];
      if (useTranscripts && note.transcript?.length > 0) {
        parts.push("Transcript: " + note.transcript.map(t => t.text).join(" "));
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
      return parts.join("\n");
    }).join("\n\n");
  }, [notes, useTranscripts]);

  const handleSend = useCallback(async (text?: string, recipe?: { label: string; color: string }) => {
    const question = text || input.trim();
    if (!question) return;
    setInput("");
    const modelLabel = getActiveAIModelLabel();

    const userMsg: Message = {
      role: "user",
      text: question,
      context: { label: "My notes", detail: useTranscripts ? "+ Last 25 transcripts" : "All notes" },
      recipe,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setStreamingText("");
    addedFromStreamRef.current = false;

    if (api && selectedAIModel) {
      try {
        const notesContext = buildNotesContext();
        const chatMessages = [...messages, userMsg].map(m => ({
          role: m.role,
          content: m.text,
        }));

        const response = await api.llm.chat({
          messages: chatMessages,
          context: { notes: notesContext },
          model: selectedAIModel,
        });

        // Only add from response if we didn't already add from stream (avoids duplicate)
        if (response && !addedFromStreamRef.current) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: typeof response === "string" ? response : "" },
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
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center px-6">
              <h1 className="text-lg text-foreground font-medium font-body mb-6">Ask anything about your notes</h1>

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
                    onClick={() => handleSend(r.prompt ?? r.label, r)}
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
