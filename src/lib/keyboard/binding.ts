/**
 * Key-binding normalization and matching.
 *
 * A binding is a lowercase string like:
 *   "cmd+k"       — cmd or ctrl (mod key; platform-agnostic)
 *   "shift+/"     — the "?" key (shift+/)
 *   "g then n"    — chord: first g, then n within 1s
 *   "j"           — bare key, no modifiers
 *
 * We normalize modifiers to `mod` (platform-meta on macOS, ctrl elsewhere) so
 * authors write one binding and it works on every OS. Use `ctrl+` explicitly
 * when you specifically want Control on macOS too.
 *
 * `matches(event, binding)` returns true if a KeyboardEvent fires the binding.
 * We intentionally do NOT call preventDefault or stopPropagation here — that's
 * the caller's choice, and keeps the parser testable without a DOM.
 */

export interface ParsedBinding {
  /** True for Cmd on mac or Ctrl elsewhere. */
  mod: boolean
  /** True for explicit Control (useful on macOS where mod === Cmd). */
  ctrl: boolean
  alt: boolean
  shift: boolean
  /** The base key, lowercase. Letters: "a".."z". Digits: "0".."9". Special: "/", "?", "enter", "escape", "arrowup"... */
  key: string
  /** Chord continuation. When set, matches after `key` was pressed. */
  then?: string
}

export function parseBinding(raw: string): ParsedBinding | null {
  if (!raw || typeof raw !== 'string') return null
  const lower = raw.toLowerCase().trim()
  // Chord: "g then n"
  const chordMatch = lower.split(/\s+then\s+/i)
  if (chordMatch.length === 2) {
    const first = parseBinding(chordMatch[0])
    if (!first) return null
    const second = parseBinding(chordMatch[1])
    if (!second) return null
    return { ...first, then: second.key }
  }
  const parts = lower.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const out: ParsedBinding = { mod: false, ctrl: false, alt: false, shift: false, key: '' }
  for (const part of parts) {
    switch (part) {
      case 'mod':
      case 'cmd':
      case 'meta':
      case 'super':
      case 'win':
        out.mod = true
        break
      case 'ctrl':
      case 'control':
        out.ctrl = true
        break
      case 'alt':
      case 'option':
      case 'opt':
        out.alt = true
        break
      case 'shift':
        out.shift = true
        break
      default:
        if (out.key) return null // two bare keys — malformed
        out.key = part
    }
  }
  if (!out.key) return null
  return out
}

export function normalizeKey(raw: string): string {
  const k = raw.toLowerCase()
  switch (k) {
    case 'esc':
      return 'escape'
    case 'return':
      return 'enter'
    case 'space':
    case 'spacebar':
      return ' '
    case 'del':
      return 'delete'
    default:
      return k
  }
}

export interface KeyLike {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  /** When using IMEs, composition events precede key events; we skip matching while composing. */
  isComposing?: boolean
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '')
}

/**
 * Does the event satisfy the base (non-chord) portion of this binding?
 * Callers that want chord semantics pass `prev` to narrow the match.
 */
export function matches(
  event: KeyLike,
  binding: ParsedBinding,
  opts: { mac?: boolean; prevKey?: string | null } = {},
): boolean {
  if (event.isComposing) return false
  const mac = opts.mac ?? isMac()
  const modDown = mac ? event.metaKey : event.ctrlKey
  if (binding.mod && !modDown) return false
  if (!binding.mod && modDown && !binding.ctrl) return false
  if (binding.ctrl && !event.ctrlKey) return false
  if (!binding.ctrl && event.ctrlKey && !binding.mod) return false
  if (binding.alt !== event.altKey) return false
  if (binding.shift !== event.shiftKey) return false

  const evKey = normalizeKey(event.key)
  if (binding.then !== undefined) {
    // Chord: the FIRST event of the chord is matched when prev is null and evKey matches binding.key
    // Downstream matcher tracks prev.
    if (opts.prevKey) return evKey === binding.then && opts.prevKey === binding.key
    return evKey === binding.key
  }
  return evKey === binding.key
}

/**
 * Format a binding for display. "mod+k" on macOS → "⌘K".
 */
export function formatBinding(binding: ParsedBinding | string, mac: boolean = isMac()): string {
  const b = typeof binding === 'string' ? parseBinding(binding) : binding
  if (!b) return typeof binding === 'string' ? binding : ''
  const parts: string[] = []
  if (b.mod) parts.push(mac ? '⌘' : 'Ctrl')
  if (b.ctrl) parts.push(mac ? '⌃' : 'Ctrl')
  if (b.alt) parts.push(mac ? '⌥' : 'Alt')
  if (b.shift) parts.push(mac ? '⇧' : 'Shift')
  const keyDisplay = formatKey(b.key)
  const main = parts.length > 0 ? parts.join('') + keyDisplay : keyDisplay
  return b.then ? `${main} then ${formatKey(b.then)}` : main
}

function formatKey(k: string): string {
  switch (k) {
    case 'arrowup': return '↑'
    case 'arrowdown': return '↓'
    case 'arrowleft': return '←'
    case 'arrowright': return '→'
    case 'enter': return '↵'
    case 'escape': return 'Esc'
    case ' ': return 'Space'
    case '/': return '/'
    default: return k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1)
  }
}
