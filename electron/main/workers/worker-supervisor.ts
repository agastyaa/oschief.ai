/**
 * R2 — WorkerSupervisor.
 *
 * Watches long-lived child workers (AEC, STT, LLM), restarts them when they
 * die unexpectedly, and throttles restart storms with a fixed-minute bucket:
 * once >3 restarts fire in a single minute, the supervisor enters a 30s
 * cooldown and emits worker.restart_storm so the UI can show "Worker
 * unstable, retrying in 30s." Without the cooldown, a crash-loop between
 * the supervisor and a broken worker binary would pin the CPU and spam logs.
 *
 * The supervisor is transport-agnostic. Callers provide:
 *   - `spawn`: function that boots the worker and returns a handle with
 *     a `.onExit(cb)` and `.kill()` method
 *   - `onRestart`: optional callback for state restoration (resume STT from
 *     last audio position, re-prompt LLM from scratch, etc.)
 *
 * Lifecycle:
 *   start()   → spawns, registers exit handler
 *   handle()  → returns the current worker (may change across restarts)
 *   stop()    → graceful shutdown (no restart on exit)
 *   isHealthy() → true when not in cooldown and at most 1 attempt in bucket
 *
 * This module has no `child_process` dependency so it's trivially testable.
 * See worker-supervisor.test.ts for crash/restart/storm scenarios.
 */

import { WorkerCrashed, WorkerRestartStorm, WorkerSpawnError } from '../errors'

export type WorkerKind = 'stt' | 'aec' | 'llm'

export interface WorkerHandle {
  /** Fires exactly once per worker when it exits. */
  onExit(cb: (info: { code: number | null; signal: string | null }) => void): void
  /** Graceful stop. Resolves when the process has exited. */
  kill(): Promise<void>
}

export type SupervisorEvent =
  | { type: 'worker.crashed'; worker_kind: WorkerKind; exit_code: number | null; signal: string | null }
  | { type: 'worker.restarted'; worker_kind: WorkerKind; success: boolean; restart_count_last_minute: number }
  | { type: 'worker.restart_storm'; worker_kind: WorkerKind; cooldown_applied: boolean }

export interface WorkerSupervisorOptions {
  kind: WorkerKind
  /** Boot the worker. Throws WorkerSpawnError on unrecoverable failure. */
  spawn: () => Promise<WorkerHandle> | WorkerHandle
  /**
   * Called after a successful restart so the caller can restore state (STT
   * resume-from-audio-position, LLM re-prompt with "Regenerating..." UI).
   * For AEC this is a no-op — restarts are silent.
   */
  onRestart?: () => void | Promise<void>
  /** Max restarts allowed in one minute before triggering cooldown. Default 3. */
  restartThreshold?: number
  /** Cooldown duration after a storm. Default 30s. */
  cooldownMs?: number
  onEvent?: (e: SupervisorEvent) => void
  /** Test hooks. */
  now?: () => number
  setTimer?: (cb: () => void, ms: number) => { clear: () => void }
}

type State = 'stopped' | 'starting' | 'running' | 'cooldown'

export class WorkerSupervisor {
  private state: State = 'stopped'
  private handle: WorkerHandle | null = null
  private restartTimestamps: number[] = []
  private cooldownTimer: { clear: () => void } | null = null

  private readonly kind: WorkerKind
  private readonly spawn: () => Promise<WorkerHandle> | WorkerHandle
  private readonly onRestart?: () => void | Promise<void>
  private readonly threshold: number
  private readonly cooldownMs: number
  private readonly onEvent?: (e: SupervisorEvent) => void
  private readonly now: () => number
  private readonly setTimer: (cb: () => void, ms: number) => { clear: () => void }

  constructor(opts: WorkerSupervisorOptions) {
    this.kind = opts.kind
    this.spawn = opts.spawn
    this.onRestart = opts.onRestart
    this.threshold = opts.restartThreshold ?? 3
    this.cooldownMs = opts.cooldownMs ?? 30_000
    this.onEvent = opts.onEvent
    this.now = opts.now ?? Date.now
    this.setTimer =
      opts.setTimer ??
      ((cb, ms) => {
        const t = setTimeout(cb, ms)
        return { clear: () => clearTimeout(t) }
      })
  }

  /** Boot the worker. Throws WorkerSpawnError on initial failure. */
  async start(): Promise<void> {
    if (this.state !== 'stopped') {
      throw new Error(`WorkerSupervisor already ${this.state}`)
    }
    this.state = 'starting'
    try {
      this.handle = await this.spawn()
    } catch (err) {
      this.state = 'stopped'
      throw new WorkerSpawnError(
        `Failed to spawn ${this.kind} worker: ${err instanceof Error ? err.message : String(err)}`,
        { kind: this.kind },
      )
    }
    this.attachExitHandler(this.handle)
    this.state = 'running'
  }

  /** Stop the worker without restarting. */
  async stop(): Promise<void> {
    this.state = 'stopped'
    if (this.cooldownTimer) {
      this.cooldownTimer.clear()
      this.cooldownTimer = null
    }
    const h = this.handle
    this.handle = null
    if (h) await h.kill()
  }

  handle_(): WorkerHandle | null {
    return this.handle
  }

  isHealthy(): boolean {
    return this.state === 'running' && this.countRestartsInLastMinute() <= 1
  }

  private attachExitHandler(handle: WorkerHandle): void {
    let fired = false
    handle.onExit(({ code, signal }) => {
      if (fired) return
      fired = true
      // Only react to unexpected exits — stop() flipped state to 'stopped'
      if (this.state === 'stopped') return
      this.onEvent?.({
        type: 'worker.crashed',
        worker_kind: this.kind,
        exit_code: code,
        signal,
      })
      void this.handleCrash(code, signal)
    })
  }

  private async handleCrash(code: number | null, signal: string | null): Promise<void> {
    this.handle = null
    this.recordRestartAttempt()
    const count = this.countRestartsInLastMinute()

    if (count > this.threshold) {
      // Enter cooldown; retry once cooldown ends
      this.state = 'cooldown'
      this.onEvent?.({
        type: 'worker.restart_storm',
        worker_kind: this.kind,
        cooldown_applied: true,
      })
      this.cooldownTimer = this.setTimer(() => {
        this.cooldownTimer = null
        // After cooldown, clear the bucket so we give the worker a fresh window
        this.restartTimestamps = []
        if (this.state === 'cooldown') {
          this.state = 'stopped' // so start() preconditions pass
          void this.attemptRestart(code, signal)
        }
      }, this.cooldownMs)
      return
    }

    this.state = 'stopped'
    await this.attemptRestart(code, signal)
  }

  private async attemptRestart(code: number | null, _signal: string | null): Promise<void> {
    try {
      await this.start()
      try {
        await this.onRestart?.()
      } catch (err) {
        // State restoration failure is visible to observers but does not re-trigger
        // the crash path — the worker itself is up.
        this.onEvent?.({
          type: 'worker.restarted',
          worker_kind: this.kind,
          success: false,
          restart_count_last_minute: this.countRestartsInLastMinute(),
        })
        throw new WorkerCrashed(
          `onRestart handler failed for ${this.kind}: ${err instanceof Error ? err.message : String(err)}`,
          { kind: this.kind, phase: 'state-restore' },
        )
      }
      this.onEvent?.({
        type: 'worker.restarted',
        worker_kind: this.kind,
        success: true,
        restart_count_last_minute: this.countRestartsInLastMinute(),
      })
    } catch (err) {
      this.onEvent?.({
        type: 'worker.restarted',
        worker_kind: this.kind,
        success: false,
        restart_count_last_minute: this.countRestartsInLastMinute(),
      })
      // If the respawn itself failed, surface the crash but don't loop — the
      // next restart will only happen if something else triggers it, or after
      // the user retries. Keep state 'stopped'.
      if (err instanceof WorkerCrashed || err instanceof WorkerSpawnError) throw err
      throw new WorkerCrashed(
        `Restart failed for ${this.kind}: ${err instanceof Error ? err.message : String(err)} (after exit_code=${code})`,
        { kind: this.kind, phase: 'respawn' },
      )
    }
  }

  private recordRestartAttempt(): void {
    this.restartTimestamps.push(this.now())
    this.pruneOldAttempts()
  }

  private countRestartsInLastMinute(): number {
    this.pruneOldAttempts()
    return this.restartTimestamps.length
  }

  private pruneOldAttempts(): void {
    const minuteStart = this.now() - 60_000
    this.restartTimestamps = this.restartTimestamps.filter((t) => t >= minuteStart)
  }
}
