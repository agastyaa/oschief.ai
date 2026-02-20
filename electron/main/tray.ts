import { Tray, Menu, BrowserWindow, nativeImage, app, Notification } from 'electron'
import { TRAY_ICON_BASE64, TRAY_ICON_RECORDING_BASE64 } from './tray-icons.generated'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

// Meeting state for tray
let currentMeeting: { title: string; startTime: number } | null = null
let isRecording = false
let titleUpdateInterval: ReturnType<typeof setInterval> | null = null

// Tray icons as PNG (Electron's nativeImage does not support SVG)
function createTrayIcon(): Electron.NativeImage {
  return nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
}

function createRecordingIcon(): Electron.NativeImage {
  return nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_RECORDING_BASE64}`)
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

  if (isRecording && currentMeeting) {
    // Show: "Meeting Name  00:42" next to the tray icon (like Apple Music shows song title)
    const elapsed = formatElapsed(currentMeeting.startTime)
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
      label: `  ${formatElapsed(currentMeeting.startTime)} elapsed`,
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
    template.push({
      label: 'End Meeting',
      click: () => {
        mainWindow?.webContents.send('tray:stop-recording')
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
    template.push({
      label: 'Stop Recording',
      click: () => {
        mainWindow?.webContents.send('tray:stop-recording')
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

export function updateTrayMeetingInfo(info: { title: string; startTime: number } | null): void {
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
    mainWindow?.webContents.send('tray:start-recording')
  })

  notification.show()
}
