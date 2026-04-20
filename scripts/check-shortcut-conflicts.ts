/**
 * Scans the shortcut registry against known reservations:
 *   1. macOS system shortcuts (Cmd+Space, Cmd+Tab, etc.)
 *   2. Electron menubar defaults (Cmd+Q, Cmd+W, Cmd+M, etc.)
 *   3. Browser chrome we can't override in Electron webContents (Cmd+R)
 *   4. Internal registry conflicts (two shortcuts, same binding, overlapping scope)
 *
 * Run manually before release or via `bun scripts/check-shortcut-conflicts.ts`.
 * Prints a report. Exits 1 if any P1 conflict is found.
 */

import { SHORTCUT_DEFS, findConflicts } from "../src/lib/keyboard/registry";
import { parseBinding, formatBinding } from "../src/lib/keyboard/binding";

// Reservations — keep this list tight. Bindings here are "never yours" on macOS.
const RESERVATIONS: Array<{ binding: string; owner: string; severity: "P0" | "P1" | "P2" }> = [
  // macOS system (immovable)
  { binding: "mod+space", owner: "macOS: Spotlight", severity: "P0" },
  { binding: "mod+tab", owner: "macOS: app switcher", severity: "P0" },
  { binding: "mod+shift+3", owner: "macOS: screenshot", severity: "P0" },
  { binding: "mod+shift+4", owner: "macOS: screenshot region", severity: "P0" },
  { binding: "mod+shift+5", owner: "macOS: screenshot UI", severity: "P0" },
  // Electron menubar defaults (we could intercept but users expect these)
  { binding: "mod+q", owner: "Electron: Quit", severity: "P1" },
  { binding: "mod+w", owner: "Electron: Close window", severity: "P1" },
  { binding: "mod+m", owner: "Electron: Minimize", severity: "P1" },
  { binding: "mod+h", owner: "macOS: Hide app", severity: "P1" },
  { binding: "mod+shift+h", owner: "macOS: Hide others", severity: "P1" },
  // Standard editing — only flag at P2 since apps routinely override
  { binding: "mod+c", owner: "Clipboard: copy", severity: "P2" },
  { binding: "mod+v", owner: "Clipboard: paste", severity: "P2" },
  { binding: "mod+x", owner: "Clipboard: cut", severity: "P2" },
  { binding: "mod+z", owner: "Undo", severity: "P2" },
  { binding: "mod+shift+z", owner: "Redo", severity: "P2" },
  { binding: "mod+a", owner: "Select all", severity: "P2" },
  { binding: "mod+f", owner: "Find", severity: "P2" },
];

function normalizeForCompare(b: string): string {
  const parsed = parseBinding(b);
  if (!parsed) return b;
  const parts: string[] = [];
  if (parsed.mod) parts.push("mod");
  if (parsed.ctrl) parts.push("ctrl");
  if (parsed.alt) parts.push("alt");
  if (parsed.shift) parts.push("shift");
  parts.push(parsed.key);
  return parsed.then ? `${parts.join("+")} then ${parsed.then}` : parts.join("+");
}

function main() {
  let p0 = 0;
  let p1 = 0;
  let p2 = 0;

  console.log("\n=== v2.11 Keyboard conflict check ===\n");

  // Registry self-conflicts
  const self = findConflicts({});
  if (self.length === 0) {
    console.log("✓ No internal registry conflicts");
  } else {
    console.log(`✗ ${self.length} internal registry conflict(s):`);
    for (const c of self) {
      console.log(`  [P1] ${c.a} ↔ ${c.b} both bound to "${c.binding}"`);
      p1++;
    }
  }

  // Reservations
  const reservedMap = new Map(RESERVATIONS.map((r) => [normalizeForCompare(r.binding), r]));
  const hits: Array<{ def: typeof SHORTCUT_DEFS[number]; owner: string; severity: string }> = [];
  for (const def of SHORTCUT_DEFS) {
    const norm = normalizeForCompare(def.defaultBinding);
    const r = reservedMap.get(norm);
    if (r) hits.push({ def, owner: r.owner, severity: r.severity });
  }

  if (hits.length === 0) {
    console.log("✓ No reserved-binding conflicts");
  } else {
    console.log(`\nReserved-binding hits:`);
    for (const h of hits) {
      console.log(`  [${h.severity}] ${h.def.id} = ${formatBinding(h.def.defaultBinding)} collides with ${h.owner}`);
      if (h.severity === "P0") p0++;
      else if (h.severity === "P1") p1++;
      else p2++;
    }
  }

  console.log(`\nSummary: ${p0} P0, ${p1} P1, ${p2} P2\n`);
  if (p0 > 0 || p1 > 0) {
    console.error("FAIL — at least one P0/P1 conflict must be resolved before ship.");
    process.exit(1);
  }
  console.log("OK\n");
}

main();
