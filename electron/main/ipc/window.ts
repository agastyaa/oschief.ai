import { ipcMain } from 'electron'
import { getMainWindow, setContentProtection } from '../windows'
import {
  setTrayAgendaCache,
  getTrayAgendaCache,
  showMainWindowCalendar,
  showMainWindowSettings,
  showMainWindowApp,
  startNewNoteFromTrayAgenda,
  quitFromTrayAgenda,
  openNoteOrNewMeetingFromTray,
} from '../tray-agenda-window'
import { setSetting } from '../storage/database'

/**
 * Window visibility + content protection + tray agenda window.
 * window (4) + tray-agenda (7) = 11 channels.
 * (tray:update-recording / tray:update-meeting-info live in ipc/stt.ts since
 * they toggle with the recording lifecycle.)
 */
export function registerWindowHandlers(): void {
  // Content protection
  ipcMain.handle('window:set-content-protection', async (_e, enabled: boolean) => {
    setSetting('hide-from-screen-share', enabled ? 'true' : 'false')
    setContentProtection(enabled)
    return true
  })

  // Window visibility
  ipcMain.handle('window:hide', async () => {
    const win = getMainWindow()
    if (win) win.hide()
  })
  ipcMain.handle('window:show', async () => {
    const win = getMainWindow()
    if (win) win.show()
  })
  ipcMain.handle('window:toggle-maximize', async () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  // Tray agenda window
  ipcMain.handle('tray-agenda:set-cache', (_e, events: unknown) => {
    setTrayAgendaCache(Array.isArray(events) ? (events as any) : [])
    return true
  })
  ipcMain.handle('tray-agenda:get-cache', () => getTrayAgendaCache())
  ipcMain.handle('tray-agenda:show-main', () => { showMainWindowCalendar(); return true })
  ipcMain.handle('tray-agenda:show-settings', () => { showMainWindowSettings(); return true })
  ipcMain.handle('tray-agenda:go-to-app', () => { showMainWindowApp(); return true })
  ipcMain.handle('tray-agenda:new-note', () => { startNewNoteFromTrayAgenda(); return true })
  ipcMain.handle('tray-agenda:quit', () => { quitFromTrayAgenda(); return true })
  ipcMain.handle(
    'tray-agenda:activate-event',
    (_e, payload: { noteId?: string | null; eventId?: string; title?: string; openMode: 'note' | 'calendar' }) => {
      openNoteOrNewMeetingFromTray(payload)
      return true
    },
  )
}
