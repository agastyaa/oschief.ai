import { useState, useRef, useEffect } from "react";
import { Sparkles, Send } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { meetings } from "@/data/meetings";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const suggestions = [
  "What were the key decisions from last week?",
  "Summarize all action items assigned to me",
  "What did we discuss about the product roadmap?",
  "Any updates on hiring?",
];

export default function AskGranola() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const generateAnswer = (question: string): string => {
    const q = question.toLowerCase();
    if (q.includes("action item") || q.includes("assigned to me")) {
      const items = meetings.flatMap((m) =>
        m.actionItems
          .filter((a) => a.assignee === "You" || a.assignee.includes("You"))
          .map((a) => `• ${a.text} (${m.title}) — ${a.done ? "✅ Done" : "⏳ Pending"}`)
      );
      return items.length > 0
        ? `Here are your action items:\n\n${items.join("\n")}`
        : "You have no action items assigned to you across recent meetings.";
    }
    if (q.includes("roadmap") || q.includes("product")) {
      const m = meetings.find((m) => m.title.toLowerCase().includes("roadmap"));
      return m
        ? `From "${m.title}" on ${m.date}:\n\n${m.summary}\n\nKey points:\n${m.keyPoints.map((p) => `• ${p}`).join("\n")}`
        : "I couldn't find a specific roadmap discussion in recent meetings.";
    }
    if (q.includes("hiring") || q.includes("engineer")) {
      return "Based on the Q1 Product Roadmap Review (Feb 14), budget was approved for 2 new senior engineers. Priya Patel was assigned to post job listings — this is still pending.";
    }
    if (q.includes("key decision") || q.includes("last week")) {
      const recent = meetings.slice(0, 3);
      return `Here's a summary of key decisions from recent meetings:\n\n${recent.map((m) => `**${m.title}** (${m.date}):\n${m.keyPoints.slice(0, 2).map((p) => `• ${p}`).join("\n")}`).join("\n\n")}`;
    }
    const relevant = meetings.find(
      (m) =>
        m.title.toLowerCase().includes(q.split(" ").slice(0, 2).join(" ")) ||
        m.summary.toLowerCase().includes(q.split(" ").slice(0, 3).join(" "))
    );
    return relevant
      ? `From "${relevant.title}":\n\n${relevant.summary}`
      : `I searched across ${meetings.length} recent meetings but couldn't find a specific match. Try asking about roadmaps, action items, hiring, or key decisions.`;
  };

  const handleSend = (text?: string) => {
    const question = text || input;
    if (!question.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: question };
    const answer = generateAnswer(question);
    const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: answer };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h1 className="font-display text-lg text-foreground">Granola Chat</h1>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">Ask anything across all your meetings</p>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sage-light mb-4">
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
            <div className="mx-auto max-w-2xl space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`animate-fade-in flex gap-2.5 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-accent/10 mt-1">
                      <Sparkles className="h-2.5 w-2.5 text-accent" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line ${
                      msg.role === "user"
                        ? "bg-accent text-accent-foreground"
                        : "bg-card border border-border text-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border px-6 py-3">
          <div className="mx-auto flex max-w-2xl gap-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Ask a question about your meetings..."
              className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
            <button
              onClick={() => handleSend()}
              className="flex items-center rounded-md bg-accent px-3 py-2 text-accent-foreground transition-all hover:opacity-90"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
