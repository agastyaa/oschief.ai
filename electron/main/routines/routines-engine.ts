/**
 * Routines Engine
 *
 * Manages scheduled prompts that run against the meeting graph.
 * Follows the action-reminders.ts pattern: recursive setTimeout, fire-and-forget.
 *
 * LIFECYCLE:
 *  app.whenReady() → scheduleAllRoutines()
 *  routine fires   → executeRoutine() → assembleData → LLM → store + notify
 *  app.before-quit → stopAllRoutines()
 */

import { randomUUID } from 'crypto'
import { Notification, BrowserWindow } from 'electron'
import { getDb, getSetting } from '../storage/database'
import { routeLLM } from '../cloud/router'
import { assembleRoutineData } from './routines-data'
import { resolveSelectedAIModel } from '../models/model-resolver'

const MS_PER_DAY = 86_400_000
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>()

// ── Types ───────────────────────────────────────────────────────────

export interface RoutineConfig {
  id: string
  name: string
  prompt: string
  schedule_type: 'daily' | 'weekly' | 'monthly'
  schedule_hour: number
  schedule_minute: number
  schedule_day: number | null
  delivery: 'notification' | 'in_app' | 'both'
  enabled: number
  builtin_type: string | null
  data_query: string | null
  weekdays_only: number
  created_at: string
  updated_at: string
}

// ── CRUD ────────────────────────────────────────────────────────────

export function getAllRoutines(): RoutineConfig[] {
  return getDb().prepare('SELECT * FROM routines ORDER BY created_at ASC').all() as RoutineConfig[]
}

export function getRoutine(id: string): RoutineConfig | null {
  return getDb().prepare('SELECT * FROM routines WHERE id = ?').get(id) as RoutineConfig ?? null
}

export function createRoutine(data: Partial<RoutineConfig>): RoutineConfig {
  const id = data.id || randomUUID()
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO routines (id, name, prompt, schedule_type, schedule_hour, schedule_minute, schedule_day, delivery, enabled, builtin_type, data_query, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name || 'Untitled Routine',
    data.prompt || '',
    data.schedule_type || 'daily',
    data.schedule_hour ?? 9,
    data.schedule_minute ?? 0,
    data.schedule_day ?? null,
    data.delivery || 'both',
    data.enabled ?? 1,
    data.builtin_type ?? null,
    data.data_query ?? null,
    now, now
  )
  return getRoutine(id)!
}

export function updateRoutine(id: string, data: Partial<RoutineConfig>): boolean {
  const fields: string[] = []
  const values: any[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.prompt !== undefined) { fields.push('prompt = ?'); values.push(data.prompt) }
  if (data.schedule_type !== undefined) { fields.push('schedule_type = ?'); values.push(data.schedule_type) }
  if (data.schedule_hour !== undefined) { fields.push('schedule_hour = ?'); values.push(data.schedule_hour) }
  if (data.schedule_minute !== undefined) { fields.push('schedule_minute = ?'); values.push(data.schedule_minute) }
  if (data.schedule_day !== undefined) { fields.push('schedule_day = ?'); values.push(data.schedule_day) }
  if (data.delivery !== undefined) { fields.push('delivery = ?'); values.push(data.delivery) }
  if (data.enabled !== undefined) { fields.push('enabled = ?'); values.push(data.enabled) }
  if (data.data_query !== undefined) { fields.push('data_query = ?'); values.push(data.data_query) }
  if (fields.length === 0) return false
  fields.push('updated_at = ?'); values.push(new Date().toISOString())
  values.push(id)
  getDb().prepare(`UPDATE routines SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return true
}

export function deleteRoutine(id: string): boolean {
  const routine = getRoutine(id)
  if (routine?.builtin_type) return false // Can't delete built-ins
  const result = getDb().prepare('DELETE FROM routines WHERE id = ? AND builtin_type IS NULL').run(id)
  return (result as any).changes > 0
}

export function toggleRoutine(id: string, enabled: boolean): void {
  getDb().prepare('UPDATE routines SET enabled = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, new Date().toISOString(), id)
}

export function getRoutineRuns(routineId: string, limit = 20): any[] {
  return getDb().prepare('SELECT * FROM routine_runs WHERE routine_id = ? ORDER BY started_at DESC LIMIT ?').all(routineId, limit)
}

// ── Scheduling ──────────────────────────────────────────────────────

function msUntilNext(hour: number, minute: number): number {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setTime(next.getTime() + MS_PER_DAY)
  return next.getTime() - now.getTime()
}

function msUntilNextScheduled(r: RoutineConfig): number {
  if (r.schedule_type === 'daily') {
    return msUntilNext(r.schedule_hour, r.schedule_minute)
  }
  if (r.schedule_type === 'weekly' && r.schedule_day != null) {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), r.schedule_hour, r.schedule_minute)
    while (next.getDay() !== r.schedule_day || next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1)
    }
    return next.getTime() - now.getTime()
  }
  if (r.schedule_type === 'monthly' && r.schedule_day != null) {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), r.schedule_day, r.schedule_hour, r.schedule_minute)
    if (next.getTime() <= now.getTime()) next.setMonth(next.getMonth() + 1)
    return next.getTime() - now.getTime()
  }
  return msUntilNext(r.schedule_hour, r.schedule_minute) // Fallback
}

function scheduleRoutine(routine: RoutineConfig): void {
  if (activeTimers.has(routine.id)) {
    clearTimeout(activeTimers.get(routine.id)!)
  }
  const ms = msUntilNextScheduled(routine)
  const timer = setTimeout(async () => {
    try {
      const result = await executeRoutine(routine)
      // Send to renderer
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.send('routines:result', result)
    } catch (err) {
      console.error(`[OSChief:routines] Execution failed for ${routine.name}:`, err)
    }
    // Reschedule
    const fresh = getRoutine(routine.id)
    if (fresh && fresh.enabled) scheduleRoutine(fresh)
  }, ms)
  activeTimers.set(routine.id, timer)
  const nextDate = new Date(Date.now() + ms)
  console.log(`[routines] Scheduled "${routine.name}" → ${nextDate.toLocaleString()}`)
}

export function scheduleAllRoutines(): void {
  seedBuiltinRoutines()
  const routines = getAllRoutines().filter(r => r.enabled)
  for (const r of routines) {
    scheduleRoutine(r)
  }
  console.log(`[routines] Scheduled ${routines.length} routines`)
}

export function rescheduleAllRoutines(): void {
  stopAllRoutines()
  const routines = getAllRoutines().filter(r => r.enabled)
  for (const r of routines) {
    scheduleRoutine(r)
  }
}

/** Returns the ISO timestamp of when a routine will next fire. */
export function getNextRunTime(routine: RoutineConfig): string {
  const ms = msUntilNextScheduled(routine)
  return new Date(Date.now() + ms).toISOString()
}

export function stopAllRoutines(): void {
  for (const timer of activeTimers.values()) {
    clearTimeout(timer)
  }
  activeTimers.clear()
}

// ── Execution ───────────────────────────────────────────────────────

export async function executeRoutine(routine: RoutineConfig): Promise<any> {
  // Dedup guard: skip if this routine ran successfully in the last 60 seconds
  // Prevents double-fire from schedule timer + catch-up racing on wake
  const recentRun = getDb().prepare(`
    SELECT COUNT(*) as cnt FROM routine_runs
    WHERE routine_id = ? AND status = 'success' AND started_at >= datetime('now', '-60 seconds')
  `).get(routine.id) as any
  if (recentRun?.cnt > 0) {
    console.log(`[routines] "${routine.name}" skipped (ran within last 60s — dedup)`)
    return { ok: true, skipped: true, reason: 'dedup' }
  }

  // Weekday guard: skip execution on Saturday (6) and Sunday (0)
  if (routine.weekdays_only) {
    const day = new Date().getDay()
    if (day === 0 || day === 6) {
      console.log(`[routines] "${routine.name}" skipped (weekdays only, today is ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]})`)
      return { ok: true, skipped: true, reason: 'weekend' }
    }
  }

  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const startMs = Date.now()

  try {
    // Assemble data
    const contextData = await assembleRoutineData(routine)

    // Get the configured LLM model (uses the same model the user selected in Settings)
    const model = resolveSelectedAIModel() || 'openai:gpt-4o-mini'

    // Call LLM
    const systemPrompt = `You are OSChief, an on-device chief of staff. ${routine.prompt}`
    const response = await routeLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextData },
      ],
      model
    )

    const durationMs = Date.now() - startMs

    // Store run
    getDb().prepare(`
      INSERT INTO routine_runs (id, routine_id, output, context_snapshot, status, started_at, completed_at, duration_ms)
      VALUES (?, ?, ?, ?, 'success', ?, ?, ?)
    `).run(runId, routine.id, response, contextData, startedAt, new Date().toISOString(), durationMs)

    // Deliver notification
    if (routine.delivery === 'notification' || routine.delivery === 'both') {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: routine.name,
          body: response.slice(0, 200),
          silent: false,
        })
        notif.on('click', () => {
          const win = BrowserWindow.getAllWindows()[0]
          if (win) { win.show(); win.focus() }
        })
        notif.show()
      }
    }

    console.log(`[routines] "${routine.name}" completed in ${durationMs}ms`)
    return { ok: true, id: runId, routineId: routine.id, output: response, durationMs }
  } catch (err: any) {
    const durationMs = Date.now() - startMs
    getDb().prepare(`
      INSERT INTO routine_runs (id, routine_id, output, status, error_message, started_at, completed_at, duration_ms)
      VALUES (?, ?, '', 'error', ?, ?, ?, ?)
    `).run(runId, routine.id, err.message || 'Unknown error', startedAt, new Date().toISOString(), durationMs)

    console.error(`[routines] "${routine.name}" failed:`, err)
    return { ok: false, id: runId, routineId: routine.id, error: err.message, durationMs }
  }
}

// ── Seed Built-ins ──────────────────────────────────────────────────

function seedBuiltinRoutines(): void {
  const db = getDb()
  const existing = db.prepare('SELECT COUNT(*) as cnt FROM routines WHERE builtin_type IS NOT NULL').get() as any
  if (existing?.cnt > 0) return // Already seeded

  const builtins = [
    {
      id: 'builtin-morning-briefing',
      name: 'Morning Briefing',
      prompt: 'Prepare me for my day. Given today\'s meetings, open commitments (especially at-risk ones), stale decisions, and active projects, write a concise 3-5 sentence briefing. Be specific — reference real names, dates, and commitments. If nothing is notable, say so briefly.',
      schedule_type: 'daily',
      schedule_hour: 8,
      schedule_minute: 30,
      delivery: 'both',
      builtin_type: 'morning_briefing',
    },
    {
      id: 'builtin-end-of-day',
      name: 'End of Day',
      prompt: 'Summarize my day. Include: commitments created today, decisions made, coaching highlights if any, and preview tomorrow\'s meetings. Keep it under 5 sentences. Be specific.',
      schedule_type: 'daily',
      schedule_hour: 17,
      schedule_minute: 30,
      delivery: 'both',
      builtin_type: 'end_of_day',
      weekdays_only: 1,
    },
    {
      id: 'builtin-weekly-recap',
      name: 'Weekly Recap',
      prompt: 'Summarize my week. Include: meeting count, new decisions, commitments made/completed/overdue, most-seen people, and active projects. Keep it under 8 sentences. Use specific numbers.',
      schedule_type: 'weekly',
      schedule_hour: 17,
      schedule_minute: 0,
      schedule_day: 5,
      delivery: 'both',
      builtin_type: 'weekly_recap',
    },
    {
      id: 'builtin-overdue-commitments',
      name: 'Overdue Commitments',
      prompt: 'List all overdue commitments with who owns them, how many days overdue, and the original meeting context. Be direct — no fluff. If nothing is overdue, say "All clear — no overdue commitments."',
      schedule_type: 'daily',
      schedule_hour: 9,
      schedule_minute: 0,
      delivery: 'notification',
      builtin_type: 'overdue_commitments',
    },
  ]

  for (const r of builtins) {
    createRoutine(r as any)
  }
  console.log('[routines] Seeded 4 built-in routines')
}

// ── Morning Brief Catch-up ─────────────────────────────────────────
//
// If the app wasn't running at 8:30am, catch up on launch.
// Only fires if: (1) no successful run today, (2) current time < 10am.

export async function catchUpMorningBrief(): Promise<void> {
  const db = getDb()
  const now = new Date()
  const hour = now.getHours()

  // Only catch up if before 10am
  if (hour >= 10) return

  const routine = db.prepare(
    "SELECT * FROM routines WHERE builtin_type = 'morning_briefing' AND enabled = 1"
  ).get() as RoutineConfig | undefined
  if (!routine) return

  // Check for a successful run today
  const todayRun = db.prepare(`
    SELECT COUNT(*) as cnt FROM routine_runs
    WHERE routine_id = ? AND status = 'success' AND started_at >= date('now')
  `).get(routine.id) as any
  if (todayRun?.cnt > 0) return

  console.log('[routines] Morning brief catch-up: firing now (app launched before 10am, no run today)')
  await executeRoutine(routine)
}

/**
 * End-of-day catch-up: fire if app launches after 5:30pm and before midnight.
 */
export async function catchUpEndOfDay(): Promise<void> {
  const db = getDb()
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()

  // Only catch up if after 5:30pm and before midnight
  if (hour < 17 || (hour === 17 && minute < 30)) return

  const routine = db.prepare(
    "SELECT * FROM routines WHERE builtin_type = 'end_of_day' AND enabled = 1"
  ).get() as RoutineConfig | undefined
  if (!routine) return

  // Weekday check
  const day = now.getDay()
  if (routine.weekdays_only && (day === 0 || day === 6)) return

  const todayRun = db.prepare(`
    SELECT COUNT(*) as cnt FROM routine_runs
    WHERE routine_id = ? AND status = 'success' AND started_at >= date('now')
  `).get(routine.id) as any
  if (todayRun?.cnt > 0) return

  console.log('[routines] End-of-day catch-up: firing now')
  await executeRoutine(routine)
}

/**
 * Generic catch-up: for each enabled routine, check if a run was missed
 * within a grace window. Covers weekly recap and overdue commitments
 * (morning brief and end-of-day have their own catch-up above).
 */
export async function catchUpMissedRoutines(): Promise<void> {
  const db = getDb()
  const routines = getAllRoutines().filter(r => r.enabled)

  for (const r of routines) {
    // Morning brief and end-of-day have dedicated catch-up
    if (r.builtin_type === 'morning_briefing' || r.builtin_type === 'end_of_day') continue

    // For daily routines: check if there was a successful run today
    if (r.schedule_type === 'daily') {
      const todayRun = db.prepare(`
        SELECT COUNT(*) as cnt FROM routine_runs
        WHERE routine_id = ? AND status = 'success' AND started_at >= date('now')
      `).get(r.id) as any
      if (todayRun?.cnt > 0) continue

      // Only catch up if the scheduled time has passed (within 2-hour grace)
      const now = new Date()
      const scheduledToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), r.schedule_hour, r.schedule_minute)
      const graceEnd = new Date(scheduledToday.getTime() + 2 * 60 * 60 * 1000)
      if (now >= scheduledToday && now <= graceEnd) {
        console.log(`[routines] Catch-up: firing "${r.name}" (daily, missed today)`)
        await executeRoutine(r)
      }
    }

    // For weekly routines: check if there was a run this week
    if (r.schedule_type === 'weekly') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const weekRun = db.prepare(`
        SELECT COUNT(*) as cnt FROM routine_runs
        WHERE routine_id = ? AND status = 'success' AND started_at >= ?
      `).get(r.id, sevenDaysAgo) as any
      if (weekRun?.cnt > 0) continue

      // If today is the scheduled day and the time has passed (within 4-hour grace)
      const now = new Date()
      if (now.getDay() === r.schedule_day) {
        const scheduledToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), r.schedule_hour, r.schedule_minute)
        const graceEnd = new Date(scheduledToday.getTime() + 4 * 60 * 60 * 1000)
        if (now >= scheduledToday && now <= graceEnd) {
          console.log(`[routines] Catch-up: firing "${r.name}" (weekly, missed this week)`)
          await executeRoutine(r)
        }
      }
    }
  }
}
