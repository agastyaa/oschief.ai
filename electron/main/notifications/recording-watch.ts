/**
 * v2.11 — "still recording?" long-recording watchdog + recording-state
 * probe for other notifications.
 *
 * The renderer owns the authoritative recording state. It pings this
 * module via IPC whenever recording starts or stops. We cache the state
 * so main-process notifiers can ask "is the user recording right now?"
 * synchronously, and we schedule a gentle 1h nudge whenever a recording
 * begins:
 *
 *   "Still recording? (1h 02m)
 *    Tap to open the meeting — or Cmd+Shift+R to stop."
 *
 * Re-fires every hour after the first (1h, 2h, 3h…) up to a small cap
 * so runaway recordings can't flood the notification center. User can
 * disable via Settings → Meeting → "Long-recording reminders."
 */

import { Notification, BrowserWindow, ipcMain } from 'electron'

const ONE_HOUR_MS = 60 * 60 * 1000
const MAX_NUDGES = 5 // at 1h, 2h, 3h, 4h, 5h — then we stop nagging

let activeRecording: { noteId: string | null; startedAt: number } | null = null
let nudgeTimer: ReturnType<typeof setTimeout> | null = null
let nudgeCount = 0

export function startRecordingWatch(): void {
  ipcMain.on('recording:state', (_e, payload: { active: boolean; noteId?: string | null; startedAt?: number }) => {
    if (payload.active) {
      onRecordingStarted(payload.noteId ?? null, payload.startedAt ?? Date.now())
    } else {
      onRecordingStopped()
    }
  })
  console.log('[recording-watch] Started — listening for recording:state')
}

export function stopRecordingWatch(): void {
  clearNudge()
  activeRecording = null
  ipcMain.removeAllListeners('recording:state')
}

/** Synchronous probe: is the user currently recording? */
export function isRecordingActive(): boolean {
  return activeRecording !== null
}

/** Current duration in ms, or null when not recording. */
export function getRecordingDurationMs(): number | null {
  return activeRecording ? Date.now() - activeRecording.startedAt : null
}

function onRecordingStarted(noteId: string | null, startedAt: number): void {
  clearNudge()
  activeRecording = { noteId, startedAt }
  nudgeCount = 0
  scheduleNextNudge()
}

function onRecordingStopped(): void {
  clearNudge()
  activeRecording = null
  nudgeCount = 0
}

function scheduleNextNudge(): void {
  if (!activeRecording) return
  if (nudgeCount >= MAX_NUDGES) return
  // Next nudge fires at (startedAt + (nudgeCount+1) * 1h). If we're booting
  // mid-recording (restored state), the first nudge may be overdue — fire
  // shortly after.
  const targetMs = activeRecording.startedAt + (nudgeCount + 1) * ONE_HOUR_MS
  const delay = Math.max(5_000, targetMs - Date.now())
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null
    void fireLongRecordingNudge()
  }, delay)
}

function clearNudge(): void {
  if (nudgeTimer) {
    clearTimeout(nudgeTimer)
    nudgeTimer = null
  }
}

async function fireLongRecordingNudge(): Promise<void> {
  if (!activeRecording) return

  // Respect the setting (default on)
  try {
    const { getSetting } = await import('../storage/database')
    const raw = getSetting('long-recording-reminder')
    if (raw === 'false' || raw === '0') return
  } catch {
    // DB not ready — default to firing.
  }

  const elapsedMs = Date.now() - activeRecording.startedAt
  const hours = Math.floor(elapsedMs / ONE_HOUR_MS)
  const minutes = Math.floor((elapsedMs % ONE_HOUR_MS) / 60_000)
  const durationText = hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`

  const openRecording = () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    win.show()
    win.focus()
    const hash = activeRecording?.noteId
      ? `#/new-note?session=${encodeURIComponent(activeRecording.noteId)}`
      : '#/new-note'
    win.webContents.executeJavaScript(`window.location.hash = '${hash}'; void 0`).catch(() => {})
  }

  const stopRecording = () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    win.webContents.send('tray:stop-recording')
    win.show()
    win.focus()
  }

  const notification = new Notification({
    title: `Still recording? (${durationText})`,
    body: 'Tap to open the meeting, or stop if you forgot about it.',
    silent: true, // gentle — no sound at 1h+ mark
    urgency: 'low',
    actions: [
      { type: 'button', text: 'Open Meeting' },
      { type: 'button', text: 'Stop Recording' },
    ],
    closeButtonText: 'Keep Going',
    timeoutType: 'default',
  })

  notification.on('click', openRecording)
  notification.on('action', (_e, idx) => {
    // action index 0 = Open, 1 = Stop
    if (idx === 1) stopRecording()
    else openRecording()
  })

  notification.show()
  nudgeCount += 1
  console.log(`[recording-watch] Long-recording nudge #${nudgeCount} at ${durationText}`)

  // Schedule the next one (2h, 3h, ...) until we hit MAX_NUDGES.
  scheduleNextNudge()
}
