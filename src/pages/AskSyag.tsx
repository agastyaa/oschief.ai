import { useState, useRef, useEffect } from "react";
import { Sparkles, ArrowUp } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const suggestions = [
  "What were the key decisions from last week?",
  "Summarize all action items assigned to me",
  "What did we discuss about the product roadmap?",
  "Any updates on hiring?",
];

export default function AskSyag() {
  const { getActiveAIModelLabel } = useModelSettings();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = (text?: string) => {
    const question = text || input.trim();
    if (!question) return;
    setInput("");
    const modelLabel = getActiveAIModelLabel();

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setIsLoading(true);

    // Simulate AI response
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
        {/* Scrollable message area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
                <Sparkles className="h-6 w-6 text-accent" />
              </div>
              <h2 className="font-display text-xl text-foreground mb-1">What would you like to know?</h2>
              <p className="mb-6 max-w-sm text-[13px] text-muted-foreground">
                Ask me anything about your meetings — decisions, action items, and insights.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-w-md w-full">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="rounded-lg border border-border bg-card p-3 text-left text-[13px] text-foreground transition-all hover:border-ring/20 hover:shadow-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl px-6 py-6 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-2.5 animate-fade-in", msg.role === "user" ? "justify-end" : "")}>
                  {msg.role === "assistant" && (
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-accent/10 mt-1">
                      <Sparkles className="h-2.5 w-2.5 text-accent" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line",
                      msg.role === "user"
                        ? "bg-accent text-accent-foreground"
                        : "bg-card border border-border text-foreground"
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2.5 animate-fade-in">
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-accent/10 mt-1">
                    <Sparkles className="h-2.5 w-2.5 text-accent" />
                  </div>
                  <div className="bg-card border border-border rounded-xl px-3.5 py-2.5">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Full-width input bar */}
        <div className="border-t border-border px-4 py-3">
          <div className="mx-auto max-w-2xl flex items-center gap-2">
            <div className="flex flex-1 items-center rounded-full border border-border bg-card shadow-sm px-4 py-2.5">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
              />
              {input.trim() && (
                <button
                  onClick={() => handleSend()}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all hover:opacity-90 ml-2 flex-shrink-0"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
