/**
 * Keyboard shortcut registry — source of truth for every binding in the app.
 *
 * Adding a shortcut:
 *   1. Append a SHORTCUT_DEFS entry with a stable `id`, human label,
 *      scope, and default binding.
 *   2. Wire the action with `useShortcut(id, handler)` in the component
 *      that owns the behavior.
 *   3. Done — ? overlay and Settings > Keyboard pick it up automatically.
 *
 * User overrides are persisted in localStorage under KEY_OVERRIDES and merged
 * over defaults. Removing an override (Reset) restores the default.
 *
 * Scopes narrow where a shortcut fires:
 *   - 'global'       — always active
 *   - 'recording'    — only while a recording session is active
 *   - 'notes-list'   — on All Notes / Index
 *   - 'note-detail'  — inside an open note
 *   - 'coaching'     — coaching tab
 *   - 'settings'     — settings page
 *   - 'search'       — when the command palette is open
 *
 * The ACTIVE scope is a stack managed by ScopeProvider — the top of the
 * stack takes precedence; global shortcuts always fire unless an input is
 * focused (and the shortcut didn't mark `allowInInput`).
 */

export type ShortcutScope =
  | 'global'
  | 'recording'
  | 'notes-list'
  | 'note-detail'
  | 'coaching'
  | 'settings'
  | 'search'

export interface ShortcutDef {
  id: string
  label: string
  description?: string
  scope: ShortcutScope
  /** Binding string parseable by parseBinding(). Use "mod+X" for Cmd/Ctrl. */
  defaultBinding: string
  /** Allow to fire while input/textarea/contenteditable is focused. Default false. */
  allowInInput?: boolean
  /** True for destructive actions — surfaces red in the help overlay. */
  destructive?: boolean
  /** Grouping label for the help overlay (e.g., "Recording", "Navigation"). */
  group: string
}

export const SHORTCUT_DEFS: readonly ShortcutDef[] = [
  // -- Global ----------------------------------------------------------
  {
    id: 'help.open',
    label: 'Show keyboard shortcuts',
    description: 'Toggle the shortcut cheatsheet overlay',
    scope: 'global',
    defaultBinding: 'shift+/',
    allowInInput: false,
    group: 'General',
  },
  {
    id: 'app.search',
    label: 'Open quick search',
    description: 'Jump to any note, person, or setting',
    scope: 'global',
    defaultBinding: 'mod+k',
    allowInInput: true,
    group: 'Navigation',
  },
  {
    id: 'app.toggle-sidebar',
    label: 'Toggle sidebar',
    scope: 'global',
    defaultBinding: 'mod+\\',
    group: 'Navigation',
  },
  {
    id: 'app.new-note',
    label: 'New recording',
    description: 'Start a fresh recording session',
    scope: 'global',
    defaultBinding: 'mod+n',
    group: 'Recording',
  },
  {
    id: 'app.go-home',
    label: 'Go to Home',
    scope: 'global',
    defaultBinding: 'g then h',
    group: 'Navigation',
  },
  {
    id: 'app.go-notes',
    label: 'Go to All Notes',
    scope: 'global',
    defaultBinding: 'g then n',
    group: 'Navigation',
  },
  {
    id: 'app.go-commitments',
    label: 'Go to Commitments',
    scope: 'global',
    defaultBinding: 'g then c',
    group: 'Navigation',
  },
  {
    id: 'app.go-people',
    label: 'Go to People',
    scope: 'global',
    defaultBinding: 'g then p',
    group: 'Navigation',
  },
  {
    id: 'app.go-calendar',
    label: 'Go to Calendar',
    scope: 'global',
    defaultBinding: 'g then k',
    group: 'Navigation',
  },
  {
    id: 'app.go-settings',
    label: 'Open Settings',
    scope: 'global',
    defaultBinding: 'mod+,',
    group: 'Navigation',
  },
  {
    id: 'app.go-projects',
    label: 'Go to Projects',
    scope: 'global',
    defaultBinding: 'g then j',
    group: 'Navigation',
  },
  {
    id: 'app.go-decisions',
    label: 'Go to Decisions',
    scope: 'global',
    defaultBinding: 'g then d',
    group: 'Navigation',
  },
  {
    id: 'app.cancel',
    label: 'Cancel / close',
    description: 'Close dialogs, menus, and overlays',
    scope: 'global',
    defaultBinding: 'escape',
    allowInInput: true,
    group: 'General',
  },

  // -- Recording -------------------------------------------------------
  {
    id: 'recording.toggle',
    label: 'Start / stop recording',
    scope: 'recording',
    defaultBinding: 'mod+shift+r',
    allowInInput: true,
    group: 'Recording',
  },
  {
    id: 'recording.pause',
    label: 'Pause / resume recording',
    scope: 'recording',
    defaultBinding: 'mod+shift+p',
    allowInInput: true,
    group: 'Recording',
  },

  // -- Notes list ------------------------------------------------------
  {
    id: 'notes.next',
    label: 'Next note',
    scope: 'notes-list',
    defaultBinding: 'j',
    group: 'Lists',
  },
  {
    id: 'notes.prev',
    label: 'Previous note',
    scope: 'notes-list',
    defaultBinding: 'k',
    group: 'Lists',
  },
  {
    id: 'notes.open',
    label: 'Open selected note',
    scope: 'notes-list',
    defaultBinding: 'enter',
    group: 'Lists',
  },
  {
    id: 'notes.search',
    label: 'Search in list',
    scope: 'notes-list',
    defaultBinding: '/',
    group: 'Lists',
  },

  // -- Note detail -----------------------------------------------------
  {
    id: 'note.save',
    label: 'Save note',
    scope: 'note-detail',
    defaultBinding: 'mod+s',
    allowInInput: true,
    group: 'Editing',
  },
  {
    id: 'note.open-coaching',
    label: 'Open coaching tab',
    scope: 'note-detail',
    defaultBinding: 'mod+2',
    group: 'Navigation',
  },
  {
    id: 'note.open-summary',
    label: 'Open summary tab',
    scope: 'note-detail',
    defaultBinding: 'mod+1',
    group: 'Navigation',
  },
  {
    id: 'note.ask',
    label: 'Open Ask bar',
    description: 'Ask a question about this note',
    scope: 'note-detail',
    defaultBinding: 'mod+l',
    group: 'General',
  },

  // -- Commitments -----------------------------------------------------
  {
    id: 'commitment.toggle',
    label: 'Mark commitment complete',
    scope: 'notes-list',
    defaultBinding: 'x',
    group: 'Lists',
  },
  {
    id: 'commitment.snooze',
    label: 'Snooze commitment 1 day',
    scope: 'notes-list',
    defaultBinding: 's',
    group: 'Lists',
  },

  // -- Editing / general confirmation ---------------------------------
  {
    id: 'form.submit',
    label: 'Confirm / submit',
    scope: 'global',
    defaultBinding: 'mod+enter',
    allowInInput: true,
    group: 'Editing',
  },
] as const

// Fast lookup by id
const DEFS_BY_ID = new Map(SHORTCUT_DEFS.map((d) => [d.id, d]))
export function getShortcutDef(id: string): ShortcutDef | undefined {
  return DEFS_BY_ID.get(id)
}

// ---------- User overrides -----------------------------------------------

const OVERRIDE_KEY = 'oschief.keyboard-overrides.v1'

export function loadOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {}
  return {}
}

export function saveOverrides(overrides: Record<string, string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides))
    window.dispatchEvent(new CustomEvent('oschief.keyboard-overrides-changed'))
  } catch {}
}

/** Current binding for an id, respecting user override. */
export function getBinding(id: string, overrides: Record<string, string> = loadOverrides()): string {
  return overrides[id] ?? DEFS_BY_ID.get(id)?.defaultBinding ?? ''
}

export function setOverride(id: string, binding: string): void {
  const defs = DEFS_BY_ID.get(id)
  if (!defs) return
  const current = loadOverrides()
  if (binding === defs.defaultBinding) {
    delete current[id]
  } else {
    current[id] = binding
  }
  saveOverrides(current)
}

export function resetOverride(id: string): void {
  const current = loadOverrides()
  delete current[id]
  saveOverrides(current)
}

export function resetAllOverrides(): void {
  saveOverrides({})
}

/**
 * Detect binding conflicts within the effective set (defaults + overrides).
 * Two shortcuts in the same scope or one of them global cannot share a binding.
 * Returns a list of [idA, idB, binding] triples.
 */
export function findConflicts(
  overrides: Record<string, string> = loadOverrides(),
): Array<{ a: string; b: string; binding: string }> {
  const effective = SHORTCUT_DEFS.map((d) => ({ ...d, binding: overrides[d.id] ?? d.defaultBinding }))
  const conflicts: Array<{ a: string; b: string; binding: string }> = []
  for (let i = 0; i < effective.length; i++) {
    for (let j = i + 1; j < effective.length; j++) {
      const a = effective[i], b = effective[j]
      if (a.binding !== b.binding) continue
      // Same scope or one is global → conflict
      if (a.scope === b.scope || a.scope === 'global' || b.scope === 'global') {
        conflicts.push({ a: a.id, b: b.id, binding: a.binding })
      }
    }
  }
  return conflicts
}

/** Group definitions for the help overlay UI. */
export function byGroup(): Array<{ group: string; items: ShortcutDef[] }> {
  const groups = new Map<string, ShortcutDef[]>()
  for (const d of SHORTCUT_DEFS) {
    const list = groups.get(d.group) ?? []
    list.push(d)
    groups.set(d.group, list)
  }
  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }))
}
