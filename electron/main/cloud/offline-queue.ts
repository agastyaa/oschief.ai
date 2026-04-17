/**
 * R3 — offline queue for cloud LLM/STT calls.
 *
 * When offline (or transient cloud failures), calls queue here. On reconnect
 * a flusher drains in created_at order. After MAX_ATTEMPTS the item moves to
 * the DLQ so the main queue keeps flushing (availability > strict order).
 *
 * Caps:
 *   - MAX_ITEMS  = 1000
 *   - MAX_BYTES  = 50 * 1024 * 1024 (50MB)
 *   - TTL        = 24h
 * Eviction is FIFO (oldest first). Each eviction emits an observability
 * event + a user-visible toast ("N items evicted from offline queue").
 *
 * Schema lives in migrations.ts v18. This module is pure SQL over a Database
 * handle — easy to test against an in-memory SQLite in tests.
 */

import type Database from 'better-sqlite3'
import { OfflineQueueFull, OfflineQueueExhausted } from '../errors'

export const MAX_ITEMS = 1000
export const MAX_BYTES = 50 * 1024 * 1024 // 50MB
export const TTL_MS = 24 * 60 * 60 * 1000 // 24h
export const MAX_ATTEMPTS = 5

export type OfflineEvent =
  | { type: 'offline.queued'; queue_depth: number; bytes: number }
  | { type: 'offline.flushed'; batch_size: number; duration_ms: number }
  | { type: 'offline.evicted'; reason: 'cap_items' | 'cap_bytes' | 'ttl'; count: number }
  | { type: 'offline.dlq'; channel: string; attempts: number }

export interface OfflineQueueOptions {
  maxItems?: number
  maxBytes?: number
  ttlMs?: number
  maxAttempts?: number
  onEvent?: (e: OfflineEvent) => void
  /** Injectable clock for deterministic tests. */
  now?: () => number
}

export interface QueuedItem {
  id: number
  channel: string
  payload: unknown
  payload_bytes: number
  created_at: number
  attempts: number
  last_error: string | null
  next_attempt_at: number
}

export class OfflineQueue {
  private readonly maxItems: number
  private readonly maxBytes: number
  private readonly ttlMs: number
  private readonly maxAttempts: number
  private readonly onEvent?: (e: OfflineEvent) => void
  private readonly now: () => number

  constructor(private readonly db: Database.Database, opts: OfflineQueueOptions = {}) {
    this.maxItems = opts.maxItems ?? MAX_ITEMS
    this.maxBytes = opts.maxBytes ?? MAX_BYTES
    this.ttlMs = opts.ttlMs ?? TTL_MS
    this.maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS
    this.onEvent = opts.onEvent
    this.now = opts.now ?? Date.now
  }

  /**
   * Enqueue a call. Applies TTL sweep + cap eviction first, then inserts.
   * Single serializable transaction.
   */
  enqueue(channel: string, payload: unknown): number {
    const json = JSON.stringify(payload)
    const bytes = Buffer.byteLength(json, 'utf8')
    if (bytes > this.maxBytes) {
      throw new OfflineQueueFull(
        `payload (${bytes}B) exceeds queue cap (${this.maxBytes}B)`,
        { channel, bytes },
      )
    }

    const tx = this.db.transaction(() => {
      this.sweepExpiredInTx()
      this.evictToCapInTx(bytes)
      const info = this.db
        .prepare(
          `INSERT INTO offline_queue (channel, payload_json, payload_bytes, created_at, next_attempt_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(channel, json, bytes, this.now(), this.now())
      return info.lastInsertRowid as number
    })
    const id = tx()
    const s = this.stats()
    this.onEvent?.({ type: 'offline.queued', queue_depth: s.count, bytes: s.bytes })
    return id
  }

  /** Peek N items ready to attempt (next_attempt_at <= now), oldest first. */
  pending(limit = 50): QueuedItem[] {
    const rows = this.db
      .prepare(
        `SELECT id, channel, payload_json, payload_bytes, created_at, attempts, last_error, next_attempt_at
         FROM offline_queue
         WHERE next_attempt_at <= ?
         ORDER BY created_at ASC, id ASC
         LIMIT ?`,
      )
      .all(this.now(), limit) as Array<{
      id: number
      channel: string
      payload_json: string
      payload_bytes: number
      created_at: number
      attempts: number
      last_error: string | null
      next_attempt_at: number
    }>
    return rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      payload: JSON.parse(r.payload_json),
      payload_bytes: r.payload_bytes,
      created_at: r.created_at,
      attempts: r.attempts,
      last_error: r.last_error,
      next_attempt_at: r.next_attempt_at,
    }))
  }

  /** Remove an item after successful flush. */
  ack(id: number): void {
    this.db.prepare('DELETE FROM offline_queue WHERE id = ?').run(id)
  }

  /**
   * Record a failure. If attempts exceed maxAttempts, move to DLQ.
   * Returns 'retry' if item remains in main queue, 'dlq' if moved.
   */
  fail(id: number, error: string, delayMs = 0): 'retry' | 'dlq' {
    const row = this.db
      .prepare('SELECT id, channel, attempts FROM offline_queue WHERE id = ?')
      .get(id) as { id: number; channel: string; attempts: number } | undefined
    if (!row) return 'retry' // already gone (acked or evicted)

    const attempts = row.attempts + 1
    if (attempts >= this.maxAttempts) {
      this.moveToDlq(id, error)
      this.onEvent?.({ type: 'offline.dlq', channel: row.channel, attempts })
      return 'dlq'
    }

    this.db
      .prepare(
        `UPDATE offline_queue SET attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?`,
      )
      .run(attempts, error, this.now() + delayMs, id)
    return 'retry'
  }

  private moveToDlq(id: number, finalError: string): void {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare(
          `SELECT id, channel, payload_json, payload_bytes, created_at, attempts
           FROM offline_queue WHERE id = ?`,
        )
        .get(id) as any
      if (!row) return
      this.db
        .prepare(
          `INSERT INTO offline_queue_dlq
             (original_id, channel, payload_json, payload_bytes, created_at, moved_at, attempts, final_error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.channel,
          row.payload_json,
          row.payload_bytes,
          row.created_at,
          this.now(),
          row.attempts + 1,
          finalError,
        )
      this.db.prepare('DELETE FROM offline_queue WHERE id = ?').run(id)
    })
    tx()
  }

  /**
   * Sweep items older than TTL. Called inside enqueue's txn; also exposed
   * for periodic maintenance.
   */
  sweepExpired(): number {
    return this.db.transaction(() => this.sweepExpiredInTx())()
  }

  private sweepExpiredInTx(): number {
    const cutoff = this.now() - this.ttlMs
    const info = this.db
      .prepare('DELETE FROM offline_queue WHERE created_at < ?')
      .run(cutoff)
    const count = info.changes
    if (count > 0) this.onEvent?.({ type: 'offline.evicted', reason: 'ttl', count })
    return count
  }

  /**
   * Evict oldest items until count <= maxItems-1 AND bytes + newBytes <= maxBytes.
   * Single-pass over sorted rows (FIFO).
   */
  private evictToCapInTx(newBytes: number): void {
    const stats = this.db
      .prepare('SELECT COUNT(*) as count, COALESCE(SUM(payload_bytes), 0) as bytes FROM offline_queue')
      .get() as { count: number; bytes: number }

    let overItems = Math.max(0, stats.count + 1 - this.maxItems)
    let overBytes = Math.max(0, stats.bytes + newBytes - this.maxBytes)

    if (overItems === 0 && overBytes === 0) return

    const rows = this.db
      .prepare(
        `SELECT id, payload_bytes FROM offline_queue
         ORDER BY created_at ASC, id ASC`,
      )
      .all() as Array<{ id: number; payload_bytes: number }>

    const toDelete: number[] = []
    let itemReason = false
    let byteReason = false
    for (const r of rows) {
      if (overItems === 0 && overBytes === 0) break
      toDelete.push(r.id)
      if (overItems > 0) {
        overItems -= 1
        itemReason = true
      }
      if (overBytes > 0) {
        overBytes = Math.max(0, overBytes - r.payload_bytes)
        byteReason = true
      }
    }

    if (toDelete.length === 0) return
    const placeholders = toDelete.map(() => '?').join(',')
    this.db.prepare(`DELETE FROM offline_queue WHERE id IN (${placeholders})`).run(...toDelete)

    // Prefer bytes as reason if byte cap drove any eviction — bytes are the
    // more surprising failure mode (user hits 50MB way before 1000 items for
    // LLM payloads).
    const reason: OfflineEvent & { type: 'offline.evicted' } = {
      type: 'offline.evicted',
      reason: byteReason ? 'cap_bytes' : itemReason ? 'cap_items' : 'cap_items',
      count: toDelete.length,
    }
    this.onEvent?.(reason)
  }

  stats(): { count: number; bytes: number; dlq_count: number } {
    const main = this.db
      .prepare('SELECT COUNT(*) as count, COALESCE(SUM(payload_bytes), 0) as bytes FROM offline_queue')
      .get() as { count: number; bytes: number }
    const dlq = this.db
      .prepare('SELECT COUNT(*) as count FROM offline_queue_dlq')
      .get() as { count: number }
    return { count: main.count, bytes: main.bytes, dlq_count: dlq.count }
  }

  /**
   * Flush helper — runs `handler` for each pending item. Returns counts.
   * Handler throws on failure with optional .retryAfterMs hint.
   */
  async flush(
    handler: (item: QueuedItem) => Promise<void>,
    limit = 50,
  ): Promise<{ ok: number; retry: number; dlq: number }> {
    const start = this.now()
    const items = this.pending(limit)
    let ok = 0,
      retry = 0,
      dlq = 0
    for (const item of items) {
      try {
        await handler(item)
        this.ack(item.id)
        ok += 1
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const delay = (err as any)?.retryAfterMs ?? 0
        const result = this.fail(item.id, msg, delay)
        if (result === 'dlq') dlq += 1
        else retry += 1
      }
    }
    this.onEvent?.({
      type: 'offline.flushed',
      batch_size: ok,
      duration_ms: this.now() - start,
    })
    if (dlq > 0 && items.length > 0 && ok === 0 && retry === 0) {
      // Full batch exhausted — surfaced for callers that want to escalate.
      throw new OfflineQueueExhausted(`batch of ${items.length} items all moved to DLQ`)
    }
    return { ok, retry, dlq }
  }
}
