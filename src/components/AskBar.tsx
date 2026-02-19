import { useState, useRef, useEffect } from "react";
import { Sparkles, Paperclip, Mic, MicOff, ChevronDown, ChevronUp, ListTodo, PenLine, FileText, LayoutGrid, Hash, Mail, BookOpen, Zap, ArrowUp, X, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { useNavigate } from "react-router-dom";

interface AskBarProps {
  context?: "home" | "meeting";
  meetingTitle?: string;
}

const quickActions = [
  { icon: ListTodo, label: "List recent todos" },
  { icon: PenLine, label: "Write a recap" },
  { icon: FileText, label: "Summarize key points" },
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

export function AskBar({ context = "home", meetingTitle }: AskBarProps) {
  const navigate = useNavigate();
  const { getActiveAIModelLabel, getAvailableAIModels, selectedAIModel, setSelectedAIModel } = useModelSettings();

  const [input, setInput] = useState("");
  const [scope, setScope] = useState<"this" | "all">(context === "meeting" ? "this" : "all");
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string; model?: string }[]>([]);
  const [showRecipes, setShowRecipes] = useState(false);
  const [recipeFilter, setRecipeFilter] = useState("");
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recipeMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const hasInput = input.trim().length > 0;
  const availableModels = getAvailableAIModels();
  const activeLabel = getActiveAIModelLabel();

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
    setMessages((prev) => [
      ...prev,
      { role: "user", text: q },
      { role: "assistant", text: `Here's what I found${meetingTitle ? ` from "${meetingTitle}"` : " across your meetings"}: Simulated response to "${q}".`, model: activeLabel },
    ]);
  };

  const handleQuickAction = (label: string) => {
    setShowChat(true);
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

  // Group available models
  const modelGroups = availableModels.reduce<Record<string, typeof availableModels>>((acc, m) => {
    (acc[m.group] = acc[m.group] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="border-t border-border bg-background">
      {/* Chat overlay */}
      {showChat && messages.length > 0 && (
        <div className="max-h-64 overflow-y-auto px-6 py-3 space-y-3 border-b border-border bg-card/50">
          <div className="mx-auto max-w-2xl space-y-3">
            <div className="flex justify-end">
              <button onClick={() => { setShowChat(false); setMessages([]); }} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "")}>
                {msg.role === "assistant" && (
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded bg-accent/10">
                      <Sparkles className="h-2 w-2 text-accent" />
                    </div>
                  </div>
                )}
                <div className="max-w-[85%]">
                  {msg.role === "assistant" && msg.model && (
                    <span className="inline-block mb-1 rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                      {msg.model}
                    </span>
                  )}
                  <div className={cn(
                    "rounded-lg px-3 py-1.5 text-[13px] leading-relaxed",
                    msg.role === "user" ? "bg-accent text-accent-foreground" : "bg-card border border-border text-foreground"
                  )}>
                    {msg.text}
                  </div>
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
        <div className="mx-auto flex max-w-2xl items-center gap-1.5 relative">
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
            <div ref={modelMenuRef} className="absolute bottom-full right-0 mb-1 w-56 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">AI Model</span>
                <button
                  onClick={() => { setShowModelPicker(false); navigate("/settings"); }}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  title="Model settings"
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

          {/* Context selector */}
          <button
            onClick={() => setScope(scope === "this" ? "all" : "this")}
            className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {context === "meeting" && scope === "this" ? "This note" : "My notes"}
            <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
          </button>

          {/* Input */}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="type / for recipes"
              className={cn(
                "w-full rounded-md border border-border bg-card py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all",
                hasInput ? "px-3 pr-10" : "px-3 pr-28"
              )}
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              {hasInput ? (
                <button
                  onClick={handleSend}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-foreground transition-all hover:opacity-90"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowModelPicker(!showModelPicker)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors max-w-[80px] truncate",
                      showModelPicker ? "bg-accent/10 text-accent" : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                    title={`Model: ${activeLabel}`}
                  >
                    {activeLabel.length > 12 ? activeLabel.slice(0, 12) + "…" : activeLabel}
                  </button>
                  <button
                    className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Attach file"
                  >
                    <Paperclip className="h-3 w-3" />
                  </button>
                  <button
                    onClick={toggleVoice}
                    className={cn(
                      "rounded p-1 transition-colors",
                      isListening ? "text-destructive animate-pulse" : "text-muted-foreground hover:text-foreground"
                    )}
                    title={isListening ? "Stop listening" : "Voice input"}
                  >
                    {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
