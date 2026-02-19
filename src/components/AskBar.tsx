import { useState, useRef, useEffect } from "react";
import { ListTodo, PenLine, FileText, Hash, Mail, BookOpen, Zap, ArrowUp, X, Home, Play, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModelSettings } from "@/contexts/ModelSettingsContext";


interface AskBarProps {
  context?: "home" | "meeting";
  meetingTitle?: string;
  leftSlot?: React.ReactNode;
  onResumeRecording?: () => void;
  onPauseRecording?: () => void;
  onStopRecording?: () => void;
  onToggleTranscript?: () => void;
  transcriptVisible?: boolean;
  recordingState?: "recording" | "paused" | "stopped";
  elapsed?: string;
}

const homeQuickActions = [
  { icon: ListTodo, label: "List recent todos" },
  { icon: PenLine, label: "Coach me Matt" },
  { icon: FileText, label: "Write weekly recap" },
];

const meetingQuickActions = [
  { icon: Mail, label: "Write follow up email" },
  { icon: ListTodo, label: "List my todos" },
  { icon: PenLine, label: "Make notes longer" },
];

const recipes = [
  { icon: ListTodo, label: "List my to-dos", description: "Extract action items from the meeting" },
  { icon: PenLine, label: "Write a recap", description: "Generate a polished summary" },
  { icon: FileText, label: "Summarize key points", description: "Pull out the highlights" },
  { icon: Mail, label: "Draft follow-up email", description: "Write a follow-up based on meeting" },
  { icon: Hash, label: "Extract key decisions", description: "List decisions made during the call" },
  { icon: BookOpen, label: "Meeting minutes", description: "Format as formal meeting minutes" },
  { icon: Zap, label: "Action plan", description: "Create an action plan with owners" },
];

export function AskBar({ context = "home", meetingTitle, leftSlot, onResumeRecording, onPauseRecording, onStopRecording, onToggleTranscript, transcriptVisible, recordingState, elapsed }: AskBarProps) {
  const { getActiveAIModelLabel } = useModelSettings();

  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string; model?: string }[]>([]);
  const [showRecipes, setShowRecipes] = useState(false);
  const [recipeFilter, setRecipeFilter] = useState("");
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState(0);
  
  const [chatTitle, setChatTitle] = useState("New chat");
  const inputRef = useRef<HTMLInputElement>(null);
  const recipeMenuRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const hasInput = input.trim().length > 0;
  const activeLabel = getActiveAIModelLabel();
  const quickActions = context === "meeting" ? meetingQuickActions : homeQuickActions;

  const filteredRecipes = recipes.filter((r) =>
    r.label.toLowerCase().includes(recipeFilter.toLowerCase())
  );

  useEffect(() => {
    setSelectedRecipeIndex(0);
  }, [recipeFilter]);

  // Click outside to collapse expanded bar / close chat
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setShowRecipes(false);
        if (expanded || showChat) {
          setExpanded(false);
          setShowChat(false);
          setMessages([]);
          setChatTitle("New chat");
        }
      }
    };
    if (expanded || showChat || showRecipes) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [expanded, showChat, showRecipes]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val === "/") {
      setShowRecipes(true);
      setRecipeFilter("");
    } else if (val.startsWith("/")) {
      setShowRecipes(true);
      setRecipeFilter(val.slice(1));
    } else {
      setShowRecipes(false);
      setRecipeFilter("");
    }
  };

  const handleSelectRecipe = (label: string) => {
    setShowRecipes(false);
    setInput("");
    setRecipeFilter("");
    setShowChat(true);
    setExpanded(true);
    setChatTitle(label);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: `/${label}` },
      { role: "assistant", text: `Here are the results for "${label}"${meetingTitle ? ` from "${meetingTitle}"` : " across your meetings"}. This is a simulated response.`, model: activeLabel },
    ]);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    if (showRecipes && filteredRecipes.length > 0) {
      handleSelectRecipe(filteredRecipes[selectedRecipeIndex].label);
      return;
    }
    const q = input;
    setInput("");
    setShowRecipes(false);
    setShowChat(true);
    setExpanded(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: q },
      { role: "assistant", text: `Here's what I found${meetingTitle ? ` from "${meetingTitle}"` : " across your meetings"}: Simulated response to "${q}".`, model: activeLabel },
    ]);
  };

  const handleQuickAction = (label: string) => {
    setShowChat(true);
    setExpanded(true);
    setChatTitle(label);
    setMessages((prev) => [
      ...prev,
      { role: "user", text: label },
      { role: "assistant", text: `Results for "${label}". Simulated response.`, model: activeLabel },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showRecipes) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedRecipeIndex((prev) => Math.min(prev + 1, filteredRecipes.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedRecipeIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredRecipes.length > 0) handleSelectRecipe(filteredRecipes[selectedRecipeIndex].label);
      } else if (e.key === "Escape") {
        setShowRecipes(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setShowChat(false);
    setChatTitle("New chat");
  };

  const handleExpand = () => {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Collapsed state - simple single-line bar
  if (!expanded && !showChat) {
    return (
      <div className="px-4 pb-4 pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto flex items-center gap-2">
          {/* Recording indicator */}
          {leftSlot}
          {/* Recording controls for meeting context */}
          {context === "meeting" && recordingState && recordingState !== "stopped" && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Transcript toggle */}
              <button
                onClick={onToggleTranscript}
                className="flex items-center justify-center rounded-full border border-border bg-card shadow-lg w-10 h-10 text-muted-foreground hover:text-foreground transition-colors"
                title={transcriptVisible ? "Hide transcript" : "Show transcript"}
              >
                {transcriptVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              {/* Pause/Resume button */}
              <button
                onClick={recordingState === "recording" ? onStopRecording : onResumeRecording}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border shadow-lg px-3 py-2.5 transition-colors",
                  recordingState === "recording"
                    ? "border-border bg-card text-muted-foreground hover:text-foreground"
                    : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                )}
                title={recordingState === "recording" ? "Pause recording" : "Resume recording"}
              >
                {elapsed && <span className="text-xs font-medium">{elapsed}</span>}
                {recordingState === "recording" ? (
                  <svg className="h-4 w-4 text-accent" viewBox="0 0 18 16" fill="currentColor">
                    <rect x="1" y="6" width="2.5" height="7" rx="1">
                      <animate attributeName="height" values="7;4;7" dur="0.8s" repeatCount="indefinite" />
                      <animate attributeName="y" values="6;8;6" dur="0.8s" repeatCount="indefinite" />
                    </rect>
                    <rect x="5.5" y="3" width="2.5" height="10" rx="1">
                      <animate attributeName="height" values="10;5;10" dur="0.6s" repeatCount="indefinite" />
                      <animate attributeName="y" values="3;6;3" dur="0.6s" repeatCount="indefinite" />
                    </rect>
                    <rect x="10" y="5" width="2.5" height="8" rx="1">
                      <animate attributeName="height" values="8;3;8" dur="0.7s" repeatCount="indefinite" />
                      <animate attributeName="y" values="5;8;5" dur="0.7s" repeatCount="indefinite" />
                    </rect>
                    <rect x="14.5" y="4" width="2.5" height="9" rx="1">
                      <animate attributeName="height" values="9;5;9" dur="0.9s" repeatCount="indefinite" />
                      <animate attributeName="y" values="4;7;4" dur="0.9s" repeatCount="indefinite" />
                    </rect>
                  </svg>
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}
          {context === "meeting" && recordingState === "stopped" && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={onToggleTranscript}
                className="flex items-center justify-center rounded-full border border-border bg-card shadow-lg w-10 h-10 text-muted-foreground hover:text-foreground transition-colors"
                title={transcriptVisible ? "Hide transcript" : "Show transcript"}
              >
                {transcriptVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={onResumeRecording}
                className="flex items-center justify-center rounded-full border border-accent/30 bg-accent/10 shadow-lg w-10 h-10 text-accent hover:bg-accent/20 transition-colors"
                title="Resume recording"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div
            onClick={handleExpand}
            className="flex flex-1 items-center justify-between rounded-full border border-border bg-card shadow-lg px-4 py-2.5 cursor-text"
          >
            <span className="text-sm text-muted-foreground">Ask anything</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={barRef} className="z-40 pointer-events-none">
      <div className="mx-auto max-w-2xl px-4 pb-4 pointer-events-auto">
        {/* Floating chat panel */}
        {showChat && messages.length > 0 && (
          <div className="mb-2 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">

            {/* Chat messages */}
            <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-3">
              {/* Context badge */}
              <div className="flex justify-end">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
                  <Home className="h-3.5 w-3.5 text-foreground" />
                  <div className="text-left">
                    <div className="font-medium text-foreground">{context === "meeting" ? "This note" : "My notes"}</div>
                    <div className="text-muted-foreground">{context === "meeting" ? meetingTitle : "All meetings"}</div>
                  </div>
                </div>
              </div>

              {/* Last action chip */}
              {messages.length > 0 && (
                <div className="flex justify-end">
                  <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent">
                      <span className="text-[10px] text-accent-foreground font-bold">/</span>
                    </span>
                    {messages.find(m => m.role === "user")?.text.replace(/^\//, "")}
                    <span className="text-muted-foreground">›</span>
                  </div>
                </div>
              )}

              {/* AI responses */}
              {messages.filter(m => m.role === "assistant").map((msg, i) => (
                <div key={i} className="text-sm text-foreground leading-relaxed">
                  {msg.model && (
                    <span className="inline-block mb-1 rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                      {msg.model}
                    </span>
                  )}
                  <div>{msg.text}</div>
                </div>
              ))}

              {/* Scroll indicator */}
              <div className="flex justify-center pt-1">
                <ArrowUp className="h-4 w-4 text-muted-foreground rotate-180" />
              </div>
            </div>
          </div>
        )}

        {/* Expanded bar */}
        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">

          {/* Input row */}
          <div className="px-4 py-2.5 relative">
            {/* Recipes dropdown */}
            {showRecipes && (
              <div ref={recipeMenuRef} className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-border">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Recipes</span>
                </div>
                <div className="max-h-52 overflow-y-auto py-1">
                  {filteredRecipes.length > 0 ? filteredRecipes.map((recipe, i) => (
                    <button
                      key={recipe.label}
                      onClick={() => handleSelectRecipe(recipe.label)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                        i === selectedRecipeIndex ? "bg-accent/10 text-foreground" : "text-foreground hover:bg-secondary"
                      )}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent flex-shrink-0">
                        <recipe.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{recipe.label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{recipe.description}</div>
                      </div>
                    </button>
                  )) : (
                    <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">No recipes found</div>
                  )}
                </div>
                <div className="px-3 py-2 border-t border-border">
                  <button className="flex items-center gap-1.5 text-[11px] text-accent hover:underline">
                    <Zap className="h-3 w-3" />
                    Create custom recipe
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">


              {/* Input */}
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    if (!input && !showChat && !showRecipes) {
                      setTimeout(() => setExpanded(false), 200);
                    }
                  }}
                  placeholder="Ask anything..."
                  className="w-full rounded-lg bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>

              {/* Right side controls */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {hasInput && (
                  <button
                    onClick={handleSend}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all hover:opacity-90"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
