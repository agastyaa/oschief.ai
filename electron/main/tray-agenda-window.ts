import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { getMainWindow } from './windows'
import { getSetting } from './storage/database'

let agendaWindow: BrowserWindow | null = null

/** Serialized event for tray popover (ISO strings). */
export type TrayAgendaCachedEvent = {
  id: string
  title: string
  start: string
  end: string
  joinLink?: string
  hasNote?: boolean
  noteId?: string | null
  source?: 'synced' | 'local'
}

let agendaCache: TrayAgendaCachedEvent[] = []

export function setTrayAgendaCache(events: TrayAgendaCachedEvent[]): void {
  agendaCache = Array.isArray(events) ? events : []
  if (agendaWindow && !agendaWindow.isDestroyed()) {
    agendaWindow.webContents.send('tray-agenda:cache-updated')
  }
}

export function getTrayAgendaCache(): TrayAgendaCachedEvent[] {
  return agendaCache
}

function isAgendaEnabled(): boolean {
  return getSetting('tray-calendar-agenda') === 'true'
}

export function toggleTrayAgendaWindow(trayBounds: Electron.Rectangle): void {
  if (!isAgendaEnabled()) return

  if (agendaWindow && !agendaWindow.isDestroyed()) {
    if (agendaWindow.isVisible()) {
      agendaWindow.hide()
    } else {
      positionAgendaWindow(trayBounds)
      agendaWindow.show()
      agendaWindow.focus()
    }
    return
  }

  const win = new BrowserWindow({
    width: 340,
    height: 520,
    show: false,
    frame: false,
    transparent: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#FAF8F5',
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  agendaWindow = win

  win.on('blur', () => {
    // Close when clicking outside (macOS popover behavior)
    setTimeout(() => {
      if (agendaWindow && !agendaWindow.isDestroyed() && !agendaWindow.webContents.isDevToolsOpened()) {
        agendaWindow.hide()
      }
    }, 150)
  })

  win.on('closed', () => {
    agendaWindow = null
  })

  const hash = '#/tray-agenda'
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash}`)
  } else {
    win.loadURL(`app://./index.html${hash}`)
  }

  win.once('ready-to-show', () => {
    positionAgendaWindow(trayBounds)
    win.show()
  })
}

function positionAgendaWindow(trayBounds: Electron.Rectangle): void {
  if (!agendaWindow || agendaWindow.isDestroyed()) return
  const { width, height } = agendaWindow.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const wa = display.workArea

  let x = Math.round(trayBounds.x - width / 2 + trayBounds.width / 2)
  let y = process.platform === 'darwin' ? Math.round(trayBounds.y + trayBounds.height + 4) : Math.round(trayBounds.y - height - 4)

  if (x + width > wa.x + wa.width) x = wa.x + wa.width - width - 8
  if (x < wa.x) x = wa.x + 8
  if (y + height > wa.y + wa.height) y = wa.y + wa.height - height - 8
  if (y < wa.y) y = wa.y + 8

  agendaWindow.setPosition(x, y)
}

export function showMainWindowCalendar(): void {
  const main = getMainWindow()
  if (!main) return
  hideTrayAgendaWindow()
  main.show()
  main.focus()
  main.webContents.send('tray-agenda:navigate', { path: '/calendar' })
}

/** Bring main window to front (home); used by tray agenda “Go to app”. */
export function showMainWindowApp(): void {
  const main = getMainWindow()
  if (!main) return
  hideTrayAgendaWindow()
  main.show()
  main.focus()
  main.webContents.send('tray-agenda:navigate', { path: '/' })
}

export function startNewNoteFromTrayAgenda(): void {
  hideTrayAgendaWindow()
  const main = getMainWindow()
  if (!main) return
  main.show()
  main.focus()
  main.webContents.send('tray:start-recording')
}

export function quitFromTrayAgenda(): void {
  const main = getMainWindow()
  main?.removeAllListeners('close')
  app.quit()
}

export function showMainWindowSettings(): void {
  const main = getMainWindow()
  if (!main) return
  hideTrayAgendaWindow()
  main.show()
  main.focus()
  main.webContents.send('tray-agenda:navigate', { path: '/settings', search: '?section=calendar' })
}

export function openNoteOrNewMeetingFromTray(payload: {
  noteId?: string | null
  eventId?: string
  title?: string
  openMode: 'note' | 'calendar'
}): void {
  const main = getMainWindow()
  if (!main) return
  main.show()
  main.focus()
  main.webContents.send('tray-agenda:open-event', payload)
}

export function hideTrayAgendaWindow(): void {
  if (agendaWindow && !agendaWindow.isDestroyed()) agendaWindow.hide()
}
