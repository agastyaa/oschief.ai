import { Tray, Menu, BrowserWindow, nativeImage, app, Notification } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { TRAY_ICON_BASE64, TRAY_ICON_RECORDING_BASE64 } from './tray-icons.generated'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

// Meeting state for tray (elapsedSeconds from renderer when provided, so tray matches in-app timer)
let currentMeeting: { title: string; startTime: number; elapsedSeconds?: number } | null = null
let isRecording = false
let titleUpdateInterval: ReturnType<typeof setInterval> | null = null

const TRAY_ICON_NAME = 'tray-icon-template-2x.png'

/** Path to tray icon file (44×44 template); used as-is when present, no regeneration. */
function getTrayIconPath(): string | null {
  const p = app.isPackaged
    ? join(app.getPath('resourcesPath'), TRAY_ICON_NAME)
    : join(app.getAppPath(), 'electron', 'resources', TRAY_ICON_NAME)
  return existsSync(p) ? p : null
}

// Tray icons: load from file when present (dark/light handled by your assets); else fall back to generated base64.
function createTrayIcon(): Electron.NativeImage {
  const path = getTrayIconPath()
  if (path) {
    const image = nativeImage.createFromPath(path)
    if (process.platform === 'darwin') image.setTemplateImage(true)
    return image
  }
  const image = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function createRecordingIcon(): Electron.NativeImage {
  const path = getTrayIconPath()
  if (path) {
    const image = nativeImage.createFromPath(path)
    if (process.platform === 'darwin') image.setTemplateImage(true)
    return image
  }
  const image = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_RECORDING_BASE64}`)
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function formatElapsed(startTime: number): string {
  const sec = Math.floor((Date.now() - startTime) / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatElapsedFromSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
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

  if (isRecording && currentMeeting) {
    // Use renderer-provided elapsed when present so tray matches in-app timer; else wall-clock from startTime
    const elapsed =
      currentMeeting.elapsedSeconds != null
        ? formatElapsedFromSeconds(currentMeeting.elapsedSeconds)
        : formatElapsed(currentMeeting.startTime)
    const shortTitle = currentMeeting.title.length > 20
      ? currentMeeting.title.slice(0, 18) + '…'
      : currentMeeting.title
    tray.setTitle(` ${shortTitle}  ${elapsed}`)
  } else if (isRecording) {
    tray.setTitle(' Recording')
  } else {
    tray.setTitle('')
  }
}

export function setupTray(win: BrowserWindow): void {
  mainWindow = win
  const icon = createTrayIcon()

  tray = new Tray(icon)
  tray.setToolTip('Syag')

  rebuildMenu()

  tray.on('click', () => {
    if (isRecording) {
      // If a meeting is running, clicking the tray icon navigates to that meeting
      mainWindow?.show()
      mainWindow?.focus()
      mainWindow?.webContents.send('tray:navigate-to-meeting')
    } else {
      if (mainWindow?.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow?.show()
      }
    }
  })
}

function rebuildMenu(): void {
  if (!tray || !mainWindow) return

  const template: Electron.MenuItemConstructorOptions[] = []

  if (isRecording && currentMeeting) {
    // Active meeting header
    template.push({
      label: `● ${currentMeeting.title}`,
      enabled: false,
    })
    template.push({
      label: `  ${currentMeeting.elapsedSeconds != null ? formatElapsedFromSeconds(currentMeeting.elapsedSeconds) : formatElapsed(currentMeeting.startTime)} elapsed`,
      enabled: false,
    })
    template.push({ type: 'separator' })
    template.push({
      label: 'Open Meeting',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('tray:navigate-to-meeting')
      }
    })
    template.push({
      label: 'Pause Recording',
      click: () => {
        mainWindow?.webContents.send('tray:pause-recording')
      }
    })
  } else if (isRecording) {
    template.push({
      label: '● Recording...',
      enabled: false,
    })
    template.push({ type: 'separator' })
    template.push({
      label: 'Open Recording',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('tray:navigate-to-meeting')
      }
    })
  } else {
    template.push({
      label: 'New Note',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.send('tray:start-recording')
      }
    })
  }

  template.push({ type: 'separator' })
  template.push({
    label: 'Show Syag',
    click: () => {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
  template.push({ type: 'separator' })
  template.push({
    label: 'Quit Syag',
    accelerator: 'CommandOrControl+Q',
    click: () => {
      mainWindow?.removeAllListeners('close')
      app.quit()
    }
  })

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

export function updateTrayRecordingState(recording: boolean): void {
  isRecording = recording
  if (!tray) return

  tray.setToolTip(recording ? 'Syag — Recording' : 'Syag')
  tray.setImage(recording ? createRecordingIcon() : createTrayIcon())

  if (recording) {
    startTitleUpdater()
  } else {
    stopTitleUpdater()
    tray.setTitle('')
    currentMeeting = null
  }

  rebuildMenu()
}

export function updateTrayMeetingInfo(info: { title: string; startTime: number; elapsedSeconds?: number } | null): void {
  currentMeeting = info
  if (info && isRecording) {
    startTitleUpdater()
  }
  rebuildMenu()
}

export function showMeetingDetectedNotification(meetingTitle: string, appName: string): void {
  if (!Notification.isSupported()) return

  const notification = new Notification({
    title: 'Meeting Detected',
    body: `${meetingTitle} on ${appName} — Click to start taking notes`,
    silent: false,
  })

  notification.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.send('tray:start-recording', { title: meetingTitle })
  })

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

export function showSummaryReadyNotification(noteTitle: string): void {
  if (!Notification.isSupported()) return

  const notification = new Notification({
    title: 'Summary ready',
    body: noteTitle ? `"${noteTitle}" — AI summary is ready` : 'Meeting summary is ready',
    silent: false,
  })

  notification.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  notification.show()
}
