import { Notification } from 'electron'
import { getAllNotes } from './storage/database'
import { getSetting, setSetting } from './storage/database'
import { getMainWindow } from './windows'

const SENT_KEY_DAY_BEFORE = 'action-reminders-sent-day-before'
const SENT_KEY_DAY_OF = 'action-reminders-sent-day-of'
const SETTING_KEY = 'action-reminder-notification'

const HOUR_DAY_BEFORE = 14
const MINUTE_DAY_BEFORE = 0
const HOUR_DAY_OF = 9
const MINUTE_DAY_OF = 0
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Milliseconds from now until the next occurrence of the given local time (today or tomorrow). */
function msUntilNext(hour: number, minute: number): number {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setTime(next.getTime() + MS_PER_DAY)
  return next.getTime() - now.getTime()
}

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getTodayLocal(): string {
  return toYYYYMMDD(new Date())
}

function getTomorrowLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toYYYYMMDD(d)
}

function parseDueDate(dueDate: string): string | null {
  if (!dueDate || typeof dueDate !== 'string') return null
  const trimmed = dueDate.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return toYYYYMMDD(d)
}

function showActionReminderNotification(
  text: string,
  noteTitle: string,
  noteId: string,
  title: string
): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title,
    body: `${text}${noteTitle ? ` — ${noteTitle}` : ''}`,
    silent: false,
  })
  notification.on('click', () => {
    const win = getMainWindow()
    if (win) {
      win.show()
      win.focus()
      win.webContents.send('action-reminder:open-note', { noteId })
    }
  })
  notification.show()
}

function runForDueDate(
  targetDueDate: string,
  sentKey: string,
  notificationTitle: string
): void {
  const notes = getAllNotes()
  const sentRaw = getSetting(sentKey)
  let sent: Record<string, string> = {}
  try {
    if (sentRaw) sent = JSON.parse(sentRaw)
  } catch {
    sent = {}
  }

  const toSend: { noteId: string; index: number; text: string; title: string; dueDate: string }[] = []

  for (const note of notes) {
    const steps = note?.summary?.nextSteps ?? note?.summary?.actionItems ?? []
    const noteTitle = note?.title ?? ''
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]
      if (s.done || !s.text) continue
      const dueStr = parseDueDate(s.dueDate ?? '')
      if (!dueStr || dueStr !== targetDueDate) continue
      const key = `${note.id}-${i}`
      if (sent[key] === dueStr) continue
      toSend.push({ noteId: note.id, index: i, text: s.text, title: noteTitle, dueDate: dueStr })
      sent[key] = dueStr
    }
  }

  for (const item of toSend) {
    showActionReminderNotification(item.text, item.title, item.noteId, notificationTitle)
  }

  const keysToRemove: string[] = []
  for (const [key, dueStr] of Object.entries(sent)) {
    if (dueStr < targetDueDate) keysToRemove.push(key)
  }
  keysToRemove.forEach(k => delete sent[k])

  if (Object.keys(sent).length > 0) {
    setSetting(sentKey, JSON.stringify(sent))
  }
}

/** Run at 2pm: remind for items due tomorrow. */
export function runDayBeforeReminders(): void {
  if (getSetting(SETTING_KEY) === 'false') return
  const tomorrow = getTomorrowLocal()
  runForDueDate(tomorrow, SENT_KEY_DAY_BEFORE, 'Action item due tomorrow')
}

/** Run at 9am: remind for items due today. */
export function runMorningOfReminders(): void {
  if (getSetting(SETTING_KEY) === 'false') return
  const today = getTodayLocal()
  runForDueDate(today, SENT_KEY_DAY_OF, 'Action item due today')
}

/** Schedule the next 2pm run (day-before reminders), then reschedule for the following day. */
function scheduleDayBefore(): void {
  const ms = msUntilNext(HOUR_DAY_BEFORE, MINUTE_DAY_BEFORE)
  setTimeout(() => {
    runDayBeforeReminders()
    scheduleDayBefore()
  }, ms)
}

/** Schedule the next 9am run (morning-of reminders), then reschedule for the following day. */
function scheduleMorningOf(): void {
  const ms = msUntilNext(HOUR_DAY_OF, MINUTE_DAY_OF)
  setTimeout(() => {
    runMorningOfReminders()
    scheduleMorningOf()
  }, ms)
}

/** Call once on app ready: sets two timers that fire at 2pm and 9am and reschedule daily. */
export function scheduleActionItemReminders(): void {
  scheduleDayBefore()
  scheduleMorningOf()
}
