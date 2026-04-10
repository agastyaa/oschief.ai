/**
 * KB Suggestions Panel
 *
 * Floating card during live recording that shows 1-3 talking-point
 * suggestions sourced from the user's knowledge base folder.
 */

import { useState } from "react"
import { BookOpen, X, Lightbulb, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

export interface KBSuggestion {
  text: string
  source: string
}

interface KBSuggestionsPanelProps {
  suggestions: KBSuggestion[]
  visible: boolean
  loading?: boolean
  onDismiss: (index: number) => void
  onToggle: () => void
}

export function KBSuggestionsPanel({
  suggestions,
  visible,
  loading,
  onDismiss,
  onToggle,
}: KBSuggestionsPanelProps) {
  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-36 right-4 z-40 rounded-full bg-card/80 backdrop-blur-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors shadow-sm"
        title="Show KB suggestions"
      >
        <BookOpen className="h-3.5 w-3.5" />
      </button>
    )
  }

  const hasSuggestions = suggestions.length > 0

  return (
    <div className="fixed bottom-36 right-4 z-40 w-80 flex flex-col gap-2 animate-in slide-in-from-right-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-lg bg-card/95 backdrop-blur-sm border border-border border-b-0 px-3 py-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-amber" />
          <span className="text-[11px] font-medium text-foreground">Suggestions from your notes</span>
        </div>
        <button
          onClick={onToggle}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Hide suggestions"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Body */}
      <div className="rounded-b-lg bg-card/95 backdrop-blur-sm border border-border border-t-0 px-3 pb-3 space-y-2">
        {loading && !hasSuggestions && (
          <p className="text-[11px] text-muted-foreground animate-pulse py-2">Searching your notes...</p>
        )}

        {!loading && !hasSuggestions && (
          <p className="text-[11px] text-muted-foreground py-2">No relevant suggestions yet — keep talking!</p>
        )}

        {suggestions.map((s, i) => (
          <div
            key={`${i}-${s.text.slice(0, 20)}`}
            className="group relative rounded-md border border-border bg-secondary/30 p-2.5 hover:bg-secondary/50 transition-colors"
          >
            <button
              onClick={() => onDismiss(i)}
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:text-foreground transition-[color,opacity]"
            >
              <X className="h-2.5 w-2.5" />
            </button>
            <p className="text-[12px] text-foreground leading-relaxed pr-4">{s.text}</p>
            {s.source && (
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1.5">
                <FileText className="h-2.5 w-2.5" />
                {s.source}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
