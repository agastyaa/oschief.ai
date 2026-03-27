import { cn } from "@/lib/utils";

/** Shared shell for Ask OSChief inputs (full page + bottom bar composer). */
export const askSyagInputShell = cn(
  "rounded-2xl border border-border/70 bg-card/95 backdrop-blur-xl shadow-[var(--card-shadow)]",
  "transition-[box-shadow,border-color,ring] duration-200",
  "focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20"
);

/** Floating chat panel + modals in the AskBar. */
export const askSyagPanelShell = cn(
  "rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-lg overflow-hidden",
  "ring-1 ring-black/[0.04] dark:ring-white/[0.08]"
);

/** Header strip inside Ask OSChief panels. */
export const askSyagPanelHeader = cn(
  "border-b border-border/70 bg-gradient-to-r from-accent/[0.08] via-card/50 to-primary/[0.06]"
);
