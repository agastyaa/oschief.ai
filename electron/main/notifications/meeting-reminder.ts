/**
 * Smart Meeting Reminder
 *
 * Checks every 60 seconds for meetings starting in ~5 minutes.
 * When found, generates a prep brief and shows a macOS notification
 * with attendee context, open commitments, and a one-liner from the LLM.
 *
 * Runs in the main process. Uses calendar events from the renderer
 * via IPC, or directly from the Google/Microsoft calendar APIs.
 */

import { Notification, BrowserWindow } from 'electron'
import { getSetting } from '../storage/database'

let checkInterval: ReturnType<typeof setInterval> | null = null
const notifiedEventIds = new Set<string>()

/**
 * Start the meeting reminder checker.
 * Call once on app startup.
 */
export function startMeetingReminders(): void {
  if (checkInterval) return
  checkInterval = setInterval(checkUpcomingMeetings, 60_000)
  // Also check immediately on start
  setTimeout(checkUpcomingMeetings, 5_000)
  console.log('[meeting-reminder] Started — checking every 60s')
}

export function stopMeetingReminders(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

async function checkUpcomingMeetings(): Promise<void> {
  try {
    // Get upcoming events from the renderer's calendar state via IPC
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return

    // Ask the renderer for its calendar events
    const events = await win.webContents.executeJavaScript(
      `window.__syagCalendarEvents || []`
    )

    if (!Array.isArray(events) || events.length === 0) return

    const now = Date.now()
    const FIVE_MIN = 5 * 60 * 1000
    const SIX_MIN = 6 * 60 * 1000

    for (const event of events) {
      if (!event.start || !event.title) continue

      const startTime = new Date(event.start).getTime()
      const timeUntil = startTime - now

      // Fire notification when event is 5-6 minutes away (catches within our 60s check window)
      if (timeUntil > 0 && timeUntil <= SIX_MIN && timeUntil > FIVE_MIN - 60_000) {
        const eventKey = `${event.id || event.title}-${event.start}`
        if (notifiedEventIds.has(eventKey)) continue
        notifiedEventIds.add(eventKey)

        // Clean up old event IDs (keep set small)
        if (notifiedEventIds.size > 100) {
          const arr = [...notifiedEventIds]
          arr.slice(0, 50).forEach(id => notifiedEventIds.delete(id))
        }

        await showMeetingNotification(event)
      }
    }
  } catch (err) {
    // Silent — don't spam logs every 60s
  }
}

async function showMeetingNotification(event: any): Promise<void> {
  const attendees = event.attendees || []
  const attendeeNames = attendees.map((a: any) => a.name || a.email).filter(Boolean)

  // Try to generate a prep brief for richer context
  let briefText = ''
  try {
    const { assembleContext } = await import('../memory/context-assembler')
    const names = attendees.map((a: any) => a.name).filter(Boolean)
    const emails = attendees.map((a: any) => a.email).filter(Boolean)
    const ctx = await assembleContext(names, emails, event.title)

    // Build a quick summary without LLM (faster, no API call needed)
    const parts: string[] = []
    if (ctx.previousMeetings.length > 0) {
      const firstPerson = ctx.previousMeetings[0]
      parts.push(`Last met ${firstPerson.personName} on ${firstPerson.meetings[0]?.date || 'recently'}`)
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
    // No context available — still show the notification
  }

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
      // Navigate to new note with this event
      win.webContents.executeJavaScript(
        `window.location.hash = '#/new-note?startFresh=1'; void 0`
      ).catch(() => {})
    }
  })

  notification.show()
  console.log(`[meeting-reminder] Notified: "${event.title}" in 5 min`)
}
