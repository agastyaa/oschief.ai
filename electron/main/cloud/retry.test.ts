import { describe, it, expect, vi } from 'vitest'
import { retryWithBackoff, RetryEvent } from './retry'
import { AuthShortCircuit, MaxRetriesExceeded } from '../errors'

function httpErr(status: number, msg = `http ${status}`): Error {
  const e = new Error(msg) as any
  e.status = status
  return e
}

describe('retryWithBackoff', () => {
  it('returns on first success', async () => {
    const op = vi.fn().mockResolvedValue('ok')
    const out = await retryWithBackoff(op, { channel: 'test', sleep: async () => {} })
    expect(out).toBe('ok')
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 and then succeeds', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(httpErr(429))
      .mockRejectedValueOnce(httpErr(429))
      .mockResolvedValueOnce('ok')
    const events: RetryEvent[] = []
    const out = await retryWithBackoff(op, {
      channel: 'c',
      sleep: async () => {},
      rand: () => 0.5,
      onEvent: (e) => events.push(e),
    })
    expect(out).toBe('ok')
    expect(op).toHaveBeenCalledTimes(3)
    expect(events.filter((e) => e.status_code === 429)).toHaveLength(2)
    expect(events.every((e) => !e.final || e.status_code !== 429)).toBe(true)
  })

  it('retries on 500 with exponential backoff delays', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(httpErr(500))
      .mockRejectedValueOnce(httpErr(500))
      .mockResolvedValueOnce('ok')
    const delays: number[] = []
    await retryWithBackoff(op, {
      channel: 'c',
      baseDelayMs: 100,
      rand: () => 0.5, // jitter = 1.0x exactly
      sleep: async (ms) => {
        delays.push(ms)
      },
    })
    // attempt 1 → 100ms, attempt 2 → 200ms (with 0.5 rand, jitter multiplier = 1.0)
    expect(delays).toEqual([100, 200])
  })

  it('short-circuits on 401 with AuthShortCircuit', async () => {
    const op = vi.fn().mockRejectedValue(httpErr(401, 'unauthorized'))
    const events: RetryEvent[] = []
    await expect(
      retryWithBackoff(op, { channel: 'c', sleep: async () => {}, onEvent: (e) => events.push(e) }),
    ).rejects.toBeInstanceOf(AuthShortCircuit)
    expect(op).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ status_code: 401, attempt: 1, final: true })
  })

  it('short-circuits on 403 with AuthShortCircuit', async () => {
    const op = vi.fn().mockRejectedValue(httpErr(403))
    await expect(
      retryWithBackoff(op, { channel: 'c', sleep: async () => {} }),
    ).rejects.toBeInstanceOf(AuthShortCircuit)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('throws MaxRetriesExceeded after maxAttempts on persistent 500', async () => {
    const op = vi.fn().mockRejectedValue(httpErr(500))
    await expect(
      retryWithBackoff(op, { channel: 'c', maxAttempts: 3, sleep: async () => {} }),
    ).rejects.toBeInstanceOf(MaxRetriesExceeded)
    expect(op).toHaveBeenCalledTimes(3)
  })

  it('does not retry on non-retryable 4xx (e.g. 400)', async () => {
    const op = vi.fn().mockRejectedValue(httpErr(400))
    await expect(
      retryWithBackoff(op, { channel: 'c', sleep: async () => {} }),
    ).rejects.toBeInstanceOf(MaxRetriesExceeded)
    // 400 is not in retryableCodes and not in authCodes — first attempt, final=true, bail
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('retries on network errors (no status)', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce('ok')
    const out = await retryWithBackoff(op, { channel: 'c', sleep: async () => {} })
    expect(out).toBe('ok')
    expect(op).toHaveBeenCalledTimes(2)
  })

  it('respects maxDelayMs clamp', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(httpErr(500))
      .mockRejectedValueOnce(httpErr(500))
      .mockRejectedValueOnce(httpErr(500))
      .mockResolvedValueOnce('ok')
    const delays: number[] = []
    await retryWithBackoff(op, {
      channel: 'c',
      baseDelayMs: 10_000,
      maxDelayMs: 12_000,
      rand: () => 0.5,
      sleep: async (ms) => {
        delays.push(ms)
      },
    })
    // exp would be 10000, 20000, 40000 → clamped to 10000, 12000, 12000
    expect(delays[0]).toBe(10_000)
    expect(delays[1]).toBe(12_000)
    expect(delays[2]).toBe(12_000)
  })

  it('emits final=true on last attempt', async () => {
    const op = vi.fn().mockRejectedValue(httpErr(500))
    const events: RetryEvent[] = []
    await expect(
      retryWithBackoff(op, {
        channel: 'c',
        maxAttempts: 2,
        sleep: async () => {},
        onEvent: (e) => events.push(e),
      }),
    ).rejects.toBeInstanceOf(MaxRetriesExceeded)
    expect(events[events.length - 1].final).toBe(true)
    expect(events[events.length - 1].attempt).toBe(2)
  })
})
