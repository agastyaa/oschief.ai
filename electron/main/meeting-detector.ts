import { exec } from 'child_process'
import { BrowserWindow } from 'electron'
import { showMeetingDetectedNotification, updateTrayMeetingInfo } from './tray'

// Known meeting app process substrings -> display name
const MEETING_PROCESS_PATTERNS: Array<[RegExp, string]> = [
  [/zoom\.us|CptHost/i, 'Zoom'],
  [/MSTeams|Microsoft Teams|com\.microsoft\.teams/i, 'Microsoft Teams'],
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
let calendarEvents: Array<{ title: string; start: number; end: number }> = []

let currentPollMs = 15000
const COOLDOWN_MS = 60000

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

export function setCalendarEvents(events: Array<{ title: string; start: number; end: number }>): void {
  calendarEvents = events
}

function findCurrentCalendarEvent(): { title: string } | null {
  const now = Date.now()
  const windowMs = 5 * 60 * 1000 // 5 min grace before/after
  for (const evt of calendarEvents) {
    if (now >= evt.start - windowMs && now <= evt.end + windowMs) {
      return { title: evt.title }
    }
  }
  return null
}

export function startMeetingDetection(win: BrowserWindow): void {
  mainWindow = win
  if (pollInterval) return
  pollInterval = setInterval(checkForMeetings, currentPollMs)
  console.log(`[MeetingDetector] Started (async, ${currentPollMs / 1000}s interval)`)
}

export function stopMeetingDetection(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
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
      // Tier 3: notify when meeting app is running; optionally require mic active to reduce false positives
      const audioActive = await checkMicActive()
      // Notify if mic is active OR always on first match (so joining a meeting reliably triggers notification)
      if (audioActive || !activeMeetingApp) {
        activeMeetingApp = matchedApp
        meetingStartTime = Date.now()
        notifiedForCurrentMeeting = true

        // Correlate with calendar
        const calEvent = findCurrentCalendarEvent()
        const meetingTitle = calEvent?.title || `${matchedApp} Meeting`

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
      }
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
