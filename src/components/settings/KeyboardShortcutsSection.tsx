import { useEffect, useState, useMemo } from "react";
import {
  SHORTCUT_DEFS,
  byGroup,
  loadOverrides,
  setOverride,
  resetOverride,
  resetAllOverrides,
  findConflicts,
} from "@/lib/keyboard/registry";
import { formatBinding, parseBinding } from "@/lib/keyboard/binding";
import { ShortcutCapture } from "@/lib/keyboard/ShortcutCapture";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Settings → Keyboard shortcuts.
 *
 * Lists every shortcut grouped by category. Each row shows the current
 * binding as a kbd display with an inline "rebind" button. Click it to
 * enter capture mode (ShortcutCapture); press a key combo to set.
 *
 * Conflicts are highlighted in-row with a warning icon — the user can
 * still save the conflict (some users genuinely want aliased bindings),
 * but the flag makes it visible.
 *
 * Chord shortcuts (like "g then n") can't be rebound via capture — the
 * UI shows a note and lets the user reset to default.
 */
export function KeyboardShortcutsSection() {
  const [, forceTick] = useState(0);
  const bump = () => forceTick((n) => n + 1);

  useEffect(() => {
    window.addEventListener("oschief.keyboard-overrides-changed", bump);
    return () => window.removeEventListener("oschief.keyboard-overrides-changed", bump);
  }, []);

  const overrides = loadOverrides();
  const conflicts = useMemo(() => findConflicts(overrides), [overrides]);
  const conflictIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of conflicts) {
      s.add(c.a);
      s.add(c.b);
    }
    return s;
  }, [conflicts]);
  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Keyboard shortcuts</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Click any binding to rebind. Press <kbd className="font-mono">?</kbd> anywhere to see the full cheatsheet.
          {overrideCount > 0 && (
            <>
              {" · "}
              <button
                onClick={() => {
                  resetAllOverrides();
                  bump();
                }}
                className="text-primary hover:underline"
              >
                Reset all ({overrideCount})
              </button>
            </>
          )}
        </p>
      </div>

      {conflicts.length > 0 && (
        <div className="rounded-md border border-amber bg-amber-bg/40 px-3 py-2 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">
              {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"} detected
            </div>
            <div className="text-muted-foreground mt-0.5">
              Two shortcuts share the same binding. Only one will fire — rebind one to resolve.
            </div>
          </div>
        </div>
      )}

      {byGroup().map(({ group, items }) => (
        <section key={group}>
          <h3 className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
            {group}
          </h3>
          <div className="rounded-md border border-border bg-card divide-y divide-border">
            {items.map((def) => {
              const current = overrides[def.id] ?? def.defaultBinding;
              const isOverride = current !== def.defaultBinding;
              const conflict = conflictIds.has(def.id);
              const isChord = parseBinding(current)?.then !== undefined;
              return (
                <div
                  key={def.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2",
                    conflict && "bg-amber-bg/20",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate">{def.label}</span>
                      {conflict && (
                        <AlertTriangle
                          className="h-3 w-3 text-amber shrink-0"
                          aria-label="Conflict"
                        />
                      )}
                    </div>
                    {def.description && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {def.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isChord ? (
                      <span
                        className="min-w-[90px] rounded-md border border-border bg-muted/50 px-2.5 py-1 text-[11px] font-mono tabular-nums text-muted-foreground cursor-not-allowed"
                        title="Chord shortcuts can't be rebound via capture. Reset to default or file an issue if you need a different chord."
                      >
                        {formatBinding(current)}
                      </span>
                    ) : (
                      <ShortcutCapture
                        value={current}
                        onChange={(b) => {
                          setOverride(def.id, b);
                          bump();
                        }}
                      />
                    )}
                    {isOverride && (
                      <button
                        onClick={() => {
                          resetOverride(def.id);
                          bump();
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        title={`Reset to ${formatBinding(def.defaultBinding)}`}
                        aria-label="Reset to default"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="text-[11px] text-muted-foreground pt-4 border-t border-border">
        <p>
          <strong>Chord shortcuts</strong> like <kbd className="font-mono">G then N</kbd> are pressed in sequence — tap G, then tap N within 1 second. They only work when no input is focused.
        </p>
        <p className="mt-1">
          <strong>IME / non-US keyboards:</strong> shortcuts are ignored while the OS input-method composer is active. If a binding doesn't fire, check that your IME isn't intercepting it.
        </p>
      </div>
    </div>
  );
}
