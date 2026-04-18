import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import {
  SHORTCUT_DEFS,
  ShortcutScope,
  getBinding,
  getShortcutDef,
  loadOverrides,
} from "./registry";
import { parseBinding, matches, KeyLike } from "./binding";

/**
 * Shortcut runtime.
 *
 * Components register handlers via the `useShortcut(id, handler)` hook.
 * This provider:
 *   1. Installs a single global keydown listener at document level.
 *   2. Maintains the active scope stack — scopes are pushed by providers
 *      like `<ScopeBoundary scope="note-detail">` or pages directly.
 *      A shortcut only fires when its scope is 'global' OR it's in the
 *      current scope stack.
 *   3. Tracks chord state (g-then-n) with a 1.2s timeout.
 *   4. Respects IME composition and focused inputs (unless the shortcut
 *      opts in via `allowInInput`).
 *   5. Watches localStorage for override changes and rebuilds the lookup
 *      table so user rebinds apply without a reload.
 */

type Handler = (ev: KeyboardEvent) => void

interface ShortcutRegistration {
  id: string
  handler: Handler
  /** Guard — returns true when the handler should actually fire. */
  enabled?: () => boolean
}

interface ShortcutContextValue {
  registerHandler: (reg: ShortcutRegistration) => () => void
  pushScope: (scope: ShortcutScope) => () => void
  helpOpen: boolean
  setHelpOpen: (v: boolean) => void
}

const Ctx = createContext<ShortcutContextValue | null>(null)

const CHORD_TIMEOUT_MS = 1200

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const handlers = useRef<Map<string, ShortcutRegistration[]>>(new Map())
  const scopeStack = useRef<ShortcutScope[]>([])
  const lastChordKey = useRef<string | null>(null)
  const chordTimer = useRef<number | null>(null)
  const overridesRef = useRef<Record<string, string>>(loadOverrides())
  const [helpOpen, setHelpOpen] = useState(false)

  const registerHandler = useCallback((reg: ShortcutRegistration) => {
    const list = handlers.current.get(reg.id) ?? []
    list.push(reg)
    handlers.current.set(reg.id, list)
    return () => {
      const next = (handlers.current.get(reg.id) ?? []).filter((r) => r !== reg)
      if (next.length) handlers.current.set(reg.id, next)
      else handlers.current.delete(reg.id)
    }
  }, [])

  const pushScope = useCallback((scope: ShortcutScope) => {
    scopeStack.current = [...scopeStack.current, scope]
    return () => {
      // Remove the most recent matching entry — supports nested scopes.
      const idx = scopeStack.current.lastIndexOf(scope)
      if (idx >= 0) {
        scopeStack.current = scopeStack.current.slice(0, idx).concat(scopeStack.current.slice(idx + 1))
      }
    }
  }, [])

  // Rebuild override cache when user rebinds
  useEffect(() => {
    const onChange = () => {
      overridesRef.current = loadOverrides()
    }
    window.addEventListener('oschief.keyboard-overrides-changed', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('oschief.keyboard-overrides-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Don't eat browser dev-tool shortcuts, etc.
      if (ev.defaultPrevented) return
      const typing = isTypingTarget(ev.target)
      const ek: KeyLike = {
        key: ev.key,
        code: ev.code,
        metaKey: ev.metaKey,
        ctrlKey: ev.ctrlKey,
        altKey: ev.altKey,
        shiftKey: ev.shiftKey,
        isComposing: ev.isComposing,
      }

      // Compute active scopes: global + current stack (top-most first)
      const stack = scopeStack.current
      const activeScopes = new Set<ShortcutScope>(['global', ...stack])

      // Sort defs so deeper-scope (more specific) wins first
      const scopeRank: Record<ShortcutScope, number> = {
        global: 0,
        'notes-list': 1,
        'note-detail': 1,
        coaching: 1,
        settings: 1,
        recording: 2,
        search: 3,
      }
      const defs = [...SHORTCUT_DEFS]
        .filter((d) => activeScopes.has(d.scope))
        .sort((a, b) => scopeRank[b.scope] - scopeRank[a.scope])

      for (const def of defs) {
        if (typing && !def.allowInInput) continue
        const bindingStr = overridesRef.current[def.id] ?? def.defaultBinding
        const binding = parseBinding(bindingStr)
        if (!binding) continue

        // Chord second-step
        if (binding.then !== undefined) {
          // Start of chord
          if (matches(ek, binding, { prevKey: null }) && !lastChordKey.current) {
            lastChordKey.current = binding.key
            if (chordTimer.current) window.clearTimeout(chordTimer.current)
            chordTimer.current = window.setTimeout(() => {
              lastChordKey.current = null
            }, CHORD_TIMEOUT_MS) as unknown as number
            // Don't preventDefault — a naked 'g' might be an input
            return
          }
          // Completion of chord
          if (lastChordKey.current === binding.key && matches(ek, binding, { prevKey: lastChordKey.current })) {
            lastChordKey.current = null
            if (chordTimer.current) window.clearTimeout(chordTimer.current)
            ev.preventDefault()
            fireHandlers(def.id)
            return
          }
          continue
        }

        // Non-chord: reset chord state, then match
        if (matches(ek, binding)) {
          lastChordKey.current = null
          if (chordTimer.current) window.clearTimeout(chordTimer.current)
          ev.preventDefault()
          fireHandlers(def.id)
          return
        }
      }
    }

    const fireHandlers = (id: string) => {
      const list = handlers.current.get(id) ?? []
      // Fire the LAST-registered enabled handler (most recently mounted wins —
      // matches how React's natural stacking plays out for dialogs, etc).
      for (let i = list.length - 1; i >= 0; i--) {
        const r = list[i]
        if (r.enabled && !r.enabled()) continue
        r.handler(new KeyboardEvent('shortcut')) // synthetic for handler signature; real ev preventDefaulted above
        return
      }
      // Special built-in: help overlay has no user handler; provider handles it.
      if (id === 'help.open') setHelpOpen((v) => !v)
      if (id === 'app.cancel') setHelpOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (chordTimer.current) window.clearTimeout(chordTimer.current)
    }
  }, [])

  const value: ShortcutContextValue = {
    registerHandler,
    pushScope,
    helpOpen,
    setHelpOpen,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useShortcutContext(): ShortcutContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    // Soft fallback — render apps mounted without the provider still work;
    // shortcuts just won't fire. This avoids a noisy prod crash.
    return {
      registerHandler: () => () => {},
      pushScope: () => () => {},
      helpOpen: false,
      setHelpOpen: () => {},
    }
  }
  return ctx
}

/** Register a handler for a shortcut by id. Unregisters on unmount. */
export function useShortcut(
  id: string,
  handler: Handler,
  opts: { enabled?: boolean | (() => boolean) } = {},
): void {
  const ctx = useShortcutContext()
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const enabledRef = useRef(opts.enabled)
  enabledRef.current = opts.enabled

  useEffect(() => {
    if (!getShortcutDef(id)) {
      // eslint-disable-next-line no-console
      console.warn(`[useShortcut] unknown id: ${id}`)
      return
    }
    const enabledFn = () => {
      const e = enabledRef.current
      if (e === undefined) return true
      return typeof e === 'function' ? e() : e
    }
    return ctx.registerHandler({
      id,
      handler: (ev) => handlerRef.current(ev),
      enabled: enabledFn,
    })
  }, [id, ctx])
}

/** Push a scope while mounted; pop on unmount. */
export function useScope(scope: ShortcutScope): void {
  const ctx = useShortcutContext()
  useEffect(() => ctx.pushScope(scope), [scope, ctx])
}

/** Imperative hook for toggling the help overlay. */
export function useHelpOverlay(): [boolean, (v: boolean) => void] {
  const ctx = useShortcutContext()
  return [ctx.helpOpen, ctx.setHelpOpen]
}
