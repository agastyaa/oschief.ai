import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#FAF8F5',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // When packaged, open DevTools so we can see load/console errors (e.g. blank screen)
    if (app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Syag] did-fail-load', errorCode, errorDescription, validatedURL)
  })

  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin') {
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
