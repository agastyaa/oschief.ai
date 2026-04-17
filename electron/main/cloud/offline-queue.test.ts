import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { OfflineQueue, OfflineEvent } from './offline-queue'
import { OfflineQueueFull } from '../errors'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  // Schema mirrors migrations.ts v18 so tests don't depend on migration runner.
  db.exec(`
    CREATE TABLE offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      next_attempt_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_offline_queue_order ON offline_queue(next_attempt_at, id);
    CREATE TABLE offline_queue_dlq (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      payload_bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      moved_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL,
      final_error TEXT
    );
  `)
  return db
}

describe('OfflineQueue', () => {
  let db: Database.Database
  let events: OfflineEvent[]
  let clock: { t: number }
  let now: () => number

  beforeEach(() => {
    db = makeDb()
    events = []
    clock = { t: 1_700_000_000_000 }
    now = () => clock.t
  })

  it('enqueue returns an id and emits offline.queued', () => {
    const q = new OfflineQueue(db, { onEvent: (e) => events.push(e), now })
    const id = q.enqueue('llm.summarize', { prompt: 'hello' })
    expect(id).toBeGreaterThan(0)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'offline.queued', queue_depth: 1 })
    expect((events[0] as any).bytes).toBeGreaterThan(0)
  })

  it('pending returns items in FIFO order', () => {
    const q = new OfflineQueue(db, { now })
    clock.t = 100; q.enqueue('a', { n: 1 })
    clock.t = 200; q.enqueue('b', { n: 2 })
    clock.t = 300; q.enqueue('c', { n: 3 })
    clock.t = 1000
    const pending = q.pending()
    expect(pending.map((p) => p.channel)).toEqual(['a', 'b', 'c'])
  })

  it('ack removes item from queue', () => {
    const q = new OfflineQueue(db, { now })
    const id = q.enqueue('a', { n: 1 })
    q.ack(id)
    expect(q.pending()).toHaveLength(0)
    expect(q.stats().count).toBe(0)
  })

  it('fail increments attempts and sets next_attempt_at', () => {
    const q = new OfflineQueue(db, { now })
    const id = q.enqueue('a', { n: 1 })
    clock.t += 10
    const result = q.fail(id, 'boom', 5000)
    expect(result).toBe('retry')
    const pending = q.pending()
    expect(pending).toHaveLength(0) // not ready yet — next_attempt_at > now
    clock.t += 5001
    const ready = q.pending()
    expect(ready).toHaveLength(1)
    expect(ready[0].attempts).toBe(1)
    expect(ready[0].last_error).toBe('boom')
  })

  it('fail moves to DLQ after maxAttempts', () => {
    const q = new OfflineQueue(db, { now, onEvent: (e) => events.push(e), maxAttempts: 3 })
    const id = q.enqueue('a', { n: 1 })
    expect(q.fail(id, 'e1')).toBe('retry')
    expect(q.fail(id, 'e2')).toBe('retry')
    expect(q.fail(id, 'e3')).toBe('dlq')
    expect(q.stats()).toMatchObject({ count: 0, dlq_count: 1 })
    expect(events.find((e) => e.type === 'offline.dlq')).toMatchObject({ channel: 'a', attempts: 3 })
    const dlqRow = db.prepare('SELECT * FROM offline_queue_dlq').get() as any
    expect(dlqRow.final_error).toBe('e3')
    expect(dlqRow.original_id).toBe(id)
  })

  it('evicts oldest items when count exceeds maxItems (FIFO)', () => {
    const q = new OfflineQueue(db, {
      now,
      onEvent: (e) => events.push(e),
      maxItems: 3,
    })
    clock.t = 100; q.enqueue('a', { n: 1 })
    clock.t = 200; q.enqueue('b', { n: 2 })
    clock.t = 300; q.enqueue('c', { n: 3 })
    clock.t = 400; q.enqueue('d', { n: 4 }) // triggers eviction of 'a'

    const pending = q.pending()
    expect(pending.map((p) => p.channel)).toEqual(['b', 'c', 'd'])
    const evict = events.find((e) => e.type === 'offline.evicted')
    expect(evict).toMatchObject({ reason: 'cap_items', count: 1 })
  })

  it('evicts when bytes exceed maxBytes', () => {
    // maxBytes just large enough for ~2 payloads. Each payload ~40 bytes.
    const q = new OfflineQueue(db, {
      now,
      onEvent: (e) => events.push(e),
      maxBytes: 100,
    })
    clock.t = 100; q.enqueue('a', { big: 'x'.repeat(30) })
    clock.t = 200; q.enqueue('b', { big: 'y'.repeat(30) })
    clock.t = 300; q.enqueue('c', { big: 'z'.repeat(30) }) // should evict 'a'

    const pending = q.pending()
    expect(pending.map((p) => p.channel)).not.toContain('a')
    const byteEvict = events.find(
      (e) => e.type === 'offline.evicted' && (e as any).reason === 'cap_bytes',
    )
    expect(byteEvict).toBeDefined()
  })

  it('rejects payloads that exceed maxBytes outright', () => {
    const q = new OfflineQueue(db, { now, maxBytes: 10 })
    expect(() => q.enqueue('a', { big: 'x'.repeat(1000) })).toThrow(OfflineQueueFull)
  })

  it('sweeps expired items (TTL)', () => {
    const q = new OfflineQueue(db, { now, onEvent: (e) => events.push(e), ttlMs: 10_000 })
    clock.t = 100; q.enqueue('old', {})
    clock.t = 200; q.enqueue('still-old', {})
    clock.t = 15_000 // triggers TTL sweep on next enqueue
    q.enqueue('fresh', {})
    const pending = q.pending()
    expect(pending.map((p) => p.channel)).toEqual(['fresh'])
    expect(events.find((e) => e.type === 'offline.evicted' && (e as any).reason === 'ttl')).toBeDefined()
  })

  it('flush: happy path acks all and emits offline.flushed', async () => {
    const q = new OfflineQueue(db, { now, onEvent: (e) => events.push(e) })
    clock.t = 100; q.enqueue('a', { n: 1 })
    clock.t = 200; q.enqueue('b', { n: 2 })
    clock.t = 1000

    const seen: string[] = []
    const result = await q.flush(async (item) => {
      seen.push(item.channel)
    })
    expect(result).toEqual({ ok: 2, retry: 0, dlq: 0 })
    expect(seen).toEqual(['a', 'b'])
    expect(q.stats().count).toBe(0)
    expect(events.find((e) => e.type === 'offline.flushed')).toMatchObject({ batch_size: 2 })
  })

  it('flush: preserves order on partial failure', async () => {
    const q = new OfflineQueue(db, { now })
    clock.t = 100; q.enqueue('a', { n: 1 })
    clock.t = 200; q.enqueue('b', { n: 2 })
    clock.t = 300; q.enqueue('c', { n: 3 })
    clock.t = 1000

    const order: string[] = []
    const result = await q.flush(async (item) => {
      order.push(item.channel)
      if (item.channel === 'b') throw new Error('middle fails')
    })
    expect(order).toEqual(['a', 'b', 'c'])
    expect(result).toEqual({ ok: 2, retry: 1, dlq: 0 })
    // 'b' stayed queued with attempts=1
    clock.t += 10_000_000
    const remaining = q.pending()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].channel).toBe('b')
    expect(remaining[0].attempts).toBe(1)
  })

  it('flush: respects next_attempt_at backoff delay', async () => {
    const q = new OfflineQueue(db, { now })
    clock.t = 100; q.enqueue('a', {})
    clock.t = 200
    const retryErr: any = new Error('429')
    retryErr.retryAfterMs = 5000
    await q.flush(async () => { throw retryErr })

    // Not ready yet
    expect(q.pending()).toHaveLength(0)
    clock.t += 5001
    expect(q.pending()).toHaveLength(1)
  })

  it('stats reports count + bytes + dlq_count', () => {
    const q = new OfflineQueue(db, { now, maxAttempts: 2 })
    q.enqueue('a', { n: 1 })
    const id = q.enqueue('b', { n: 2 })
    q.fail(id, 'e1')
    q.fail(id, 'e2') // → dlq

    const s = q.stats()
    expect(s.count).toBe(1)
    expect(s.bytes).toBeGreaterThan(0)
    expect(s.dlq_count).toBe(1)
  })
})
