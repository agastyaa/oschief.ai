import { useEffect, useState, useMemo } from "react";
import { SHORTCUT_DEFS, byGroup, getBinding, loadOverrides } from "./registry";
import { formatBinding } from "./binding";
import { useHelpOverlay } from "./ShortcutContext";

/**
 * Help overlay — opens on `?`. Shows every shortcut grouped by category,
 * searchable by label or binding. Closes on Escape or click-outside.
 *
 * The list is ordered by group (General, Navigation, Recording, Lists,
 * Editing). Within each group we keep the SHORTCUT_DEFS declaration order
 * so authors control presentation.
 */
export function KeyboardHelp() {
  const [open, setOpen] = useHelpOverlay();
  const [query, setQuery] = useState("");
  const [overridesTick, setOverridesTick] = useState(0);

  useEffect(() => {
    const bump = () => setOverridesTick((n) => n + 1);
    window.addEventListener("oschief.keyboard-overrides-changed", bump);
    return () => window.removeEventListener("oschief.keyboard-overrides-changed", bump);
  }, []);

  const groups = useMemo(() => {
    const overrides = loadOverrides();
    const q = query.trim().toLowerCase();
    return byGroup()
      .map(({ group, items }) => ({
        group,
        items: items
          .map((def) => ({
            def,
            binding: overrides[def.id] ?? def.defaultBinding,
          }))
          .filter(({ def, binding }) => {
            if (!q) return true;
            return (
              def.label.toLowerCase().includes(q) ||
              def.description?.toLowerCase().includes(q) ||
              binding.toLowerCase().includes(q)
            );
          }),
      }))
      .filter((g) => g.items.length > 0);
    // overridesTick is intentionally tracked to force recomputation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, overridesTick]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] m-4 rounded-lg border border-border bg-popover text-popover-foreground shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-medium text-sm">Keyboard shortcuts</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            Esc
          </button>
        </div>
        <div className="border-b border-border px-4 py-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shortcuts..."
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {groups.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              No shortcuts match "{query}"
            </div>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group}>
                <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                  {group}
                </div>
                <div className="space-y-1">
                  {items.map(({ def, binding }) => (
                    <div
                      key={def.id}
                      className="flex items-center justify-between gap-4 py-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={
                            def.destructive ? "text-sm text-destructive" : "text-sm"
                          }
                        >
                          {def.label}
                        </div>
                        {def.description && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {def.description}
                          </div>
                        )}
                      </div>
                      <kbd className="shrink-0 rounded border border-border bg-muted px-2 py-0.5 text-[11px] font-mono tabular-nums text-foreground">
                        {formatBinding(binding)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
          <span>
            Tip: <kbd className="font-mono">?</kbd> opens this anytime
          </span>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              // Navigate to settings shortcuts tab — listeners on the settings
              // page pick up the hash.
              window.location.hash = "#/settings?tab=keyboard";
            }}
            className="text-primary hover:underline"
          >
            Customize in Settings →
          </a>
        </div>
      </div>
    </div>
  );
}
