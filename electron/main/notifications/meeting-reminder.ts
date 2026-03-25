/**
 * Smart Meeting Reminder — Event-Driven (no polling)
 *
 * Instead of polling every 60s, this schedules exact timers:
 * when calendar events are updated, it calculates the precise moment
 * each notification should fire (event start - 5 min) and sets a
 * setTimeout for that moment. When the calendar changes, it cancels
 * stale timers and reschedules.
 *
 * Runs in the main process. Receives events via IPC from CalendarContext.
 */

import { Notification, BrowserWindow, ipcMain } from 'electron'

// ── State ───────────────────────────────────────────────────────────

const REMIND_BEFORE_MS = 5 * 60 * 1000 // 5 minutes before start
const scheduledTimers = new Map<string, ReturnType<typeof setTimeout>>()
const notifiedEventIds = new Set<string>()

// ── Public API ──────────────────────────────────────────────────────

/**
 * Start the meeting reminder system.
 * Registers an IPC handler that the renderer calls whenever
 * calendar events change. No polling — purely event-driven.
 */
export function startMeetingReminders(): void {
  // Renderer sends updated events whenever CalendarContext refreshes
  ipcMain.on('calendar:events-updated', (_e, events: any[]) => {
    scheduleReminders(events)
  })
  console.log('[meeting-reminder] Started — event-driven (no polling)')
}

export function stopMeetingReminders(): void {
  // Cancel all pending timers
  for (const timer of scheduledTimers.values()) {
    clearTimeout(timer)
  }
  scheduledTimers.clear()
  ipcMain.removeAllListeners('calendar:events-updated')
}

// ── Scheduling ──────────────────────────────────────────────────────

function scheduleReminders(events: any[]): void {
  if (!Array.isArray(events)) return

  const now = Date.now()
  const activeEventKeys = new Set<string>()

  for (const event of events) {
    if (!event.start || !event.title) continue

    const startTime = new Date(event.start).getTime()
    if (isNaN(startTime)) continue

    const eventKey = `${event.id || event.title}-${startTime}`
    activeEventKeys.add(eventKey)

    // Already notified for this event
    if (notifiedEventIds.has(eventKey)) continue

    // Already scheduled
    if (scheduledTimers.has(eventKey)) continue

    const fireAt = startTime - REMIND_BEFORE_MS
    const delay = fireAt - now

    // Skip events that are in the past or more than 24h away
    if (delay < -60_000) continue // Already past (with 1 min grace)
    if (delay > 24 * 60 * 60 * 1000) continue // Too far out

    if (delay <= 0) {
      // Should have fired already but we just learned about it — fire now
      fireReminder(event, eventKey)
    } else {
      // Schedule for the exact moment
      const timer = setTimeout(() => {
        scheduledTimers.delete(eventKey)
        fireReminder(event, eventKey)
      }, delay)
      scheduledTimers.set(eventKey, timer)
    }
  }

  // Cancel timers for events that were removed from the calendar
  for (const [key, timer] of scheduledTimers.entries()) {
    if (!activeEventKeys.has(key)) {
      clearTimeout(timer)
      scheduledTimers.delete(key)
    }
  }

  // Clean up old notified IDs (keep set from growing unbounded)
  if (notifiedEventIds.size > 200) {
    const arr = [...notifiedEventIds]
    arr.slice(0, 100).forEach(id => notifiedEventIds.delete(id))
  }
}

// ── Notification ────────────────────────────────────────────────────

async function fireReminder(event: any, eventKey: string): Promise<void> {
  notifiedEventIds.add(eventKey)

  const attendees = event.attendees || []

  // Assemble context for a richer notification (no LLM — instant)
  let briefText = ''
  try {
    const { assembleContext } = await import('../memory/context-assembler')
    const names = attendees.map((a: any) => a.name).filter(Boolean)
    const emails = attendees.map((a: any) => a.email).filter(Boolean)
    const ctx = await assembleContext(names, emails, event.title)

    const parts: string[] = []
    if (ctx.previousMeetings.length > 0) {
      const first = ctx.previousMeetings[0]
      if (first.meetings.length > 0) {
        parts.push(`Last met ${first.personName} on ${first.meetings[0].date}`)
      }
    }
    if (ctx.openCommitments.length > 0) {
      const overdue = ctx.openCommitments.filter(c => c.isOverdue)
      if (overdue.length > 0) {
        parts.push(`${overdue.length} overdue commitment${overdue.length > 1 ? 's' : ''}`)
      } else {
        parts.push(`${ctx.openCommitments.length} open commitment${ctx.openCommitments.length > 1 ? 's' : ''}`)
      }
    }
    if (ctx.projects.length > 0) {
      parts.push(`Project: ${ctx.projects[0].name}`)
    }
    briefText = parts.join(' · ')
  } catch {
    // No context — still show the notification
  }

  const attendeeNames = attendees.map((a: any) => a.name || a.email).filter(Boolean)
  const title = `${event.title} — in 5 minutes`
  const body = briefText
    ? briefText
    : attendeeNames.length > 0
      ? `With ${attendeeNames.slice(0, 3).join(', ')}${attendeeNames.length > 3 ? ` +${attendeeNames.length - 3}` : ''}`
      : 'Meeting starting soon'

  const notification = new Notification({
    title,
    body,
    silent: false,
    urgency: 'normal',
  })

  notification.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.show()
      win.focus()
      win.webContents.executeJavaScript(
        `window.location.hash = '#/new-note?startFresh=1'; void 0`
      ).catch(() => {})
    }
  })

  notification.show()
  console.log(`[meeting-reminder] Notified: "${event.title}" in 5 min (scheduled, not polled)`)
}
