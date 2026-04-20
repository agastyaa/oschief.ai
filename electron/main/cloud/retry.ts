/**
 * R4 — retry with exponential backoff.
 *
 * - 429/500/502/503/504 and network-flake errors → retry with backoff
 * - 401/403 → short-circuit, throw AuthShortCircuit (never retry auth failures)
 * - Max 5 attempts by default
 * - Backoff: base * 2^(attempt-1), jittered ±25%, clamped to maxDelayMs
 *
 * Emits observability events via optional `onEvent` callback (reliability
 * ships blind without telemetry — see plan "Observability" section).
 */

import { AuthShortCircuit, MaxRetriesExceeded } from '../errors'

export interface RetryEvent {
  type: 'retry.attempted'
  channel: string
  status_code: number | null
  attempt: number
  final: boolean
}

export interface RetryOptions {
  channel: string
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  onEvent?: (e: RetryEvent) => void
  /** Test hook — replaces setTimeout. */
  sleep?: (ms: number) => Promise<void>
  /** Test hook — replaces Math.random for jitter. */
  rand?: () => number
  /** Status codes that should short-circuit (never retry). Default: 401, 403. */
  authCodes?: number[]
  /** Status codes that trigger a retry (transient). Default: 408, 425, 429, 500, 502, 503, 504. */
  retryableCodes?: number[]
}

const DEFAULT_AUTH = [401, 403]
const DEFAULT_RETRYABLE = [408, 425, 429, 500, 502, 503, 504]

export interface RetryableFailure {
  statusCode?: number | null
  /** True for network-layer flakes (ECONNRESET, ETIMEDOUT, DNS). */
  network?: boolean
}

/**
 * The user-supplied op returns either:
 *  - a truthy result (success — return it)
 *  - throws (treated via thrownToFailure heuristic)
 *
 * Classification happens via the thrown error's `.status` or `.statusCode`
 * property, or the op itself can throw objects shaped like RetryableFailure.
 */
export async function retryWithBackoff<T>(
  op: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const {
    channel,
    maxAttempts = 5,
    baseDelayMs = 500,
    maxDelayMs = 30_000,
    onEvent,
    sleep = defaultSleep,
    rand = Math.random,
    authCodes = DEFAULT_AUTH,
    retryableCodes = DEFAULT_RETRYABLE,
  } = opts

  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await op(attempt)
    } catch (err) {
      lastErr = err
      const status = extractStatus(err)

      if (status !== null && authCodes.includes(status)) {
        onEvent?.({ type: 'retry.attempted', channel, status_code: status, attempt, final: true })
        throw new AuthShortCircuit(
          `Auth failure (${status}) on ${channel} — not retrying`,
          { status, channel, cause: errMessage(err) },
        )
      }

      const retryable = status === null ? true : retryableCodes.includes(status)
      const final = !retryable || attempt === maxAttempts
      onEvent?.({ type: 'retry.attempted', channel, status_code: status, attempt, final })

      if (final) break

      const delay = jitter(
        Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs),
        rand,
      )
      await sleep(delay)
    }
  }

  throw new MaxRetriesExceeded(
    `Exceeded ${maxAttempts} attempts on ${channel}`,
    { channel, cause: errMessage(lastErr) },
  )
}

function extractStatus(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const anyErr = err as any
    const s = anyErr.status ?? anyErr.statusCode
    if (typeof s === 'number') return s
  }
  return null
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function jitter(ms: number, rand: () => number): number {
  // ±25% jitter
  return Math.round(ms * (0.75 + rand() * 0.5))
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
