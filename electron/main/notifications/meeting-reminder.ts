/**
 * Smart Meeting Reminder — "Before You Go In" Prep Brief Notifications
 *
 * Event-driven (no polling). Schedules exact timers for each calendar event:
 * fires 10 minutes before meeting start to allow time for LLM prep brief
 * generation, then shows macOS notification with contextual brief.
 *
 * FLOW:
 *   Calendar events updated → scheduleReminders()
 *     → setTimeout(startTime - 10min)
 *       → fireReminder()
 *         ├── generatePrepBrief() via LLM (15s timeout)
 *         │   → Rich notification: "You last met Sarah on Mar 15.
 *         │     You owe her the revised forecast. ACME launch decision is stale."
 *         └── [timeout/error] → assembleContext() data-only fallback
 *             → "Last met Sarah on Mar 15 · 2 overdue commitments · Project: ACME"
 *
 * Runs in the main process. Receives events via IPC from CalendarContext.
 */

import { Notification, BrowserWindow, ipcMain } from 'electron'

// ── State ───────────────────────────────────────────────────────────

const REMIND_BEFORE_MS = 10 * 60 * 1000 // 10 minutes before start (buffer for LLM prep brief generation)
// v2.11 — at-start nudge. Fires up to 1 minute after scheduled start so the
// user who's late joining still gets the prompt, but not so late that a long
// meeting already in progress re-notifies.
const START_GRACE_MS = 60 * 1000
const scheduledTimers = new Map<string, ReturnType<typeof setTimeout>>()
const startTimers = new Map<string, ReturnType<typeof setTimeout>>()
const notifiedEventIds = new Set<string>()
const startNotifiedEventIds = new Set<string>()

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
  for (const timer of scheduledTimers.values()) clearTimeout(timer)
  for (const timer of startTimers.values()) clearTimeout(timer)
  scheduledTimers.clear()
  startTimers.clear()
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

    // v2.11 — schedule the at-start "take notes?" nudge too. Separate timer
    // so the two notifications are independent (user may dismiss one and
    // still want the other).
    if (!startNotifiedEventIds.has(eventKey) && !startTimers.has(eventKey)) {
      const startDelay = startTime - now
      const eventEnd = event.end ? new Date(event.end).getTime() : startTime + 30 * 60 * 1000
      const alreadyOver = now > eventEnd
      const tooEarly = startDelay > 24 * 60 * 60 * 1000
      const tooLate = startDelay < -START_GRACE_MS
      if (!alreadyOver && !tooEarly && !tooLate) {
        if (startDelay <= 0) {
          void fireStartNudge(event, eventKey)
        } else {
          const timer = setTimeout(() => {
            startTimers.delete(eventKey)
            void fireStartNudge(event, eventKey)
          }, startDelay)
          startTimers.set(eventKey, timer)
        }
      }
    }
  }

  // Cancel timers for events that were removed from the calendar
  for (const [key, timer] of scheduledTimers.entries()) {
    if (!activeEventKeys.has(key)) {
      clearTimeout(timer)
      scheduledTimers.delete(key)
    }
  }
  for (const [key, timer] of startTimers.entries()) {
    if (!activeEventKeys.has(key)) {
      clearTimeout(timer)
      startTimers.delete(key)
    }
  }

  // Clean up old notified IDs (keep sets from growing unbounded)
  if (notifiedEventIds.size > 200) {
    const arr = [...notifiedEventIds]
    arr.slice(0, 100).forEach(id => notifiedEventIds.delete(id))
  }
  if (startNotifiedEventIds.size > 200) {
    const arr = [...startNotifiedEventIds]
    arr.slice(0, 100).forEach(id => startNotifiedEventIds.delete(id))
  }
}

// ── At-start "take notes?" nudge (v2.11) ────────────────────────────
//
// Fires at the scheduled start time of a calendar event, even when no
// meeting app is running (catches in-person meetings, phone calls, or
// apps too slow to open). Skipped when:
//   - user is already recording (would be noise)
//   - setting is off
//   - meeting-detector already fired its own notification for this app
//
// Click-through starts a fresh recording with the event title pre-filled.

let isRecordingNowProbe: (() => boolean) | null = null

/**
 * The main process doesn't own recording state directly — the renderer does.
 * Callers install a probe at app init so this module can ask "are we
 * recording?" before nudging. If no probe is installed, we assume not.
 */
export function setRecordingStateProbe(probe: () => boolean): void {
  isRecordingNowProbe = probe
}

async function fireStartNudge(event: any, eventKey: string): Promise<void> {
  startNotifiedEventIds.add(eventKey)

  // Respect the setting (default on)
  try {
    const { getSetting } = await import('../storage/database')
    const raw = getSetting('meeting-start-notify')
    if (raw === 'false' || raw === '0') return
  } catch {
    // DB not ready — default to firing; better a nudge than silence.
  }

  // If the user is already recording, don't interrupt.
  if (isRecordingNowProbe?.()) return

  const attendees = event.attendees || []
  const attendeeNames = attendees.map((a: any) => a.name || a.email).filter(Boolean)
  const body = attendeeNames.length > 0
    ? `With ${attendeeNames.slice(0, 3).join(', ')}${attendeeNames.length > 3 ? ` +${attendeeNames.length - 3}` : ''} · Click to record`
    : 'Click to start taking notes'

  const openRecording = () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    win.show()
    win.focus()
    const hash = `#/new-note?startFresh=1&eventTitle=${encodeURIComponent(event.title || '')}${event.id ? `&eventId=${encodeURIComponent(event.id)}` : ''}`
    win.webContents.executeJavaScript(`window.location.hash = '${hash}'; void 0`).catch(() => {})
  }

  const notification = new Notification({
    title: `${event.title} just started`,
    body,
    silent: false,
    urgency: 'normal',
    // macOS native action buttons (10.14+). Falls back to click handler on
    // other platforms.
    actions: [{ type: 'button', text: 'Start Recording' }],
    closeButtonText: 'Dismiss',
    timeoutType: 'default',
  })

  notification.on('click', openRecording)
  notification.on('action', (_e, _idx) => openRecording())

  notification.show()
  console.log(`[meeting-reminder] Start nudge: "${event.title}"`)
}

// ── Notification ────────────────────────────────────────────────────

async function fireReminder(event: any, eventKey: string): Promise<void> {
  notifiedEventIds.add(eventKey)

  const attendees = event.attendees || []
  const names = attendees.map((a: any) => a.name).filter(Boolean)
  const emails = attendees.map((a: any) => a.email).filter(Boolean)

  // ── Try LLM-powered prep brief (15s timeout) ────────────────────
  //
  //  generatePrepBrief() → routeLLM() → 3-5 line contextual brief
  //  Falls back to data-only context if LLM times out or fails.
  //
  let briefText = ''
  let prepBriefResult: any = null
  try {
    const { generatePrepBrief } = await import('../memory/prep-brief')
    const { resolveSelectedAIModel } = await import('../models/model-resolver')
    const model = resolveSelectedAIModel()

    if (model && (names.length > 0 || emails.length > 0)) {
      // Race the LLM call against a 15s timeout
      const briefPromise = generatePrepBrief(names, emails, event.title, model)
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000))
      prepBriefResult = await Promise.race([briefPromise, timeoutPromise])

      if (prepBriefResult?.summary) {
        // Truncate to ~4 lines for macOS notification body
        const lines = prepBriefResult.summary.split(/[.!?]\s+/).filter(Boolean)
        briefText = lines.slice(0, 3).join('. ') + '.'
        console.log('[meeting-reminder] Prep brief generated via LLM')
      }
    }
  } catch (err) {
    console.warn('[meeting-reminder] Prep brief LLM failed, falling back to context:', err)
  }

  // ── Fallback: data-only context (no LLM) ────────────────────────
  if (!briefText) {
    try {
      const { assembleContext } = await import('../memory/context-assembler')
      const ctx = await assembleContext(names, emails, event.title)

      const parts: string[] = []
      if (ctx.previousMeetings.length > 0) {
        const first = ctx.previousMeetings[0]
        if (first.meetings.length > 0) {
          parts.push(`Last met ${first.personName} on ${first.meetings[0].date}`)
        }
      }
      if (ctx.openCommitments.length > 0) {
        const overdue = ctx.openCommitments.filter((c: any) => c.isOverdue)
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
      // Navigate to the prep brief view if we have a brief, otherwise start a new note
      const hash = prepBriefResult
        ? `#/?prepEvent=${encodeURIComponent(event.title || '')}`
        : '#/new-note?startFresh=1'
      win.webContents.executeJavaScript(
        `window.location.hash = '${hash}'; void 0`
      ).catch(() => {})
    }
  })

  notification.show()
  console.log(`[meeting-reminder] Notified: "${event.title}" — ${prepBriefResult ? 'LLM brief' : 'context-only'} (10-min lead)`)
}
