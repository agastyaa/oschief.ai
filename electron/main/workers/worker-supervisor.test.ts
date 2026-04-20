import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  WorkerSupervisor,
  WorkerHandle,
  SupervisorEvent,
} from './worker-supervisor'
import { WorkerSpawnError, WorkerCrashed } from '../errors'

interface FakeTimer {
  cb: () => void
  ms: number
  cleared: boolean
}

class FakeHandle implements WorkerHandle {
  exitCb: ((info: { code: number | null; signal: string | null }) => void) | null = null
  killed = false
  onExit(cb: (info: { code: number | null; signal: string | null }) => void) {
    this.exitCb = cb
  }
  async kill() {
    this.killed = true
    this.exitCb?.({ code: 0, signal: null })
  }
  crash(code = 1, signal: string | null = null) {
    this.exitCb?.({ code, signal })
  }
}

function makeHarness() {
  let clock = 1_000_000
  const now = () => clock
  const advance = (ms: number) => {
    clock += ms
    // fire any timers due
    for (const t of timers) {
      if (!t.cleared && clock >= t.dueAt) {
        t.cleared = true
        t.cb()
      }
    }
  }
  const timers: Array<FakeTimer & { dueAt: number }> = []
  const setTimer = (cb: () => void, ms: number) => {
    const t = { cb, ms, cleared: false, dueAt: clock + ms }
    timers.push(t)
    return {
      clear: () => {
        t.cleared = true
      },
    }
  }
  const handles: FakeHandle[] = []
  const spawn = vi.fn(async () => {
    const h = new FakeHandle()
    handles.push(h)
    return h
  })
  return { now, advance, setTimer, spawn, handles, timers }
}

describe('WorkerSupervisor', () => {
  let h: ReturnType<typeof makeHarness>
  let events: SupervisorEvent[]

  beforeEach(() => {
    h = makeHarness()
    events = []
  })

  it('start spawns and enters running state', async () => {
    const s = new WorkerSupervisor({
      kind: 'aec',
      spawn: h.spawn,
      now: h.now,
      setTimer: h.setTimer,
      onEvent: (e) => events.push(e),
    })
    await s.start()
    expect(h.spawn).toHaveBeenCalledTimes(1)
    expect(s.isHealthy()).toBe(true)
  })

  it('start throws WorkerSpawnError when spawn throws', async () => {
    const s = new WorkerSupervisor({
      kind: 'stt',
      spawn: async () => {
        throw new Error('boom')
      },
      now: h.now,
      setTimer: h.setTimer,
    })
    await expect(s.start()).rejects.toBeInstanceOf(WorkerSpawnError)
  })

  it('restarts automatically on unexpected crash', async () => {
    const s = new WorkerSupervisor({
      kind: 'stt',
      spawn: h.spawn,
      now: h.now,
      setTimer: h.setTimer,
      onEvent: (e) => events.push(e),
    })
    await s.start()
    h.handles[0].crash(1, 'SIGSEGV')
    // microtask flush
    await new Promise((r) => setImmediate(r))

    expect(h.spawn).toHaveBeenCalledTimes(2)
    const crashed = events.find((e) => e.type === 'worker.crashed')
    expect(crashed).toMatchObject({ worker_kind: 'stt', exit_code: 1, signal: 'SIGSEGV' })
    const restarted = events.find((e) => e.type === 'worker.restarted')
    expect(restarted).toMatchObject({ success: true, restart_count_last_minute: 1 })
  })

  it('calls onRestart after successful respawn', async () => {
    const onRestart = vi.fn()
    const s = new WorkerSupervisor({
      kind: 'stt',
      spawn: h.spawn,
      onRestart,
      now: h.now,
      setTimer: h.setTimer,
    })
    await s.start()
    h.handles[0].crash()
    await new Promise((r) => setImmediate(r))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  it('triggers restart storm after >3 restarts in one minute', async () => {
    const s = new WorkerSupervisor({
      kind: 'aec',
      spawn: h.spawn,
      restartThreshold: 3,
      cooldownMs: 30_000,
      now: h.now,
      setTimer: h.setTimer,
      onEvent: (e) => events.push(e),
    })
    await s.start()

    // 4 crashes inside the same minute → 4th exceeds threshold
    for (let i = 0; i < 4; i++) {
      h.handles[h.handles.length - 1].crash()
      await new Promise((r) => setImmediate(r))
      h.advance(1000)
    }

    const storm = events.find((e) => e.type === 'worker.restart_storm')
    expect(storm).toMatchObject({ cooldown_applied: true, worker_kind: 'aec' })
    expect(s.isHealthy()).toBe(false)
    // No new spawn while in cooldown (the 4th crash should have stopped at storm)
    const spawnCallsBeforeCooldown = h.spawn.mock.calls.length
    h.advance(10_000) // still in cooldown
    expect(h.spawn.mock.calls.length).toBe(spawnCallsBeforeCooldown)
  })

  it('exits cooldown after cooldownMs and respawns', async () => {
    const s = new WorkerSupervisor({
      kind: 'aec',
      spawn: h.spawn,
      restartThreshold: 2,
      cooldownMs: 30_000,
      now: h.now,
      setTimer: h.setTimer,
      onEvent: (e) => events.push(e),
    })
    await s.start()
    for (let i = 0; i < 3; i++) {
      h.handles[h.handles.length - 1].crash()
      await new Promise((r) => setImmediate(r))
      h.advance(100)
    }
    expect(events.some((e) => e.type === 'worker.restart_storm')).toBe(true)
    const before = h.spawn.mock.calls.length
    h.advance(30_001)
    await new Promise((r) => setImmediate(r))
    expect(h.spawn.mock.calls.length).toBe(before + 1)
  })

  it('restart bucket prunes entries older than 60s', async () => {
    const s = new WorkerSupervisor({
      kind: 'stt',
      spawn: h.spawn,
      restartThreshold: 3,
      now: h.now,
      setTimer: h.setTimer,
      onEvent: (e) => events.push(e),
    })
    await s.start()
    // 2 crashes at t=0
    h.handles[0].crash()
    await new Promise((r) => setImmediate(r))
    h.handles[1].crash()
    await new Promise((r) => setImmediate(r))
    // advance 61s — bucket should reset
    h.advance(61_000)
    // Another crash should NOT trip the storm
    h.handles[2].crash()
    await new Promise((r) => setImmediate(r))
    const storms = events.filter((e) => e.type === 'worker.restart_storm')
    expect(storms.length).toBe(0)
  })

  it('stop() prevents restart on exit', async () => {
    const s = new WorkerSupervisor({
      kind: 'aec',
      spawn: h.spawn,
      now: h.now,
      setTimer: h.setTimer,
      onEvent: (e) => events.push(e),
    })
    await s.start()
    const spawnCallsBefore = h.spawn.mock.calls.length
    await s.stop()
    expect(h.handles[0].killed).toBe(true)
    expect(h.spawn.mock.calls.length).toBe(spawnCallsBefore)
    expect(events.find((e) => e.type === 'worker.crashed')).toBeUndefined()
  })

  it('onRestart failure reports restarted success=false and throws WorkerCrashed', async () => {
    const onRestart = vi.fn(async () => {
      throw new Error('state restore failed')
    })
    const errs: unknown[] = []
    const s = new WorkerSupervisor({
      kind: 'stt',
      spawn: h.spawn,
      onRestart,
      now: h.now,
      setTimer: h.setTimer,
      onEvent: (e) => events.push(e),
    })
    await s.start()
    // swallow unhandled rejection from the internal restart promise
    const origOnReject = process.listeners('unhandledRejection').slice()
    process.removeAllListeners('unhandledRejection')
    process.on('unhandledRejection', (r) => errs.push(r))
    h.handles[0].crash()
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    process.removeAllListeners('unhandledRejection')
    for (const l of origOnReject) process.on('unhandledRejection', l)

    const restarted = events.find((e) => e.type === 'worker.restarted')
    expect(restarted).toMatchObject({ success: false })
    // WorkerCrashed thrown from async path
    expect(errs.some((e) => e instanceof WorkerCrashed)).toBe(true)
  })
})
