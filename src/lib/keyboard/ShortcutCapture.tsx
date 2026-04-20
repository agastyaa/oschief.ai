import { useEffect, useRef, useState } from "react";
import { formatBinding } from "./binding";

/**
 * Captures a keypress and emits a binding string for the Settings rebinder.
 *
 * Enters capture mode on focus/click. Listens for a single keydown that
 * includes at least one non-modifier key. Emits a normalized binding
 * string (e.g., "mod+shift+k", "g then n" isn't supported here — chord
 * rebinds require typing, not capture; we disable the widget for chord
 * shortcuts in the settings UI).
 *
 * Escape cancels capture. Backspace/Delete with no other keys is not
 * emitted (prevents accidentally clearing a binding).
 */
export interface ShortcutCaptureProps {
  value: string;
  onChange: (binding: string) => void;
  disabled?: boolean;
  /** Blocked list — if captured binding matches any of these, show conflict warning. */
  blocked?: string[];
}

function eventToBinding(e: KeyboardEvent, mac: boolean): string | null {
  const k = e.key.toLowerCase();
  // Bare modifier presses don't produce a binding
  if (["meta", "control", "alt", "shift", "os", "super", "hyper"].includes(k)) return null;
  const parts: string[] = [];
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (mod) parts.push("mod");
  if (mac && e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  // Normalize special keys
  let keyPart = k;
  if (k === " ") keyPart = "space";
  if (k === "escape") keyPart = "escape";
  if (k === "enter") keyPart = "enter";
  parts.push(keyPart);
  return parts.join("+");
}

export function ShortcutCapture({ value, onChange, disabled, blocked }: ShortcutCaptureProps) {
  const [capturing, setCapturing] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(false);
        setPending(null);
        return;
      }
      const b = eventToBinding(e, isMac);
      if (!b) return;
      setPending(b);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Confirm on release when a pending binding exists — matches user expectation
      // that "release finalizes what I typed."
      if (pending && !["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
        onChange(pending);
        setCapturing(false);
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [capturing, pending, onChange, isMac]);

  const display = capturing ? (pending ? formatBinding(pending) : "Press keys…") : formatBinding(value);
  const conflicts = blocked && pending ? blocked.includes(pending) : false;

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={() => !disabled && setCapturing((v) => !v)}
      onBlur={() => {
        setCapturing(false);
        setPending(null);
      }}
      className={
        "min-w-[90px] rounded-md border px-2.5 py-1 text-[11px] font-mono tabular-nums transition-colors " +
        (disabled
          ? "border-border bg-muted/50 text-muted-foreground cursor-not-allowed"
          : capturing
            ? conflicts
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-primary bg-primary/10 text-primary"
            : "border-border bg-background text-foreground hover:bg-secondary")
      }
      aria-label={capturing ? "Press new shortcut" : `Current shortcut ${display}`}
    >
      {display}
    </button>
  );
}
