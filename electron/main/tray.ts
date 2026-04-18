import { Tray, Menu, BrowserWindow, nativeImage, app, Notification } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { TRAY_ICON_BASE64, TRAY_ICON_RECORDING_BASE64 } from './tray-icons.generated'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

// Meeting state for tray
let currentMeeting: { title: string; startTime: number } | null = null
let isRecording = false
let recordingStartTime = 0
let titleUpdateInterval: ReturnType<typeof setInterval> | null = null

// Update state — set by auto-updater.ts when a new version is downloaded and
// ready to install. When non-null, the tray menu surfaces a "Restart to
// install vX.Y.Z" item at the top.
let pendingUpdateVersion: string | null = null

const TRAY_ICON_NAME = 'tray-icon-template-2x.png'

/** Path to tray icon file (44×44 template); used as-is when present. */
function getTrayIconPath(): string | null {
  try {
    // Packaged: icon is in extraResources at process.resourcesPath root
    // Dev: icon is in electron/resources/
    const candidates = [
      ...(process.resourcesPath ? [join(process.resourcesPath, TRAY_ICON_NAME)] : []),
      join(app.getAppPath(), 'electron', 'resources', TRAY_ICON_NAME),
      join(process.cwd(), 'electron', 'resources', TRAY_ICON_NAME),
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    return null
  } catch {
    return null
  }
}

// Tray icons: load from file when present; else fall back to generated base64.
function createTrayIcon(): Electron.NativeImage {
  const path = getTrayIconPath()
  let image: Electron.NativeImage
  if (path) {
    image = nativeImage.createFromPath(path)
  } else {
    image = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
  }
  if (process.platform === 'darwin') {
    image = image.resize({ width: 22, height: 22 })
    image.setTemplateImage(true) // Must be after resize: resize() returns a new image and does not preserve template
  }
  return image
}

function createRecordingIcon(): Electron.NativeImage {
  // Use the same template icon for recording state so it adapts to menu bar
  // theme (light/dark). Recording state is already indicated by the tray title
  // text ("Meeting Name  0:42") and the menu bar title updater.
  const path = getTrayIconPath()
  let image: Electron.NativeImage
  if (path) {
    image = nativeImage.createFromPath(path)
  } else {
    image = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
  }
  if (process.platform === 'darwin') {
    image = image.resize({ width: 22, height: 22 })
    image.setTemplateImage(true)
  }
  return image
}

function formatElapsed(startTime: number): string {
  const sec = Math.floor((Date.now() - startTime) / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function startTitleUpdater(): void {
  stopTitleUpdater()
  updateTrayTitle()
  titleUpdateInterval = setInterval(updateTrayTitle, 1000)
}

function stopTitleUpdater(): void {
  if (titleUpdateInterval) {
    clearInterval(titleUpdateInterval)
    titleUpdateInterval = null
  }
}

function updateTrayTitle(): void {
  if (!tray) return

  // Discreet mode: never show "Recording" or meeting title in menu bar text.
  // Other people on screen share can see the menu bar — only show a subtle
  // elapsed timer so the user knows recording is active without broadcasting it.
  if (isRecording) {
    const startTime = currentMeeting?.startTime || recordingStartTime
    if (startTime) {
      const elapsed = formatElapsed(startTime)
      tray.setTitle(` ${elapsed}`)
    } else {
      tray.setTitle('')
    }
  } else {
    tray.setTitle('')
  }
}

export function setupTray(win: BrowserWindow): void {
  mainWindow = win
  const icon = createTrayIcon()

  tray = new Tray(icon)
  tray.setToolTip('OSChief')

  rebuildMenu()

  tray.on('click', () => {
    if (isRecording) {
      // If a meeting is running, clicking the tray icon navigates to that meeting
      mainWindow?.show()
      mainWindow?.focus()
      mainWindow?.webContents.send('tray:navigate-to-meeting')
      return
    }
    if (mainWindow?.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow?.show()
    }
  })
}

function rebuildMenu(): void {
  if (!tray || !mainWindow) return

  const template: Electron.MenuItemConstructorOptions[] = []

  // Pending update banner — surfaces at the top so it's impossible to miss.
  // Disabled (with explanation) during an active recording so the user
  // doesn't accidentally kill their meeting.
  if (pendingUpdateVersion) {
    if (isRecording) {
      template.push({
        label: `⬆ Update ready — v${pendingUpdateVersion}`,
        enabled: false,
      })
      template.push({
        label: '  Will install after current recording ends',
        enabled: false,
      })
    } else {
      template.push({
        label: `⬆ Restart & install v${pendingUpdateVersion}`,
        click: async () => {
          try {
            const { setQuittingForUpdate } = await import('./windows')
            setQuittingForUpdate()
            const pkg = await import('electron-updater')
            const au = pkg.default?.autoUpdater ?? (pkg as any).autoUpdater
            au?.quitAndInstall(false, true)
          } catch (err) {
            console.error('[tray] quitAndInstall failed:', err)
          }
        },
      })
    }
    template.push({ type: 'separator' })
  }

  if (isRecording && currentMeeting) {
    // Active meeting header
    template.push({
      label: `● ${currentMeeting.title}`,
      enabled: false,
    })
    template.push({
      label: `  ${formatElapsed(currentMeeting.startTime)} elapsed`,
      enabled: false,
    })
    template.push({ type: 'separator' })
    template.push({
      label: 'End Meeting',
      accelerator: 'CommandOrControl+Shift+S',
      click: () => {
        mainWindow?.webContents.send('tray:stop-recording')
      }
    })
    template.push({
      label: 'Pause Recording',
      click: () => {
        mainWindow?.webContents.send('tray:pause-recording')
      }
    })
    template.push({
      label: 'Open Meeting',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('tray:navigate-to-meeting')
      }
    })
  } else if (isRecording) {
    // Recording without a resolved meeting title yet (tray quick-start or
    // pre-calendar-match). Show a live elapsed timer in the header so it
    // still reads as useful state, not just a spinner.
    const headerElapsed = recordingStartTime ? `  ${formatElapsed(recordingStartTime)} elapsed` : ''
    template.push({
      label: `● Recording${headerElapsed}`,
      enabled: false,
    })
    template.push({ type: 'separator' })
    template.push({
      label: 'End Meeting',
      accelerator: 'CommandOrControl+Shift+S',
      click: () => {
        mainWindow?.webContents.send('tray:stop-recording')
      }
    })
    template.push({
      label: 'Pause Recording',
      click: () => {
        mainWindow?.webContents.send('tray:pause-recording')
      }
    })
    template.push({
      label: 'Open Recording',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('tray:navigate-to-meeting')
      }
    })
  } else {
    // Quick-start from tray — don't steal focus, just begin recording in
    // the background. User can open the window later to see transcript.
    template.push({
      label: 'Start Meeting',
      accelerator: 'CommandOrControl+Shift+R',
      click: () => {
        mainWindow?.webContents.send('tray:start-recording')
      }
    })
    template.push({
      label: 'New Note (open window)',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('tray:start-recording')
      }
    })
  }

  template.push({ type: 'separator' })
  template.push({
    label: 'Go to app',
    click: () => {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
  template.push({
    label: 'Check for Updates',
    click: async () => {
      await checkForUpdatesFromTray()
    }
  })
  template.push({ type: 'separator' })
  template.push({
    label: 'Quit app',
    accelerator: 'CommandOrControl+Q',
    click: () => {
      mainWindow?.removeAllListeners('close')
      app.quit()
    }
  })

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

/** Call after toggling tray-calendar-agenda so context menu matches mode. */
export function rebuildTrayContextMenu(): void {
  rebuildMenu()
}

export function updateTrayRecordingState(recording: boolean): void {
  isRecording = recording
  // Keep auto-updater in sync so its post-download prompt can skip when a
  // recording is live. Lazy-import to avoid a circular module load at init.
  import('./auto-updater').then(({ setAutoUpdaterRecordingFlag }) => {
    setAutoUpdaterRecordingFlag(recording)
  }).catch(() => { /* auto-updater may not be wired in this build */ })
  if (!tray) return

  tray.setToolTip(recording ? 'OSChief — Recording' : 'OSChief')
  tray.setImage(recording ? createRecordingIcon() : createTrayIcon())

  if (recording) {
    if (!recordingStartTime) recordingStartTime = Date.now()
    startTitleUpdater()
  } else {
    stopTitleUpdater()
    tray.setTitle('')
    currentMeeting = null
    recordingStartTime = 0
  }

  rebuildMenu()
}

export function updateTrayMeetingInfo(info: { title: string; startTime: number } | null): void {
  currentMeeting = info
  if (info && isRecording) {
    startTitleUpdater()
  }
  rebuildMenu()
}

/**
 * Called by auto-updater when a new version has finished downloading and is
 * ready to install. Passing null clears the pending state (e.g., after the
 * user restarts successfully on the next launch).
 */
export function setPendingUpdate(version: string | null): void {
  pendingUpdateVersion = version
  rebuildMenu()
}

/**
 * Tray "Check for Updates" with visible feedback. Uses checkForUpdates()
 * (not checkForUpdatesAndNotify) so we can surface each state — checking,
 * up-to-date, update-available, error — as native notifications. The
 * existing auto-updater.ts handlers still fire for download progress and
 * the "restart to install" dialog.
 */
async function checkForUpdatesFromTray(): Promise<void> {
  // Immediate feedback — the click happened.
  if (Notification.isSupported()) {
    new Notification({
      title: 'OSChief',
      body: 'Checking for updates…',
      silent: true,
    }).show()
  }

  try {
    const pkg = await import('electron-updater')
    const autoUpdater = pkg.default?.autoUpdater ?? (pkg as any).autoUpdater
    if (!autoUpdater?.checkForUpdates) {
      if (Notification.isSupported()) {
        new Notification({
          title: 'Update check unavailable',
          body: 'Auto-updater not available in this build (local/dev build?).',
        }).show()
      }
      return
    }

    // Token fallback: GUI apps don't inherit shell env. Read GH_TOKEN from
    // common shell profiles so private-repo releases still resolve. Mirrors
    // auto-updater.ts:10-20.
    if (!autoUpdater.requestHeaders?.Authorization) {
      const { readFileSync } = await import('fs')
      const { join } = await import('path')
      const { homedir } = await import('os')
      const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || (() => {
        for (const f of ['.zshrc', '.zprofile', '.bashrc', '.bash_profile']) {
          try {
            const content = readFileSync(join(homedir(), f), 'utf-8')
            const m = content.match(/export\s+(?:GH_TOKEN|GITHUB_TOKEN)\s*=\s*["']?([^\s"'#]+)["']?/)
            if (m?.[1]) return m[1]
          } catch { /* next */ }
        }
        return null
      })()
      if (ghToken) {
        autoUpdater.requestHeaders = { ...autoUpdater.requestHeaders, Authorization: `token ${ghToken}` }
      }
    }

    const result = await autoUpdater.checkForUpdates()
    const info = result?.updateInfo
    const isAvailable =
      typeof result?.isUpdateAvailable === 'boolean'
        ? result.isUpdateAvailable
        : !!(info?.version && info.version !== app.getVersion())

    if (!Notification.isSupported()) return

    if (isAvailable && info?.version) {
      const notif = new Notification({
        title: `Update available — v${info.version}`,
        body: 'Downloading in the background. You\'ll be asked to restart when it\'s ready.',
      })
      notif.on('click', () => {
        mainWindow?.show()
        mainWindow?.focus()
      })
      notif.show()
    } else {
      new Notification({
        title: 'You\'re up to date',
        body: `Running OSChief v${app.getVersion()} — no updates available.`,
      }).show()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[tray] Update check failed:', message)
    if (Notification.isSupported()) {
      new Notification({
        title: 'Update check failed',
        body: message.slice(0, 200),
      }).show()
    }
  }
}

export function showMeetingDetectedNotification(meetingTitle: string, appName: string): void {
  if (!Notification.isSupported()) return

  // v2.11 — respect the "Notify me when meetings start" toggle. Setting
  // doubles as the kill switch for both calendar-triggered AND
  // app-detection-triggered "meeting started" notifications, so flipping
  // it off silences all of them consistently.
  try {
    const { getSetting } = require('./storage/database') as typeof import('./storage/database')
    const raw = getSetting('meeting-start-notify')
    if (raw === 'false' || raw === '0') return
  } catch { /* DB not ready — default to firing */ }

  // Dedup: if the calendar-start scheduler just pinged for the same
  // meeting (within 2 min), don't double-notify.
  try {
    const rem = require('./notifications/meeting-reminder') as typeof import('./notifications/meeting-reminder')
    if (rem.wasRecentlyNotified()) return
    rem.markNotified()
  } catch { /* missing module — skip dedup */ }

  const openAndStart = () => {
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send('tray:start-recording')
  }

  const notification = new Notification({
    title: `${meetingTitle} just started`,
    body: `On ${appName} — take notes?`,
    silent: false,
    urgency: 'normal',
    actions: [{ type: 'button', text: 'Start Recording' }],
    closeButtonText: 'Dismiss',
    timeoutType: 'default',
  })

  notification.on('click', openAndStart)
  notification.on('action', (_e, _idx) => openAndStart())

  notification.show()
}

export function showMeetingStartingSoonNotification(
  title: string,
  body: string,
  eventId?: string,
  joinLink?: string
): void {
  if (!Notification.isSupported()) return

  const notification = new Notification({
    title: 'Meeting starting soon',
    body: `${title} — ${body}`,
    silent: false,
  })

  notification.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send('meeting:starting-soon', {
      eventId,
      title,
      joinLink,
    })
  })

  notification.show()
}
