import { exec } from 'child_process'
import { BrowserWindow } from 'electron'
import { showMeetingDetectedNotification, showMeetingStartingSoonNotification, updateTrayMeetingInfo } from './tray'

// Known meeting app process substrings -> display name (match ps -axo comm= output on macOS)
const MEETING_PROCESS_PATTERNS: Array<[RegExp, string]> = [
  [/zoom\.us|CptHost|^Zoom$/i, 'Zoom'],
  [/MSTeams|Microsoft Teams|com\.microsoft\.teams|^Teams$/i, 'Microsoft Teams'],
  [/Google Meet|^Meet$/i, 'Google Meet'],
  [/webex|webexmta/i, 'Webex'],
  [/FaceTime/i, 'FaceTime'],
  [/GoTo Meeting|GoToMeeting/i, 'GoTo Meeting'],
  [/BlueJeans/i, 'BlueJeans'],
  [/Discord/i, 'Discord'],
  [/Slack Helper|Slack$/i, 'Slack Huddle'],
]

// Audio device process names that indicate a meeting
const AUDIO_MEETING_PROCESSES = [
  'coreaudiod', 'com.apple.audio.SandboxHelper',
]

let pollInterval: ReturnType<typeof setInterval> | null = null
let mainWindow: BrowserWindow | null = null
let activeMeetingApp: string | null = null
let meetingStartTime: number | null = null
let notifiedForCurrentMeeting = false
let lastProcessHash = ''
let isChecking = false
export type CalendarEventForMain = { id: string; title: string; start: number; end: number; joinLink?: string }
let calendarEvents: CalendarEventForMain[] = []
let startingSoonInterval: ReturnType<typeof setInterval> | null = null
const notifiedStartingSoonIds = new Set<string>()
const STARTING_SOON_WINDOW_MS = 90 * 1000   // notify when 90s before start
const STARTING_SOON_END_MS = 45 * 1000     // until 45s before start

// Poll every 5s so joining a call triggers notification quickly (Granola/Notion-style)
let currentPollMs = 5000
const COOLDOWN_MS = 90000

function execAsync(cmd: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { encoding: 'utf-8', timeout: timeoutMs }, (err, stdout) => {
      resolve(err ? '' : (stdout || ''))
    })
  })
}

function simpleHash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return String(h)
}

export function setCalendarEvents(events: CalendarEventForMain[]): void {
  calendarEvents = events
}

/** Match if now is within 15 min before start or 5 min after end (Granola-style). */
function findCurrentCalendarEvent(): CalendarEventForMain | null {
  const now = Date.now()
  const beforeStartMs = 15 * 60 * 1000
  const afterEndMs = 5 * 60 * 1000
  for (const evt of calendarEvents) {
    if (now >= evt.start - beforeStartMs && now <= evt.end + afterEndMs) {
      return evt
    }
  }
  return null
}

function checkStartingSoon(): void {
  const now = Date.now()
  for (const evt of calendarEvents) {
    const diff = evt.start - now
    if (diff >= 0 && diff <= STARTING_SOON_WINDOW_MS && diff >= STARTING_SOON_END_MS) {
      if (notifiedStartingSoonIds.has(evt.id)) continue
      notifiedStartingSoonIds.add(evt.id)
      const body = evt.joinLink ? `Join: ${evt.joinLink}` : 'Click to open note'
      showMeetingStartingSoonNotification(evt.title, body, evt.id, evt.joinLink)
      // Renderer navigates only when user clicks the notification (tray sends meeting:starting-soon on click)
      // Forget after 2h so same event tomorrow can notify again
      setTimeout(() => notifiedStartingSoonIds.delete(evt.id), 2 * 60 * 60 * 1000)
      break
    }
  }
}

export function startMeetingDetection(win: BrowserWindow): void {
  mainWindow = win
  if (pollInterval) return
  // Run first check soon so we don't wait a full interval after app start
  setTimeout(() => checkForMeetings(), 2000)
  pollInterval = setInterval(checkForMeetings, currentPollMs)
  // "Starting soon" check every 30s
  if (!startingSoonInterval) {
    startingSoonInterval = setInterval(checkStartingSoon, 30000)
    checkStartingSoon()
  }
  console.log(`[MeetingDetector] Started (async, ${currentPollMs / 1000}s interval)`)
}

export function stopMeetingDetection(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  if (startingSoonInterval) {
    clearInterval(startingSoonInterval)
    startingSoonInterval = null
  }
}

export function setPollInterval(ms: number): void {
  currentPollMs = ms
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = setInterval(checkForMeetings, currentPollMs)
  }
}

async function checkForMeetings(): Promise<void> {
  if (isChecking) return
  isChecking = true

  try {
    // Tier 1: async process scan
    const raw = await execAsync('ps -axo comm= 2>/dev/null')
    if (!raw) { isChecking = false; return }

    const hash = simpleHash(raw)
    if (hash === lastProcessHash && activeMeetingApp) {
      isChecking = false
      return
    }
    lastProcessHash = hash

    const processes = raw.split('\n')

    // Tier 2: match known meeting apps
    let matchedApp: string | null = null
    for (const line of processes) {
      const basename = line.trim().split('/').pop() || ''
      if (!basename) continue
      for (const [pattern, appName] of MEETING_PROCESS_PATTERNS) {
        if (pattern.test(basename)) {
          matchedApp = appName
          break
        }
      }
      if (matchedApp) break
    }

    if (matchedApp && !notifiedForCurrentMeeting) {
      // Notify as soon as meeting app is in process list (no mic gate so joining triggers immediately)
      activeMeetingApp = matchedApp
      meetingStartTime = Date.now()
      notifiedForCurrentMeeting = true

      const calEvent = findCurrentCalendarEvent()
      const now = Date.now()
      // Only use calendar event title when we're in a confident window (2 min before start to 5 min after end).
      // Otherwise show generic "{App} Meeting" to avoid showing a wrong/unrelated event title (e.g. another meeting in the 15-min window).
      const useCalendarTitle = calEvent && now >= calEvent.start - 2 * 60 * 1000 && now <= calEvent.end + 5 * 60 * 1000
      const meetingTitle = useCalendarTitle && calEvent ? calEvent.title : `${matchedApp} Meeting`

      console.log(`[MeetingDetector] Meeting detected: ${meetingTitle}`)

      const detectionData = {
        app: matchedApp,
        title: meetingTitle,
        calendarEvent: calEvent,
        startTime: meetingStartTime,
      }

      showMeetingDetectedNotification(meetingTitle, matchedApp)
      mainWindow?.webContents.send('meeting:detected', detectionData)

      setTimeout(() => { notifiedForCurrentMeeting = false }, COOLDOWN_MS)
    } else if (!matchedApp && activeMeetingApp) {
      console.log(`[MeetingDetector] Meeting ended: ${activeMeetingApp}`)
      mainWindow?.webContents.send('meeting:ended', { app: activeMeetingApp })
      updateTrayMeetingInfo(null)
      activeMeetingApp = null
      meetingStartTime = null
      notifiedForCurrentMeeting = false
    }
  } catch {
    // Silent
  } finally {
    isChecking = false
  }
}

async function checkMicActive(): Promise<boolean> {
  // Check if any process is using the microphone via macOS IORegistry
  const output = await execAsync(
    'ioreg -c AppleHDAEngineInput -r -d 1 2>/dev/null | grep -c IOAudioEngineState',
    2000
  )
  if (parseInt(output.trim()) > 0) return true

  // Fallback: just check if audio device file descriptors are in use
  const lsof = await execAsync('lsof +D /dev/ 2>/dev/null | grep -c audio', 1000)
  return parseInt(lsof.trim()) > 0
}

export function getActiveMeeting(): { app: string; startTime: number } | null {
  if (!activeMeetingApp || !meetingStartTime) return null
  return { app: activeMeetingApp, startTime: meetingStartTime }
}
