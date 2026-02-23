import { app, BrowserWindow } from 'electron'
import { createMainWindow, getMainWindow } from './windows'
import { setupTray } from './tray'
import { registerIPCHandlers } from './ipc-handlers'
import { initDatabase, getAllNotes, getAllFolders } from './storage/database'
import { syncAllSummarizedNotesToDocuments } from './storage/documents-sync'
import { ensureModelsDir } from './models/manager'
import { startMeetingDetection, stopMeetingDetection } from './meeting-detector'
import { setupPowerMonitor } from './power-manager'
import { scheduleActionItemReminders } from './action-reminders'

app.setName('Syag')

app.whenReady().then(async () => {
  try {
    initDatabase()
    try {
      syncAllSummarizedNotesToDocuments(getAllNotes(), getAllFolders())
    } catch (e) {
      console.error('Documents sync on startup:', e)
    }
  } catch (err) {
    console.error('Failed to initialize database:', err)
  }
  ensureModelsDir()
  registerIPCHandlers()

  const mainWindow = createMainWindow()
  setupTray(mainWindow)
  startMeetingDetection(mainWindow)
  setupPowerMonitor(mainWindow)

  // Action item reminders: one timer for 2pm (day before), one for 9am (deadline day); each reschedules for the next day
  scheduleActionItemReminders()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    } else {
      getMainWindow()?.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopMeetingDetection()
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.removeAllListeners('close')
  }
})
