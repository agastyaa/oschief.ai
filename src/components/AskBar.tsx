import { useState, useRef, useEffect } from "react";
import { Sparkles, Paperclip, Mic, MicOff, ChevronDown, ChevronUp, ListTodo, PenLine, FileText, LayoutGrid, Hash, Mail, BookOpen, Zap, ArrowUp, X, Settings, SlidersHorizontal, PenSquare, Home, Play, Pause, Square, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();
  const { getActiveAIModelLabel, getAvailableAIModels, selectedAIModel, setSelectedAIModel } = useModelSettings();

  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState<"this" | "all">(context === "meeting" ? "this" : "all");
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string; model?: string }[]>([]);
  const [showRecipes, setShowRecipes] = useState(false);
  const [recipeFilter, setRecipeFilter] = useState("");
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showEqualizerExpanded, setShowEqualizerExpanded] = useState(false);
  const [chatTitle, setChatTitle] = useState("New chat");
  const inputRef = useRef<HTMLInputElement>(null);
  const recipeMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const hasInput = input.trim().length > 0;
  const availableModels = getAvailableAIModels();
  const activeLabel = getActiveAIModelLabel();
  const quickActions = context === "meeting" ? meetingQuickActions : homeQuickActions;

  const filteredRecipes = recipes.filter((r) =>
    r.label.toLowerCase().includes(recipeFilter.toLowerCase())
  );

  useEffect(() => {
    setSelectedRecipeIndex(0);
  }, [recipeFilter]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (recipeMenuRef.current && !recipeMenuRef.current.contains(e.target as Node)) {
        setShowRecipes(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    if (showRecipes || showModelPicker) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showRecipes, showModelPicker]);

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

  const toggleVoice = () => {
    setIsListening(!isListening);
    if (!isListening) {
      setTimeout(() => {
        setInput("What were the action items from today?");
        setIsListening(false);
      }, 2000);
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

  const modelGroups = availableModels.reduce<Record<string, typeof availableModels>>((acc, m) => {
    (acc[m.group] = acc[m.group] || []).push(m);
    return acc;
  }, {});

  // Collapsed state - simple single-line bar
  if (!expanded && !showChat) {
    return (
      <div className="px-4 pb-4 pointer-events-none">
      <div className="mx-auto max-w-2xl pointer-events-auto flex items-center gap-2">
          {/* Recording indicator */}
          {leftSlot}
          {/* Equalizer button for meeting context */}
          {context === "meeting" && (
            showEqualizerExpanded ? (
              <div className="flex items-center gap-0 rounded-full border border-border bg-card shadow-lg overflow-hidden flex-shrink-0">
                {recordingState && recordingState !== "stopped" ? (
                  <>
                    <button
                      onClick={onToggleTranscript}
                      className="flex items-center gap-1 px-3 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      {transcriptVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      {transcriptVisible ? "Hide" : "Show"}
                    </button>
                    {recordingState === "recording" ? (
                      <button
                        onClick={onPauseRecording}
                        className="flex items-center gap-1 px-3 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <Pause className="h-3 w-3" />
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={onResumeRecording}
                        className="flex items-center gap-1 px-3 py-2.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10"
                      >
                        <Play className="h-3 w-3" />
                        Resume
                      </button>
                    )}
                    <button
                      onClick={onStopRecording}
                      className="flex items-center gap-1 px-3 py-2.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Square className="h-3 w-3" />
                      Stop
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onResumeRecording}
                    className="flex items-center gap-1 px-3 py-2.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10"
                  >
                    <Play className="h-3 w-3" />
                    Resume
                  </button>
                )}
                <button
                  onClick={() => setShowEqualizerExpanded(false)}
                  className="flex items-center gap-1 px-3 py-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowEqualizerExpanded(true)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card shadow-lg px-3 py-2.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                title="Recording options"
              >
                {elapsed && <span className="text-xs font-medium">{elapsed}</span>}
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="6" width="2.5" height="7" rx="1" />
                  <rect x="5" y="3" width="2.5" height="10" rx="1" />
                  <rect x="9" y="5" width="2.5" height="8" rx="1" />
                  <rect x="13" y="4" width="2.5" height="9" rx="1" />
                </svg>
                <ChevronUp className="h-3 w-3" />
              </button>
            )
          )}
          <div
            onClick={handleExpand}
            className="flex flex-1 items-center justify-between rounded-full border border-border bg-card shadow-lg px-4 py-2.5 cursor-text"
          >
            <span className="text-sm text-muted-foreground">Ask anything</span>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleQuickAction(quickActions[0].label); }}
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-secondary transition-colors"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(80,60%,55%)]">
                  <span className="text-[10px] text-white font-bold">/</span>
                </span>
                {quickActions[0].label}
              </button>
            </div>
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
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <button className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors">
                {chatTitle}
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleNewChat}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary transition-colors"
                >
                  <PenSquare className="h-3 w-3" />
                  New chat
                </button>
                <button
                  onClick={() => { setShowChat(false); setMessages([]); setExpanded(false); setChatTitle("New chat"); }}
                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

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
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(80,60%,55%)]">
                      <span className="text-[10px] text-white font-bold">/</span>
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
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>
        )}

        {/* Expanded bar */}
        <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
          {/* Quick action chips row */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/50">
            <div className="flex items-center gap-1.5 overflow-x-auto flex-1">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.label)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(80,60%,55%)]">
                    <span className="text-[10px] text-white font-bold">/</span>
                  </span>
                  {action.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setShowRecipes(true)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-secondary transition-colors"
              >
                <LayoutGrid className="h-3 w-3" />
                All recipes
              </button>
              <button className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors">
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

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

            {/* Model picker dropdown */}
            {showModelPicker && (
              <div ref={modelMenuRef} className="absolute bottom-full right-4 mb-1 w-56 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">AI Model</span>
                  <button
                    onClick={() => { setShowModelPicker(false); navigate("/settings"); }}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {Object.entries(modelGroups).map(([group, models]) => (
                    <div key={group}>
                      <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{group}</div>
                      {models.map((m) => (
                        <button
                          key={m.value}
                          onClick={() => { setSelectedAIModel(m.value); setShowModelPicker(false); }}
                          className={cn(
                            "flex w-full items-center justify-between px-3 py-1.5 text-[12px] transition-colors",
                            selectedAIModel === m.value
                              ? "bg-accent/10 text-foreground font-medium"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          )}
                        >
                          <span>{m.label}</span>
                          {selectedAIModel === m.value && <span className="text-accent">✓</span>}
                        </button>
                      ))}
                    </div>
                  ))}
                  {availableModels.length === 0 && (
                    <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                      No models available.<br />
                      <button onClick={() => { setShowModelPicker(false); navigate("/settings"); }} className="text-accent hover:underline mt-1 inline-block">
                        Configure in Settings →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* Context / scope selector */}
              {context === "meeting" && (
                <button
                  onClick={() => { setExpanded(false); setShowChat(false); }}
                  className="flex flex-shrink-0 items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <ChevronUp className="h-3 w-3" />
                </button>
              )}

              {context === "home" && !showChat && (
                <button
                  onClick={() => setScope(scope === "this" ? "all" : "this")}
                  className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  My notes
                  <span className="text-muted-foreground ml-0.5">All meetings</span>
                  <ChevronDown className="h-2.5 w-2.5 text-muted-foreground ml-0.5" />
                </button>
              )}

              {/* Input */}
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onBlur={() => {
                    if (!input && !showChat && !showRecipes && !showModelPicker) {
                      setTimeout(() => setExpanded(false), 200);
                    }
                  }}
                  placeholder={showChat ? "Ask anything" : "Type / for recipes"}
                  className="w-full rounded-lg bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>

              {/* Right side controls */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {hasInput ? (
                  <button
                    onClick={handleSend}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all hover:opacity-90"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setShowModelPicker(!showModelPicker)}
                      className={cn(
                        "rounded px-2 py-0.5 text-xs font-medium transition-colors",
                        showModelPicker ? "bg-accent/10 text-accent" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {activeLabel.length > 8 ? activeLabel.slice(0, 8) + "…" : activeLabel}
                    </button>
                    <button className="rounded p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Attach file">
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <button
                      onClick={toggleVoice}
                      className={cn(
                        "rounded-full p-1.5 transition-colors",
                        isListening ? "text-destructive animate-pulse bg-destructive/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      )}
                      title={isListening ? "Stop listening" : "Voice input"}
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
