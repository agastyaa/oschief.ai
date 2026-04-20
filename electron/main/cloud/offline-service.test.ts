import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import {
  initOfflineService,
  queueOrCall,
  registerHandler,
  getOfflineQueue,
  stopFlusher,
  OfflineQueued,
  __resetForTests,
} from './offline-service'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL,
      payload_json TEXT NOT NULL, payload_bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, next_attempt_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_offline_queue_order ON offline_queue(next_attempt_at, id);
    CREATE TABLE offline_queue_dlq (
      id INTEGER PRIMARY KEY AUTOINCREMENT, original_id INTEGER NOT NULL,
      channel TEXT NOT NULL, payload_json TEXT NOT NULL,
      payload_bytes INTEGER NOT NULL, created_at INTEGER NOT NULL,
      moved_at INTEGER NOT NULL, attempts INTEGER NOT NULL,
      final_error TEXT
    );
  `)
  return db
}

beforeEach(() => {
  __resetForTests()
})

describe('queueOrCall', () => {
  it('returns result on success without queuing', async () => {
    initOfflineService(makeDb())
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(queueOrCall('c', { a: 1 }, fn)).resolves.toBe('ok')
    const q = getOfflineQueue()!
    expect(q.stats().count).toBe(0)
    stopFlusher()
  })

  it('queues on network error and throws OfflineQueued', async () => {
    initOfflineService(makeDb())
    const netErr: any = new Error('fetch failed')
    netErr.name = 'TypeError'
    await expect(
      queueOrCall('llm', { prompt: 'x' }, async () => {
        throw netErr
      }),
    ).rejects.toBeInstanceOf(OfflineQueued)
    const q = getOfflineQueue()!
    expect(q.stats().count).toBe(1)
    stopFlusher()
  })

  it('queues on ECONNREFUSED', async () => {
    initOfflineService(makeDb())
    const err: any = new Error('refused')
    err.code = 'ECONNREFUSED'
    await expect(queueOrCall('c', {}, async () => { throw err })).rejects.toBeInstanceOf(OfflineQueued)
    stopFlusher()
  })

  it('propagates HTTP 4xx/5xx errors without queuing', async () => {
    initOfflineService(makeDb())
    const httpErr: any = new Error('server error')
    httpErr.status = 500
    await expect(queueOrCall('c', {}, async () => { throw httpErr })).rejects.toThrow('server error')
    expect(getOfflineQueue()!.stats().count).toBe(0)
    stopFlusher()
  })

  it('flush calls registered handler and removes on success', async () => {
    const q = initOfflineService(makeDb())
    const netErr: any = new Error('fetch failed'); netErr.name = 'TypeError'
    try {
      await queueOrCall('test.channel', { n: 1 }, async () => { throw netErr })
    } catch {}
    expect(q.stats().count).toBe(1)

    const handler = vi.fn().mockResolvedValue(undefined)
    registerHandler('test.channel', handler)
    const result = await q.flush(async (item) => {
      const h = handler
      await h(item.payload)
    })
    expect(result.ok).toBe(1)
    expect(handler).toHaveBeenCalledWith({ n: 1 })
    expect(q.stats().count).toBe(0)
    stopFlusher()
  })
})
