import { useState, useRef } from "react";
import {
  Calendar, Clock, Users, CheckCircle2, Circle, Sparkles,
  Share2, MoreHorizontal, Pause, Play, Mic, Send
} from "lucide-react";
import type { Meeting } from "@/data/meetings";
import { cn } from "@/lib/utils";

interface MeetingDetailProps {
  meeting: Meeting;
}

type NoteTab = "my-notes" | "ai-notes";

export function MeetingDetail({ meeting }: MeetingDetailProps) {
  const [activeTab, setActiveTab] = useState<NoteTab>("ai-notes");
  const [isRecording, setIsRecording] = useState(true);
  const [personalNotes, setPersonalNotes] = useState("");
  const [askInput, setAskInput] = useState("");
  const [askResults, setAskResults] = useState<{ q: string; a: string }[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAsk = () => {
    if (!askInput.trim()) return;
    setAskResults((prev) => [
      ...prev,
      {
        q: askInput,
        a: `Based on the meeting "${meeting.title}", here's what I found: ${meeting.keyPoints[0] || meeting.summary}`,
      },
    ]);
    setAskInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Top Bar */}
      <div className="mb-6 flex items-center justify-between">
        {/* Recording controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
              isRecording
                ? "bg-destructive/10 text-destructive"
                : "bg-secondary text-muted-foreground"
            )}
          >
            {isRecording ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                </span>
                <Mic className="h-3.5 w-3.5" />
                Recording
                <Pause className="h-3.5 w-3.5 ml-1" />
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5" />
                Paused
                <Play className="h-3.5 w-3.5 ml-1" />
              </>
            )}
          </button>
        </div>

        {/* Tab toggle + actions */}
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-secondary/50 p-0.5">
            <button
              onClick={() => setActiveTab("my-notes")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                activeTab === "my-notes"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              My Notes
            </button>
            <button
              onClick={() => setActiveTab("ai-notes")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                activeTab === "ai-notes"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              AI Notes
            </button>
          </div>
          <button className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Share2 className="h-4 w-4" />
          </button>
          <button className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {meeting.date}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {meeting.time} · {meeting.duration}
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold text-foreground leading-tight">
          {meeting.title}
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {meeting.participants.join(", ")}
          </span>
        </div>
      </div>

      {/* Content based on active tab */}
      {activeTab === "ai-notes" ? (
        <>
          {/* AI Summary */}
          <div className="mb-8 rounded-xl border border-accent/20 bg-sage-light p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-foreground">AI Summary</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/80">{meeting.summary}</p>
          </div>

          {/* Key Points */}
          <div className="mb-8">
            <h2 className="font-display text-lg font-semibold text-foreground mb-4">Key Points</h2>
            <ul className="space-y-2.5">
              {meeting.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-3 text-sm text-foreground/80 leading-relaxed">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Action Items */}
          <div className="mb-8">
            <h2 className="font-display text-lg font-semibold text-foreground mb-4">Action Items</h2>
            <div className="space-y-3">
              {meeting.actionItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5"
                >
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm ${item.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {item.text}
                    </p>
                    <span className="mt-1 text-xs text-muted-foreground">{item.assignee}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Transcript preview */}
          <div className="mb-8">
            <h2 className="font-display text-lg font-semibold text-foreground mb-4">Transcript</h2>
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              {meeting.participants.slice(0, 3).map((p, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground">
                    {p.charAt(0)}
                  </div>
                  <div>
                    <span className="text-xs font-medium text-foreground">{p}</span>
                    <p className="mt-0.5 text-sm text-muted-foreground leading-relaxed">
                      {i === 0 && "Let's start by reviewing the key metrics from last week and see where we stand."}
                      {i === 1 && "Sure, I've prepared a summary. Overall we're trending positively on all fronts."}
                      {i === 2 && "I'd also like to discuss the timeline adjustments we mentioned earlier."}
                    </p>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground text-center pt-2">
                — Showing first few lines of transcript —
              </p>
            </div>
          </div>
        </>
      ) : (
        /* My Notes tab */
        <div className="mb-8">
          <h2 className="font-display text-lg font-semibold text-foreground mb-4">Personal Notes</h2>
          <textarea
            ref={textareaRef}
            value={personalNotes}
            onChange={(e) => setPersonalNotes(e.target.value)}
            placeholder="Start typing your notes here... Use / for commands"
            className="min-h-[300px] w-full resize-none rounded-xl border border-border bg-card p-5 text-sm text-foreground leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: Type <kbd className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono">/</kbd> to insert action items, highlights, or tags
          </p>
        </div>
      )}

      {/* Ask anything bar — always visible */}
      <div className="sticky bottom-0 mt-4 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Sparkles className="h-3 w-3 text-accent" />
          Ask anything about this meeting
        </div>
        {askResults.map((r, i) => (
          <div key={i} className="mb-3 space-y-1.5 border-b border-border pb-3 last:border-0">
            <p className="text-sm font-medium text-foreground">{r.q}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{r.a}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question or type / for commands..."
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <button
            onClick={handleAsk}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground transition-all hover:opacity-90"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tags */}
      <div className="mt-6 flex flex-wrap gap-2">
        {meeting.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-sage-light px-3 py-1 text-xs font-medium text-accent"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
