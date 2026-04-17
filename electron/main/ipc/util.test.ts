import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Stub the electron module before importing withIPC.
const handlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

import { withIPC, ok, err } from './util'

describe('withIPC', () => {
  beforeEach(() => { handlers.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('registers a handler and returns its resolved value', async () => {
    withIPC('test:echo', async (_e, x: number) => x * 2)
    const fn = handlers.get('test:echo')!
    expect(fn).toBeTruthy()
    const result = await fn({}, 5)
    expect(result).toBe(10)
  })

  it('re-throws errors from the handler so renderer promise rejects', async () => {
    const errSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    withIPC('test:boom', async () => { throw new Error('kaboom') })
    const fn = handlers.get('test:boom')!
    await expect(fn({})).rejects.toThrow('kaboom')
    errSpy.mockRestore()
  })

  it('passes multiple args through in order', async () => {
    withIPC('test:multi', async (_e, a: string, b: number, c: boolean) => ({ a, b, c }))
    const fn = handlers.get('test:multi')!
    expect(await fn({}, 'hello', 42, true)).toEqual({ a: 'hello', b: 42, c: true })
  })
})

describe('ok/err helpers', () => {
  it('ok returns success envelope', () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 })
  })
  it('err wraps Error into envelope', () => {
    expect(err(new Error('bad'))).toEqual({ ok: false, error: 'bad' })
  })
  it('err stringifies non-Error values', () => {
    expect(err('plain string')).toEqual({ ok: false, error: 'plain string' })
  })
})
