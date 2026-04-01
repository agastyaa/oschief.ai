/**
 * Central scheduler — consolidates multiple independent setInterval calls into
 * a single timer that wakes the event loop once per tick and dispatches registered
 * tasks when their interval elapses.
 *
 * Benefits:
 * - Single event loop wakeup instead of N independent timers
 * - Visibility-aware: can pause non-critical tasks when app is hidden
 * - Easy to inspect/debug all background tasks in one place
 */

interface ScheduledTask {
  id: string
  intervalMs: number
  callback: () => void | Promise<void>
  lastRun: number
  /** If true, this task is skipped when the app is hidden. */
  pauseWhenHidden: boolean
}

const tasks: Map<string, ScheduledTask> = new Map()
let tickTimer: ReturnType<typeof setInterval> | null = null
let isHidden = false

const TICK_INTERVAL_MS = 15_000 // Check every 15s which tasks are due

function tick(): void {
  const now = Date.now()
  for (const task of tasks.values()) {
    if (isHidden && task.pauseWhenHidden) continue
    if (now - task.lastRun >= task.intervalMs) {
      task.lastRun = now
      try {
        const result = task.callback()
        // Swallow promise rejections from async tasks
        if (result && typeof (result as Promise<void>).catch === 'function') {
          ;(result as Promise<void>).catch(() => {})
        }
      } catch {
        // Swallow sync errors — don't let one bad task kill the scheduler
      }
    }
  }
}

/**
 * Register a repeating background task.
 * @param id Unique identifier (e.g. 'commitments', 'sync-fallback')
 * @param intervalMs How often to run (milliseconds)
 * @param callback The function to call
 * @param options.pauseWhenHidden If true (default), skip this task when the app is hidden
 * @param options.runImmediately If true, run the callback once immediately on registration
 */
export function registerTask(
  id: string,
  intervalMs: number,
  callback: () => void | Promise<void>,
  options: { pauseWhenHidden?: boolean; runImmediately?: boolean } = {}
): void {
  const { pauseWhenHidden: pause = true, runImmediately = false } = options

  tasks.set(id, {
    id,
    intervalMs,
    callback,
    lastRun: runImmediately ? 0 : Date.now(), // 0 forces immediate run on next tick
    pauseWhenHidden: pause,
  })

  // If this is the first task, start the tick timer
  if (!tickTimer && tasks.size > 0) {
    tickTimer = setInterval(tick, TICK_INTERVAL_MS)
    console.log(`[Scheduler] Started with ${TICK_INTERVAL_MS}ms tick interval`)
  }

  // Run immediately if requested (don't wait for next tick)
  if (runImmediately) {
    try {
      const result = callback()
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch(() => {})
      }
    } catch {
      // Swallow
    }
    // Update lastRun so the next scheduled run is intervalMs from now
    const task = tasks.get(id)
    if (task) task.lastRun = Date.now()
  }

  console.log(`[Scheduler] Registered task "${id}" (every ${Math.round(intervalMs / 1000)}s, pauseWhenHidden=${pause})`)
}

/** Remove a registered task. */
export function unregisterTask(id: string): void {
  tasks.delete(id)
  if (tasks.size === 0 && tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
    console.log('[Scheduler] No tasks remaining, stopped tick timer')
  }
}

/** Called by power-manager when visibility state changes. */
export function setSchedulerHidden(hidden: boolean): void {
  isHidden = hidden
  console.log(`[Scheduler] Visibility changed: hidden=${hidden}`)
}

/** Stop the scheduler and clear all tasks. */
export function stopScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  tasks.clear()
  console.log('[Scheduler] Stopped')
}

/** Get a snapshot of all registered tasks (for debugging). */
export function getSchedulerStatus(): Array<{ id: string; intervalMs: number; lastRun: number; pauseWhenHidden: boolean }> {
  return Array.from(tasks.values()).map(({ id, intervalMs, lastRun, pauseWhenHidden }) => ({
    id, intervalMs, lastRun, pauseWhenHidden,
  }))
}
