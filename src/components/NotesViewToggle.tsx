import { cn } from "@/lib/utils";

type ViewMode = "my-notes" | "ai-notes";

interface NotesViewToggleProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function NotesViewToggle({ viewMode, onViewModeChange }: NotesViewToggleProps) {
  return (
    <div className="flex items-center rounded-full border border-border bg-card overflow-hidden">
      {/* My Notes icon (hamburger lines) */}
      <button
        onClick={() => onViewModeChange("my-notes")}
        className={cn(
          "flex items-center justify-center p-2 transition-colors",
          viewMode === "my-notes"
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
        title="My notes only"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="3" width="12" height="1.5" rx="0.75" />
          <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" />
          <rect x="2" y="11.5" width="12" height="1.5" rx="0.75" />
        </svg>
      </button>

      {/* AI + My Notes icon (sparkle) */}
      <button
        onClick={() => onViewModeChange("ai-notes")}
        className={cn(
          "flex items-center justify-center p-2 transition-colors",
          viewMode === "ai-notes"
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        )}
        title="AI notes + my notes"
      >
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1l1.3 3.7L13 6l-3.7 1.3L8 11l-1.3-3.7L3 6l3.7-1.3L8 1z" />
          <path d="M12 9l.7 2L15 12l-2.3.7-.7 2-.7-2L9 12l2.3-.7.7-2z" />
        </svg>
      </button>
    </div>
  );
}
