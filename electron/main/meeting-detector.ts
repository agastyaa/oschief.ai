import { exec } from 'child_process'
import { BrowserWindow } from 'electron'
import { getSetting } from './storage/database'
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
let lastPollHadMeetingApp = false
let lastProcessHash = ''
let isChecking = false
export type CalendarEventForMain = { id: string; title: string; start: number; end: number; joinLink?: string; attendees?: Array<{ email: string; name?: string }> }
let calendarEvents: CalendarEventForMain[] = []
let startingSoonInterval: ReturnType<typeof setInterval> | null = null
const notifiedStartingSoonIds = new Set<string>()
const STARTING_SOON_WINDOW_MS = 70 * 1000   // notify when 70s before start (~1 min, Granola-style)
const STARTING_SOON_END_MS = 50 * 1000     // until 50s before start

// Poll every 5s so joining a call triggers notification quickly
let currentPollMs = 5000

// Cooldown: skip detection for first 60s after app launch to avoid false positives (e.g. Zoom/Teams auto-start)
const LAUNCH_COOLDOWN_MS = 60 * 1000
let appLaunchTime = Date.now()

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
  appLaunchTime = Date.now()
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

    // Notify whenever meeting app transitions from absent to present (scheduled or ad-hoc). Calendar used only for title.
    const calEvent = findCurrentCalendarEvent()
    const inCooldown = Date.now() - appLaunchTime < LAUNCH_COOLDOWN_MS
    const autoDetectEnabled = getSetting('meeting-auto-detect') !== 'false'
    if (matchedApp && !lastPollHadMeetingApp && !inCooldown && autoDetectEnabled) {
      // Require mic/audio in use to reduce false positives — meeting app running doesn't mean you're in a call
      const skipMicCheck = getSetting('meeting-detection-require-mic') === 'false'
      if (!skipMicCheck) {
        const micActive = await checkMicActive()
        if (!micActive) {
          isChecking = false
          return
        }
      }

      activeMeetingApp = matchedApp
      meetingStartTime = Date.now()
      notifiedForCurrentMeeting = true

      const now = Date.now()
      // Use calendar event title when we're in a confident window (2 min before start to 5 min after end); else e.g. "Microsoft Teams Meeting"
      const useCalendarTitle = calEvent && now >= calEvent.start - 2 * 60 * 1000 && now <= calEvent.end + 5 * 60 * 1000
      const meetingTitle = useCalendarTitle && calEvent ? calEvent.title : `${matchedApp} Meeting`

      console.log(`[MeetingDetector] Meeting detected: ${meetingTitle}`)

      const detectionData = {
        app: matchedApp,
        title: meetingTitle,
        calendarEvent: calEvent,
        startTime: meetingStartTime,
      }

      // Always show notification — auto-record only controls whether recording starts automatically
      showMeetingDetectedNotification(meetingTitle, matchedApp)
      mainWindow?.webContents.send('meeting:detected', detectionData)
    } else if (!matchedApp && activeMeetingApp) {
      // Meeting ends only when app process disappears (user left the call / closed the app)
      console.log(`[MeetingDetector] Meeting ended: ${activeMeetingApp}`)
      mainWindow?.webContents.send('meeting:ended', { app: activeMeetingApp })
      updateTrayMeetingInfo(null)
      activeMeetingApp = null
      meetingStartTime = null
      notifiedForCurrentMeeting = false
      lastPollHadMeetingApp = false
    }

    lastPollHadMeetingApp = !!matchedApp
  } catch {
    // Silent
  } finally {
    isChecking = false
  }
}

async function checkMicActive(): Promise<boolean> {
  // Primary: check macOS microphone-in-use indicator (the orange dot)
  // When any app uses the mic, IOKit reports the audio engine as running
  const ioreg = await execAsync(
    'ioreg -c AppleHDAEngineInput -r -d 1 2>/dev/null | grep -c "IOAudioEngineState = 1"',
    2000
  )
  if (parseInt(ioreg.trim()) > 0) return true

  // Fallback: check if the known meeting app has an open audio device handle
  const lsof = await execAsync(
    'lsof -c zoom -c Teams -c "Google Meet" -c webex 2>/dev/null | grep -ci "audio\\|coreaudio"',
    2000
  )
  if (parseInt(lsof.trim()) > 0) return true

  // Last resort: generic audio device check
  const generic = await execAsync('lsof +D /dev/ 2>/dev/null | grep -ci audio', 1000)
  return parseInt(generic.trim()) > 0
}

export function getActiveMeeting(): { app: string; startTime: number } | null {
  if (!activeMeetingApp || !meetingStartTime) return null
  return { app: activeMeetingApp, startTime: meetingStartTime }
}
