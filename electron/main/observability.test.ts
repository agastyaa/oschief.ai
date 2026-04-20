import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emitEvent, subscribe, __resetForTests, ObservabilityEvent } from './observability'

describe('observability bus', () => {
  beforeEach(() => {
    __resetForTests()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('delivers events to subscribers', () => {
    const received: ObservabilityEvent[] = []
    subscribe((e) => received.push(e))
    emitEvent({ type: 'retry.attempted', channel: 'c', status_code: 429, attempt: 1, final: false })
    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('retry.attempted')
  })

  it('unsubscribe removes the subscriber', () => {
    const received: ObservabilityEvent[] = []
    const unsub = subscribe((e) => received.push(e))
    emitEvent({ type: 'offline.queued', queue_depth: 1, bytes: 100 })
    unsub()
    emitEvent({ type: 'offline.queued', queue_depth: 2, bytes: 200 })
    expect(received).toHaveLength(1)
  })

  it('isolates thrown subscriber so others still fire', () => {
    const good: ObservabilityEvent[] = []
    subscribe(() => {
      throw new Error('boom')
    })
    subscribe((e) => good.push(e))
    emitEvent({ type: 'worker.crashed', worker_kind: 'stt', exit_code: 1, signal: null })
    expect(good).toHaveLength(1)
  })

  it('routes worker.crashed to warn level', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    emitEvent({ type: 'worker.crashed', worker_kind: 'aec', exit_code: null, signal: 'SIGSEGV' })
    expect(warnSpy).toHaveBeenCalled()
  })

  it('routes retry.attempted to info level', () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    emitEvent({ type: 'retry.attempted', channel: 'llm', status_code: 500, attempt: 2, final: false })
    expect(infoSpy).toHaveBeenCalled()
  })
})
