import { exec } from 'child_process'
import { BrowserWindow } from 'electron'
import { getSetting } from './storage/database'
import { showMeetingDetectedNotification, showMeetingStartingSoonNotification, updateTrayMeetingInfo } from './tray'

// Known meeting app process substrings -> [display name, alwaysRunning]
// alwaysRunning = true means the app keeps background processes even when not in a call,
// so we MUST verify audio/mic activity before triggering a notification.
// alwaysRunning was a flag used to require an audio-activity check before
// notifying — because Teams/Discord/Slack keep background processes even
// when not in a call. v2.11 drops that gate: on Apple Silicon the
// IOAudioEngine class we relied on doesn't exist in ioreg, so the gate
// can NEVER pass on modern Macs. That silenced every Teams notification.
// Without the gate, users who leave Teams open forever get one nudge the
// first time the detector sees Teams (reasonable — that's what they want).
const MEETING_PROCESS_PATTERNS: Array<[RegExp, string, boolean]> = [
  // Zoom: classic `zoom.us`, CptHost (call engine), new `Zoom Workplace`
  [/zoom\.us|CptHost|Zoom Workplace|^Zoom$/i, 'Zoom', false],
  // Teams: new MSTeams binary (2024+) + legacy "Microsoft Teams" + bundle id
  [/MSTeams|Microsoft Teams|com\.microsoft\.teams|^Teams$/i, 'Microsoft Teams', false],
  [/Google Meet|^Meet$/i, 'Google Meet', false],
  [/webex|webexmta/i, 'Webex', false],
  [/FaceTime/i, 'FaceTime', false],
  [/GoTo Meeting|GoToMeeting/i, 'GoTo Meeting', false],
  [/BlueJeans/i, 'BlueJeans', false],
  // Discord and Slack DO keep background processes — leave them gated
  // behind mic-check since notifications on every Discord/Slack launch
  // would be noisy.
  [/Discord/i, 'Discord', true],
  [/Slack Helper|Slack$/i, 'Slack Huddle', true],
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
// v2.11 alpha.8 — fire on the first signal that the user is actually
// IN a call. Two complementary triggers:
//
//   1. Fresh process transition. A meeting app that wasn't visible last
//      poll is now visible → user just launched it → probably about to
//      join a call.
//   2. Process tree growth. When an already-running meeting app spawns
//      extra helpers (audio encoder, video encoder, meeting-stage
//      renderer), the process count jumps by >=3. This catches the
//      "Teams was open, user joined a call" case without the audio gate
//      (broken on Apple Silicon) or Screen Recording + window-title
//      matching (v2.11.1 work).
//
// preExistingApps: apps visible during the launch cooldown. We only use
//   their process count as a baseline — we don't silently suppress them.
// notifiedApps: once per app per session. Cleared when the app quits.
const preExistingApps = new Set<string>()
const notifiedApps = new Set<string>()
const appProcessCount = new Map<string, number>()
const PROCESS_GROWTH_THRESHOLD = 3
export type CalendarEventForMain = { id: string; title: string; start: number; end: number; joinLink?: string; attendees?: Array<{ email: string; name?: string }> }
let calendarEvents: CalendarEventForMain[] = []
let startingSoonInterval: ReturnType<typeof setInterval> | null = null
const notifiedStartingSoonIds = new Set<string>()
const STARTING_SOON_WINDOW_MS = 70 * 1000   // notify when 70s before start (~1 min, Granola-style)
const STARTING_SOON_END_MS = 50 * 1000     // until 50s before start

// Poll every 5s so joining a call triggers notification quickly
let currentPollMs = 5000
// Consecutive polls with no audio activity for always-running apps before declaring meeting ended.
// At 5s poll interval, 18 polls = 90s of sustained silence before ending.
let consecutiveInactivePolls = 0
const INACTIVE_POLLS_TO_END = 18

// Cooldown: skip detection for first 20s after app launch so pre-existing
// Teams/Zoom processes don't trigger a "just joined" nudge the moment
// OSChief boots. Was 60s — too long; users who join a call right after
// opening the app would miss the notification.
const LAUNCH_COOLDOWN_MS = 20 * 1000
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
    // Skip full re-scan if process list unchanged AND we have a non-always-running active meeting.
    // For always-running apps, we MUST check audio activity every poll even if processes are identical.
    const activeIsAlwaysRunning = activeMeetingApp && MEETING_PROCESS_PATTERNS.some(
      ([, name, ar]) => name === activeMeetingApp && ar
    )
    if (hash === lastProcessHash && activeMeetingApp && !activeIsAlwaysRunning) {
      isChecking = false
      return
    }
    lastProcessHash = hash

    const processes = raw.split('\n')

    // Tier 2: match known meeting apps. Count total matching processes
    // per app so we can spot process-tree growth (the "call just started"
    // signal for apps that were already running).
    let matchedApp: string | null = null
    let matchedAlwaysRunning = false
    const countsThisPoll = new Map<string, number>()
    for (const line of processes) {
      const basename = line.trim().split('/').pop() || ''
      if (!basename) continue
      for (const [pattern, appName, alwaysRunning] of MEETING_PROCESS_PATTERNS) {
        if (pattern.test(basename)) {
          countsThisPoll.set(appName, (countsThisPoll.get(appName) || 0) + 1)
          if (!matchedApp) {
            matchedApp = appName
            matchedAlwaysRunning = alwaysRunning
          }
          break
        }
      }
    }

    // Growth detection: for each app we've seen, compare current count
    // against the stored baseline. If it jumped by >= threshold, the
    // user just started a call inside an already-open app.
    let growthApp: string | null = null
    for (const [appName, count] of countsThisPoll) {
      const prev = appProcessCount.get(appName) ?? 0
      if (prev > 0 && count - prev >= PROCESS_GROWTH_THRESHOLD) {
        growthApp = appName
        console.log(`[MeetingDetector] ${appName} process count jumped ${prev} → ${count} (call likely started)`)
        // Un-notify so the app can re-nudge on this new call
        notifiedApps.delete(appName)
        preExistingApps.delete(appName)
      }
      appProcessCount.set(appName, count)
    }
    // Clear counts for apps that disappeared entirely.
    for (const [appName] of [...appProcessCount]) {
      if (!countsThisPoll.has(appName)) appProcessCount.delete(appName)
    }

    // For always-running apps (Teams, Discord, Slack), require audio activity to distinguish
    // "app installed" from "in a call". Without this, detection fires on app launch and never again.
    if (matchedApp && matchedAlwaysRunning) {
      // For always-running apps, check if THAT SPECIFIC APP has audio handles open,
      // not generic system audio (music/YouTube would keep the meeting alive forever)
      const appAudioActive = await checkAppAudioActive(matchedApp)
      if (!appAudioActive) {
        // App is running but no audio activity this poll
        if (!activeMeetingApp) {
          // Not in a meeting yet — don't start one. Return WITHOUT touching
          // lastPollHadMeetingApp: that flag tracks "was a MEETING in flight
          // last poll?" not "was the app running?". Setting it here would
          // break the transition from idle-app → in-call (the gate at the
          // main detection block requires lastPollHadMeetingApp to be false
          // to fire the notification). This was the alpha.4 regression.
          console.log(`[MeetingDetector] ${matchedApp} running but mic check = false — waiting for audio (Discord/Slack only; Teams/Zoom/Meet bypass this gate)`)
          isChecking = false
          return
        }
        // In an active meeting — require sustained inactivity before ending
        consecutiveInactivePolls++
        if (consecutiveInactivePolls >= INACTIVE_POLLS_TO_END) {
          // 30s of no audio — meeting is actually over
          console.log(`[MeetingDetector] ${INACTIVE_POLLS_TO_END} consecutive inactive polls — ending meeting`)
          matchedApp = null
        } else {
          // Probably just muted — keep the meeting alive
          isChecking = false
          return
        }
      } else {
        // Audio active — reset the counter
        consecutiveInactivePolls = 0
      }
    }

    // Notify when either:
    //   a) a meeting app appeared fresh and wasn't here at launch, OR
    //   b) an already-running meeting app just spawned ≥3 new helpers
    //      (growth signal — call just started inside an open app).
    const calEvent = findCurrentCalendarEvent()
    const inCooldown = Date.now() - appLaunchTime < LAUNCH_COOLDOWN_MS
    const autoDetectEnabled = getSetting('meeting-auto-detect') !== 'false'
    if (matchedApp && inCooldown) {
      // During cooldown: record baseline. preExistingApps suppresses the
      // "fresh transition" path for this app, but growth detection still
      // re-arms it if the user joins a call later.
      preExistingApps.add(matchedApp)
    }
    if (matchedApp && preExistingApps.has(matchedApp) && !notifiedApps.has(matchedApp) && !growthApp) {
      console.log(`[MeetingDetector] ${matchedApp} was already running at launch — suppressing fresh-launch nudge (will still fire if process tree grows ≥${PROCESS_GROWTH_THRESHOLD})`)
      // Mark as notified so we don't spam this log every 5s, but keep
      // the process count tracker active so growth can still re-arm us.
      notifiedApps.add(matchedApp)
    }
    const shouldNotify = matchedApp && !notifiedApps.has(matchedApp) && !inCooldown && autoDetectEnabled && (!preExistingApps.has(matchedApp) || growthApp === matchedApp)
    if (shouldNotify) {
      // For non-always-running apps, optionally require mic check (user setting)
      const requireMic = getSetting('meeting-detection-require-mic') === 'true'
      if (requireMic && !matchedAlwaysRunning) {
        const micActive = await checkMicActive()
        if (!micActive) {
          isChecking = false
          return
        }
      }

      activeMeetingApp = matchedApp
      meetingStartTime = Date.now()
      consecutiveInactivePolls = 0
      notifiedForCurrentMeeting = true
      notifiedApps.add(matchedApp)

      const now = Date.now()
      // Use calendar event title when we're in a confident window (2 min before start to 5 min after end); else e.g. "Microsoft Teams Meeting"
      const useCalendarTitle = calEvent && now >= calEvent.start - 2 * 60 * 1000 && now <= calEvent.end + 5 * 60 * 1000
      const meetingTitle = useCalendarTitle && calEvent ? calEvent.title : `${matchedApp} Meeting`

      console.log(`[MeetingDetector] Meeting detected: ${meetingTitle} (app=${matchedApp}, calendarMatch=${useCalendarTitle})`)

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
      // Quitting the meeting app clears its entry — next launch is a
      // fresh session and will re-notify.
      notifiedApps.delete(activeMeetingApp)
      activeMeetingApp = null
      meetingStartTime = null
      notifiedForCurrentMeeting = false
      lastPollHadMeetingApp = false
      consecutiveInactivePolls = 0
    }

    lastPollHadMeetingApp = !!matchedApp
  } catch {
    // Silent
  } finally {
    isChecking = false
  }
}

async function checkMicActive(): Promise<boolean> {
  // The IOAudioEngine family covers every audio path on macOS, but the
  // CONCRETE class depends on the hardware:
  //   - AppleHDAEngineInput / Output  — Intel Macs, built-in audio
  //   - AppleUSBAudioEngine            — USB microphones
  //   - IOAudioEngine (generic parent) — Apple Silicon + Bluetooth/AirPods
  //     where the derived class varies with the driver (Virtual, DriverKit)
  // Only checking AppleHDAEngineInput missed Apple Silicon + Bluetooth
  // users entirely. Broaden to the parent class so every audio engine
  // subclass reports through it — works across Intel, Apple Silicon, USB,
  // Bluetooth, and external DACs.
  const engineState = await execAsync(
    'ioreg -rc IOAudioEngine 2>/dev/null | grep -c "IOAudioEngineState = 1"',
    2000,
  )
  const engineHits = parseInt(engineState.trim()) || 0
  if (engineHits > 0) {
    console.log(`[MeetingDetector] checkMicActive: IOAudioEngine state=1 hits=${engineHits}`)
    return true
  }

  // Legacy per-class checks — kept as a fallback in case IOAudioEngine
  // isn't exposed on some driver stack variants.
  try {
    const intel = await execAsync(
      'ioreg -c AppleHDAEngineInput -r -d 1 2>/dev/null | grep -c "IOAudioEngineState = 1"',
      2000,
    )
    if (parseInt(intel.trim()) > 0) {
      console.log('[MeetingDetector] checkMicActive: AppleHDAEngineInput state=1')
      return true
    }
  } catch { /* fall through */ }

  // Check audio OUTPUT too — user may join a call with mic off but still receive audio.
  try {
    const outputActive = await execAsync(
      'ioreg -c AppleHDAEngineOutput -r -d 1 2>/dev/null | grep -c "IOAudioEngineState = 1"',
      2000
    )
    if (parseInt(outputActive.trim()) > 0) {
      // Audio output is active — check if the meeting app itself has audio handles open
      const appAudio = await execAsync(
        'lsof -c zoom -c Teams -c MSTeams -c "Google Meet" -c webex -c Discord -c Slack 2>/dev/null | grep -ci "audio\\|coreaudio"',
        2000
      )
      if (parseInt(appAudio.trim()) > 0) {
        console.log('[MeetingDetector] checkMicActive: output+app-audio path matched')
        return true
      }
    }
  } catch { /* non-critical */ }

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

/**
 * Check if a specific meeting app has active audio handles.
 * Unlike checkMicActive() which checks generic system audio,
 * this only returns true if the NAMED APP is using audio.
 * Prevents false positives from background music/YouTube keeping
 * always-running apps (Teams, Discord, Slack) in "meeting" state.
 */
async function checkAppAudioActive(appName: string): Promise<boolean> {
  // For always-running apps (Teams, Discord, Slack), we need a signal that
  // the user is actually IN a call — not just that the app is idling in the
  // background. The historical approach was lsof on the app's process name
  // to see if it had audio device handles open. Three problems:
  //   1. App sandbox + TCC can block lsof from seeing other processes'
  //      open files on modern macOS, returning empty output silently.
  //   2. Teams' 2024 client (MSTeams) opens audio through XPC helpers,
  //      which don't show up under lsof -c Teams at all.
  //   3. lsof can take 2-3s on busy machines, blocking the poll.
  //
  // Simpler and more reliable: if the app's process is running AND the mic
  // is active at the OS level, the user is in a call. The mic check reads
  // the hardware-level audio engine state via ioreg, which isn't subject
  // to sandbox filtering. Music/YouTube don't use the mic so the "music
  // would keep the meeting alive forever" concern doesn't apply.
  return checkMicActive()
}

export function getActiveMeeting(): { app: string; startTime: number } | null {
  if (!activeMeetingApp || !meetingStartTime) return null
  return { app: activeMeetingApp, startTime: meetingStartTime }
}
