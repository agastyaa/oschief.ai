import { useState, useRef } from "react";
import {
  Calendar, Clock, Users, CheckCircle2, Circle, Sparkles,
  Share2, MoreHorizontal, Pause, Play, Mic
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="animate-fade-in">
      {/* Top Bar */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
              isRecording
                ? "bg-destructive/10 text-destructive"
                : "bg-secondary text-muted-foreground"
            )}
          >
            {isRecording ? (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                </span>
                <Mic className="h-3 w-3" />
                Recording
                <Pause className="h-3 w-3 ml-0.5" />
              </>
            ) : (
              <>
                <Mic className="h-3 w-3" />
                Paused
                <Play className="h-3 w-3 ml-0.5" />
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border bg-secondary/50 p-0.5">
            <button
              onClick={() => setActiveTab("my-notes")}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium transition-all",
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
                "rounded px-2.5 py-1 text-[11px] font-medium transition-all",
                activeTab === "ai-notes"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              AI Notes
            </button>
          </div>
          <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Share2 className="h-3.5 w-3.5" />
          </button>
          <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl text-foreground leading-tight">{meeting.title}</h1>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {meeting.date}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {meeting.time} · {meeting.duration}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Users className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{meeting.participants.join(", ")}</span>
        </div>
      </div>

      {/* Content */}
      {activeTab === "ai-notes" ? (
        <>
          {/* Summary */}
          <div className="mb-6 rounded-lg border border-accent/20 bg-sage-light p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-semibold text-foreground">AI Summary</span>
            </div>
            <p className="text-[13px] leading-relaxed text-foreground/80">{meeting.summary}</p>
          </div>

          {/* Key Points */}
          <div className="mb-6">
            <h2 className="font-display text-base text-foreground mb-3">Key Points</h2>
            <ul className="space-y-2">
              {meeting.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] text-foreground/80 leading-relaxed">
                  <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Action Items */}
          <div className="mb-6">
            <h2 className="font-display text-base text-foreground mb-3">Action Items</h2>
            <div className="space-y-2">
              {meeting.actionItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3">
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent" />
                  ) : (
                    <Circle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex-1">
                    <p className={cn("text-[13px]", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
                      {item.text}
                    </p>
                    <span className="mt-0.5 text-[11px] text-muted-foreground">{item.assignee}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Transcript */}
          <div className="mb-6">
            <h2 className="font-display text-base text-foreground mb-3">Transcript</h2>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              {meeting.participants.slice(0, 3).map((p, i) => (
                <div key={i} className="flex gap-2.5">
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] font-medium text-foreground">
                    {p.charAt(0)}
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-foreground">{p}</span>
                    <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed">
                      {i === 0 && "Let's start by reviewing the key metrics from last week and see where we stand."}
                      {i === 1 && "Sure, I've prepared a summary. Overall we're trending positively on all fronts."}
                      {i === 2 && "I'd also like to discuss the timeline adjustments we mentioned earlier."}
                    </p>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground text-center pt-1">— Showing first few lines —</p>
            </div>
          </div>
        </>
      ) : (
        <div className="mb-6">
          <h2 className="font-display text-base text-foreground mb-3">Personal Notes</h2>
          <textarea
            ref={textareaRef}
            value={personalNotes}
            onChange={(e) => setPersonalNotes(e.target.value)}
            placeholder="Start typing your notes here... Use / for commands"
            className="min-h-[280px] w-full resize-none rounded-lg border border-border bg-card p-4 text-[13px] text-foreground leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Tip: Type <kbd className="rounded bg-secondary px-1 py-0.5 text-[10px] font-mono">/</kbd> to insert action items, highlights, or tags
          </p>
        </div>
      )}

      {/* Tags */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {meeting.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-sage-light px-2.5 py-0.5 text-[11px] font-medium text-accent">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
