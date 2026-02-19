import { useState } from "react";
import { Sparkles, Paperclip, Mic, ChevronDown, ListTodo, PenLine, FileText, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

interface AskBarProps {
  context?: "home" | "meeting";
  meetingTitle?: string;
}

const quickActions = [
  { icon: ListTodo, label: "List recent todos" },
  { icon: PenLine, label: "Write a recap" },
  { icon: FileText, label: "Summarize key points" },
];

export function AskBar({ context = "home", meetingTitle }: AskBarProps) {
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<"this" | "all">(context === "meeting" ? "this" : "all");
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);

  const handleSend = () => {
    if (!input.trim()) return;
    const q = input;
    setInput("");
    setShowChat(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: q },
      { role: "assistant", text: `Here's what I found${meetingTitle ? ` from "${meetingTitle}"` : " across your meetings"}: This is a simulated response to "${q}". In a real app, this would query your meeting notes and transcripts.` },
    ]);
  };

  const handleQuickAction = (label: string) => {
    setShowChat(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: label },
      { role: "assistant", text: `Here are the results for "${label}". This is a simulated response — in a real app, this would process your meeting data.` },
    ]);
  };

  return (
    <div className="border-t border-border bg-background">
      {/* Chat overlay */}
      {showChat && messages.length > 0 && (
        <div className="max-h-64 overflow-y-auto px-6 py-3 space-y-3 border-b border-border bg-card/50">
          <div className="mx-auto max-w-2xl space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "")}>
                {msg.role === "assistant" && (
                  <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-accent/10 mt-0.5">
                    <Sparkles className="h-2 w-2 text-accent" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] rounded-lg px-3 py-1.5 text-[13px] leading-relaxed",
                  msg.role === "user"
                    ? "bg-accent text-accent-foreground"
                    : "bg-card border border-border text-foreground"
                )}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick action chips */}
      <div className="px-6 pt-2 pb-0">
        <div className="mx-auto flex max-w-2xl items-center gap-1.5 overflow-x-auto">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.label)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring/20 hover:text-foreground"
            >
              <Sparkles className="h-2.5 w-2.5 text-accent" />
              {action.label}
            </button>
          ))}
          <button className="flex flex-shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring/20 hover:text-foreground">
            <LayoutGrid className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {/* Input row */}
      <div className="px-6 py-2">
        <div className="mx-auto flex max-w-2xl items-center gap-1.5">
          {/* Context selector */}
          <button
            onClick={() => setScope(scope === "this" ? "all" : "this")}
            className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {context === "meeting" && scope === "this" ? "This note" : "My notes"}
            <span className="text-[10px] text-muted-foreground">{scope === "all" ? "all meetings" : ""}</span>
            <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
          </button>

          {/* Input */}
          <div className="relative flex-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="type / for recipes"
              className="w-full rounded-md border border-border bg-card px-3 py-1.5 pr-20 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">Auto</span>
              <button className="rounded p-1 text-muted-foreground hover:text-foreground">
                <Paperclip className="h-3 w-3" />
              </button>
              <button className="rounded p-1 text-muted-foreground hover:text-foreground">
                <Mic className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
