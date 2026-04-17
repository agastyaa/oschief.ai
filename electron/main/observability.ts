/**
 * Central observability bus for v2.11 reliability events.
 *
 * Each Wave-1 module (retry, offline-queue, worker-supervisor, permissions,
 * ollama prewarm, autosave) emits structured events via an `onEvent`
 * callback. This module owns the default subscriber: route every event
 * through the main-process logger with a stable shape, so downstream sinks
 * (a log drain, PostHog via Stream 5, or just `grep`) get a consistent
 * stream.
 *
 * Adding a new event type:
 *   1. Add it to the discriminated union below.
 *   2. Emit with `emitEvent({ type: '...', ... })` from the producer.
 *   3. Log message auto-derived from type — add a custom mapping only if
 *      the default shape isn't descriptive.
 *
 * No PII is ever logged here. Every event carries counts, kinds, and status
 * codes — never transcript text, never prompt content, never user IDs.
 */

import { createLogger } from './util/logger'
import type { RetryEvent } from './cloud/retry'
import type { OfflineEvent } from './cloud/offline-queue'
import type { SupervisorEvent } from './workers/worker-supervisor'

type OllamaPrewarmEvent = {
  type: 'ollama.prewarm'
  model: string
  ok: boolean
  duration_ms: number
}

type PermissionEvent = {
  type: 'permission.denied'
  kind: string
  was_granted_before: boolean
}

export type ObservabilityEvent =
  | RetryEvent
  | OfflineEvent
  | SupervisorEvent
  | OllamaPrewarmEvent
  | PermissionEvent

type Subscriber = (e: ObservabilityEvent) => void

const log = createLogger('obs')
const subscribers = new Set<Subscriber>()

function defaultLogSubscriber(e: ObservabilityEvent): void {
  // Map event severity. Most are info; crashes / exhausted / storms are warn.
  const warnTypes = new Set<ObservabilityEvent['type']>([
    'worker.crashed',
    'worker.restart_storm',
    'offline.evicted',
    'offline.dlq',
    'permission.denied',
  ])
  const level = warnTypes.has(e.type) ? 'warn' : 'info'
  // Strip `type` from the payload to avoid duplicate field when logger also
  // records msg. Everything else flows through as structured kv pairs.
  const { type, ...rest } = e as any
  if (level === 'warn') log.warn(type, rest)
  else log.info(type, rest)
}

// Default subscriber is always on. Stream 5 will add a PostHog subscriber.
subscribers.add(defaultLogSubscriber)

export function emitEvent(e: ObservabilityEvent): void {
  for (const s of subscribers) {
    try {
      s(e)
    } catch (err) {
      // A broken subscriber must not take down the producer.
      log.error('subscriber-threw', { err: err instanceof Error ? err.message : String(err) })
    }
  }
}

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

/**
 * Test-only: swap the subscriber set. Used by tests that want to assert on
 * emitted events without stubbing every producer's onEvent option.
 */
export function __resetForTests(): void {
  subscribers.clear()
  subscribers.add(defaultLogSubscriber)
}
