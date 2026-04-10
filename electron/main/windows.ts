import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { getSetting } from './storage/database'

let mainWindow: BrowserWindow | null = null
let isQuittingForUpdate = false

export function setQuittingForUpdate() {
  isQuittingForUpdate = true
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'followsWindowActivity',
    backgroundColor: '#FFFFFF',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  // Hide from screen sharing / screen capture (macOS) — default OFF so users can screenshot notes
  const hideFromScreenShare = getSetting('hide-from-screen-share') === 'true'
  mainWindow.setContentProtection(hideFromScreenShare)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[OSChief] did-fail-load', errorCode, errorDescription, validatedURL)
  })

  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !isQuittingForUpdate) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // Use app:// so the renderer loads over a custom protocol instead of file://,
    // avoiding blank screen (file:// blocks ES module scripts in Chromium).
    mainWindow.loadURL('app://./index.html')
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function setContentProtection(enabled: boolean): void {
  mainWindow?.setContentProtection(enabled)
}
