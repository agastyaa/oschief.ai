import { useState, useRef, useEffect } from "react";
import { Sparkles, ArrowUp, ChevronDown, ChevronRight, LayoutGrid, FileText, Square } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { useNotes } from "@/contexts/NotesContext";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  text: string;
  context?: { label: string; detail: string };
  recipe?: { label: string; color: string };
}

const recipes = [
  { label: "TL;DR", color: "bg-blue-400/70" },
  { label: "Action items", color: "bg-emerald-400/70" },
  { label: "Weekly recap", color: "bg-orange-400/70" },
];

export default function AskSyag() {
  const { getActiveAIModelLabel } = useModelSettings();
  const { notes } = useNotes();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useTranscripts, setUseTranscripts] = useState(true);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scope, setScope] = useState<"My transcripts" | "All meetings">("My transcripts");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const noteCount = Math.min(notes.length, 25);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = (text?: string, recipe?: { label: string; color: string }) => {
    const question = text || input.trim();
    if (!question) return;
    setInput("");
    const modelLabel = getActiveAIModelLabel();

    const userMsg: Message = {
      role: "user",
      text: question,
      context: useTranscripts ? { label: scope, detail: `Last ${noteCount || 25} meetings` } : undefined,
      recipe,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `[${modelLabel}] Here's what I found across your notes: Simulated response to "${question}".`,
        },
      ]);
      setIsLoading(false);
    }, 800);
  };

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
              <h1 className="font-display text-2xl text-foreground mb-6">Ask anything about your notes</h1>

              {/* Input card */}
              <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-sm p-4 mb-5">
                {/* Transcript scope row */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setUseTranscripts(!useTranscripts)}
                    className={cn(
                      "relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors",
                      useTranscripts ? "bg-accent" : "bg-muted-foreground/30"
                    )}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
                      style={{ transform: useTranscripts ? "translateX(18px)" : "translateX(3px)" }}
                    />
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => useTranscripts && setScopeOpen(!scopeOpen)}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-sm transition-colors",
                        useTranscripts ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className={useTranscripts ? "font-medium" : ""}>{scope}</span>
                      <span className="text-muted-foreground">· Last {noteCount || 25} meetings</span>
                      {useTranscripts && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    </button>
                    {scopeOpen && (
                      <div className="absolute top-full left-0 mt-1 rounded-lg border border-border bg-card shadow-lg py-1 z-10 min-w-[180px]">
                        {(["My transcripts", "All meetings"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => { setScope(s); setScopeOpen(false); }}
                            className={cn(
                              "block w-full text-left px-4 py-1.5 text-sm transition-colors hover:bg-secondary",
                              s === scope ? "text-accent font-medium" : "text-foreground"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                    onClick={() => handleSend(r.label, r)}
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
                      {/* Context chip */}
                      {msg.context && (
                        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <span className="font-medium text-foreground">{msg.context.label}</span>
                            <span className="text-muted-foreground ml-1.5 text-xs">{msg.context.detail}</span>
                          </div>
                        </div>
                      )}
                      {/* Recipe chip or plain message */}
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
                    <div className="text-[14px] leading-relaxed text-foreground whitespace-pre-line">
                      {msg.text}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
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
