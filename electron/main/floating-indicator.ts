/**
 * Small always-on-top frameless window that shows meeting title + elapsed time
 * when the main Syag window is not visible (minimized / hidden / unfocused).
 * Click anywhere on the pill to bring the main window back.
 */

import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { getMainWindow } from './windows'

let floatingWin: BrowserWindow | null = null
let meetingState: { title: string; startTime: number; isRecording: boolean } | null = null
let mainWindowVisible = true

function createFloatingWindow(): BrowserWindow {
  const { width: screenW } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: 280,
    height: 48,
    x: Math.round(screenW / 2 - 140),
    y: 8,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    focusable: false,
    roundedCorners: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setAlwaysOnTop(true, 'floating')

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/floating-indicator`)
  } else {
    win.loadURL('app://./index.html#/floating-indicator')
  }

  win.on('closed', () => {
    floatingWin = null
  })

  return win
}

function sendState(): void {
  if (!floatingWin || floatingWin.isDestroyed()) return
  floatingWin.webContents.send('floating:state', meetingState)
}

function shouldShow(): boolean {
  return !mainWindowVisible && meetingState != null
}

function syncVisibility(): void {
  if (shouldShow()) {
    if (!floatingWin || floatingWin.isDestroyed()) {
      floatingWin = createFloatingWindow()
      floatingWin.once('ready-to-show', () => {
        if (shouldShow()) {
          floatingWin?.showInactive()
          sendState()
        }
      })
    } else if (!floatingWin.isVisible()) {
      floatingWin.showInactive()
      sendState()
    }
  } else {
    if (floatingWin && !floatingWin.isDestroyed() && floatingWin.isVisible()) {
      floatingWin.hide()
    }
  }
}

export function setupFloatingIndicator(mainWin: BrowserWindow): void {
  const updateMainVisible = () => {
    const wasVisible = mainWindowVisible
    mainWindowVisible = mainWin.isVisible() && mainWin.isFocused() && !mainWin.isMinimized()
    if (wasVisible !== mainWindowVisible) syncVisibility()
  }

  mainWin.on('focus', updateMainVisible)
  mainWin.on('blur', updateMainVisible)
  mainWin.on('minimize', updateMainVisible)
  mainWin.on('restore', updateMainVisible)
  mainWin.on('show', updateMainVisible)
  mainWin.on('hide', updateMainVisible)

  ipcMain.on('floating:update-meeting', (_e, state: typeof meetingState) => {
    meetingState = state
    syncVisibility()
    sendState()
  })

  ipcMain.on('floating:focus-main', () => {
    const mw = getMainWindow()
    if (mw) {
      mw.show()
      mw.focus()
    }
  })
}

export function destroyFloatingIndicator(): void {
  if (floatingWin && !floatingWin.isDestroyed()) {
    floatingWin.close()
    floatingWin = null
  }
}
