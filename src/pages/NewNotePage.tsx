import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { AskBar } from "@/components/AskBar";
import {
  Mic, MicOff, Pause, Play, Eye, EyeOff, Square,
  PanelLeftClose, PanelLeft, ChevronDown, MoreHorizontal, Share2
} from "lucide-react";
import { cn } from "@/lib/utils";

type RecordingState = "recording" | "paused" | "stopped";
type ActiveTab = "my-notes" | "transcript";

const fakeTranscriptLines = [
  { speaker: "You", time: "0:00", text: "Alright, let's get started with today's meeting." },
  { speaker: "You", time: "0:04", text: "I wanted to go over a few things from last week first." },
  { speaker: "You", time: "0:12", text: "The main item is the product launch timeline." },
  { speaker: "You", time: "0:18", text: "We need to finalize the feature list by end of this week." },
  { speaker: "You", time: "0:25", text: "Let me check the status of each item..." },
  { speaker: "You", time: "0:32", text: "Marketing materials are nearly done." },
  { speaker: "You", time: "0:38", text: "The landing page still needs copy review." },
  { speaker: "You", time: "0:45", text: "And we should schedule the demo recording for next Tuesday." },
];

export default function NewNotePage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("recording");
  const [activeTab, setActiveTab] = useState<ActiveTab>("my-notes");
  const [transcriptVisible, setTranscriptVisible] = useState(true);
  const [personalNotes, setPersonalNotes] = useState("");
  const [visibleLines, setVisibleLines] = useState(2);
  const [title, setTitle] = useState("New Meeting");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Simulate live transcription
  useEffect(() => {
    if (recordingState !== "recording") return;
    if (visibleLines >= fakeTranscriptLines.length) return;

    const timer = setInterval(() => {
      setVisibleLines((prev) => Math.min(prev + 1, fakeTranscriptLines.length));
    }, 3000);

    return () => clearInterval(timer);
  }, [recordingState, visibleLines]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleLines]);

  // Focus title on edit
  useEffect(() => {
    if (isEditingTitle) titleRef.current?.select();
  }, [isEditingTitle]);

  const handleStop = () => {
    setRecordingState("stopped");
    setTranscriptVisible(false);
  };

  const handlePause = () => setRecordingState("paused");
  const handleResume = () => setRecordingState("recording");

  const elapsedSeconds = visibleLines * 6;
  const elapsed = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Collapsible sidebar */}
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
        sidebarOpen ? "w-56" : "w-0"
      )}>
        <Sidebar />
      </div>

      <main className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigate("/")}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back
            </button>
          </div>

          {/* Recording controls - center */}
          <div className="flex items-center gap-2">
            {recordingState !== "stopped" && (
              <>
                {/* Recording indicator */}
                <div className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                  recordingState === "recording"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-secondary text-muted-foreground"
                )}>
                  {recordingState === "recording" && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                    </span>
                  )}
                  <Mic className="h-3 w-3" />
                  <span>{elapsed}</span>
                </div>

                {/* Hide/Show transcript */}
                <button
                  onClick={() => setTranscriptVisible(!transcriptVisible)}
                  className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  title={transcriptVisible ? "Hide transcription" : "Show transcription"}
                >
                  {transcriptVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {transcriptVisible ? "Hide" : "Show"}
                </button>

                {/* Pause / Resume */}
                {recordingState === "recording" ? (
                  <button
                    onClick={handlePause}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Pause className="h-3 w-3" />
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={handleResume}
                    className="flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
                  >
                    <Play className="h-3 w-3" />
                    Resume
                  </button>
                )}

                {/* Stop */}
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              </>
            )}

            {recordingState === "stopped" && (
              <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <MicOff className="h-3 w-3" />
                Recording ended · {elapsed}
              </div>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5">
            <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main notes panel */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-6">
              {/* Title */}
              {isEditingTitle ? (
                <input
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                  className="mb-4 w-full font-display text-2xl text-foreground bg-transparent border-none outline-none focus:ring-0"
                />
              ) : (
                <h1
                  onClick={() => setIsEditingTitle(true)}
                  className="mb-4 font-display text-2xl text-foreground cursor-text hover:text-foreground/80 transition-colors"
                >
                  {title}
                </h1>
              )}

              {/* Tab switcher */}
              <div className="mb-4 flex items-center gap-1">
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
                    onClick={() => setActiveTab("transcript")}
                    className={cn(
                      "rounded px-2.5 py-1 text-[11px] font-medium transition-all",
                      activeTab === "transcript"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    AI Notes
                  </button>
                </div>
              </div>

              {/* Notes content */}
              {activeTab === "my-notes" ? (
                <textarea
                  ref={textareaRef}
                  value={personalNotes}
                  onChange={(e) => setPersonalNotes(e.target.value)}
                  placeholder="Start typing your notes here...&#10;&#10;Use / for commands"
                  className="min-h-[400px] w-full resize-none rounded-lg border border-border bg-card p-4 text-[13px] text-foreground leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                  autoFocus
                />
              ) : (
                <div className="rounded-lg border border-border bg-card p-4">
                  {recordingState !== "stopped" ? (
                    <p className="text-[13px] text-muted-foreground italic">
                      AI notes will be generated once the recording is stopped...
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-accent/20 bg-sage-light p-4">
                        <p className="text-[13px] leading-relaxed text-foreground/80">
                          Meeting discussed product launch timeline, marketing materials status, and demo recording scheduling. Key action items include finalizing the feature list and scheduling the demo for next Tuesday.
                        </p>
                      </div>
                      <div>
                        <h3 className="font-display text-base text-foreground mb-2">Action Items</h3>
                        <ul className="space-y-1.5">
                          <li className="flex items-center gap-2 text-[13px] text-foreground/80">
                            <span className="h-1 w-1 rounded-full bg-accent flex-shrink-0" />
                            Finalize feature list by end of week
                          </li>
                          <li className="flex items-center gap-2 text-[13px] text-foreground/80">
                            <span className="h-1 w-1 rounded-full bg-accent flex-shrink-0" />
                            Schedule demo recording for next Tuesday
                          </li>
                          <li className="flex items-center gap-2 text-[13px] text-foreground/80">
                            <span className="h-1 w-1 rounded-full bg-accent flex-shrink-0" />
                            Complete landing page copy review
                          </li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Live transcript side panel */}
          {transcriptVisible && recordingState !== "stopped" && (
            <div className="w-72 flex-shrink-0 border-l border-border bg-card/50 overflow-y-auto">
              <div className="px-4 py-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Live Transcript
                  </span>
                  <button
                    onClick={() => setTranscriptVisible(false)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {fakeTranscriptLines.slice(0, visibleLines).map((line, i) => (
                  <div key={i} className="animate-fade-in">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-medium text-foreground">
                        {line.speaker.charAt(0)}
                      </div>
                      <span className="text-[10px] font-medium text-foreground">{line.speaker}</span>
                      <span className="text-[10px] text-muted-foreground">{line.time}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground leading-relaxed pl-5.5">
                      {line.text}
                    </p>
                  </div>
                ))}
                {recordingState === "recording" && (
                  <div className="flex items-center gap-1.5 pt-1 animate-pulse">
                    <div className="h-1 w-1 rounded-full bg-destructive" />
                    <span className="text-[10px] text-muted-foreground">Listening...</span>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Ask bar */}
        <AskBar context="meeting" meetingTitle={title} />
      </main>
    </div>
  );
}
