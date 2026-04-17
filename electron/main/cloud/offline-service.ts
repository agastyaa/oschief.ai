/**
 * R3 integration — singleton offline queue + periodic flusher.
 *
 * The OfflineQueue class (offline-queue.ts) is the storage layer. This
 * module owns the app-wide singleton, boots the flusher on app launch,
 * and exposes `queueOrCall()` — the one function every cloud caller
 * opts into to get offline-resilience for free.
 *
 * Flow:
 *   queueOrCall('llm.summarize', payload, fn)
 *     ├─ fn() → success  → return result
 *     ├─ fn() → network-layer error (no status code)
 *     │    └─ enqueue payload, throw OfflineQueued so caller surfaces
 *     │       "we'll retry when you're back online"
 *     └─ fn() → other error → propagate as-is
 *
 * The flusher wakes every FLUSH_INTERVAL_MS, pulls pending items that
 * have passed their next_attempt_at, and invokes registered handlers
 * per channel. Handlers are registered by the cloud provider modules so
 * the flusher doesn't need to know how to call Ollama/OpenAI/Anthropic.
 */

import type Database from 'better-sqlite3'
import { OfflineQueue, QueuedItem } from './offline-queue'
import { emitEvent } from '../observability'
import { createLogger } from '../util/logger'

const log = createLogger('offline-service')
const FLUSH_INTERVAL_MS = 15_000 // every 15s

type Handler = (payload: unknown) => Promise<void>

let singleton: OfflineQueue | null = null
let flushTimer: NodeJS.Timeout | null = null
const handlers = new Map<string, Handler>()

export function initOfflineService(db: Database.Database): OfflineQueue {
  if (singleton) return singleton
  singleton = new OfflineQueue(db, { onEvent: emitEvent })
  startFlusher()
  return singleton
}

export function getOfflineQueue(): OfflineQueue | null {
  return singleton
}

/**
 * Register a handler for a channel. Called once at module-load time by each
 * cloud provider. Handler must throw on failure; the queue takes over from
 * there (retry bucket + DLQ after MAX_ATTEMPTS).
 */
export function registerHandler(channel: string, handler: Handler): void {
  handlers.set(channel, handler)
}

function startFlusher(): void {
  if (flushTimer) return
  flushTimer = setInterval(() => {
    void tick()
  }, FLUSH_INTERVAL_MS)
}

export function stopFlusher(): void {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}

/** Test-only: reset the module singleton so tests can re-init with a fresh DB. */
export function __resetForTests(): void {
  stopFlusher()
  singleton = null
  handlers.clear()
}

async function tick(): Promise<void> {
  const q = singleton
  if (!q) return
  try {
    await q.flush(async (item: QueuedItem) => {
      const h = handlers.get(item.channel)
      if (!h) {
        // No handler registered yet (e.g., provider module not loaded).
        // Throwing keeps the item in the queue for the next tick, which is
        // what we want — handlers may register asynchronously.
        throw new Error(`no handler for channel=${item.channel}`)
      }
      await h(item.payload)
    })
  } catch (err) {
    log.warn('flush-tick-failed', { err: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Thrown by queueOrCall when the payload was queued for later delivery.
 * Callers should surface a non-error UX ("we'll retry when you're online")
 * rather than treating this as a failure.
 */
export class OfflineQueued extends Error {
  constructor(public readonly channel: string) {
    super(`offline: queued on channel=${channel}`)
    this.name = 'OfflineQueued'
    Object.setPrototypeOf(this, OfflineQueued.prototype)
  }
}

/** Heuristic: is this error from the network layer (no HTTP status)? */
function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as any
  const code = e?.code ?? e?.cause?.code
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'ETIMEDOUT') return true
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return true
  // fetch() throws a TypeError with "fetch failed" on network issues
  if (e?.name === 'TypeError' && typeof e?.message === 'string' && e.message.includes('fetch failed')) return true
  return false
}

/**
 * Wrap a cloud call. Success → return result. Network failure → enqueue +
 * throw OfflineQueued. Other failure (HTTP 4xx/5xx, auth, etc.) → rethrow
 * as-is so the caller's error-handling path runs.
 */
export async function queueOrCall<T>(
  channel: string,
  payload: unknown,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (isNetworkError(err) && singleton) {
      try {
        singleton.enqueue(channel, payload)
        throw new OfflineQueued(channel)
      } catch (enqErr) {
        if (enqErr instanceof OfflineQueued) throw enqErr
        // Enqueue itself failed (cap exceeded, etc.) — fall through to
        // rethrowing the original network error.
      }
    }
    throw err
  }
}
