import { app, BrowserWindow } from 'electron'
import { createMainWindow, getMainWindow } from './windows'
import { setupTray } from './tray'
import { registerIPCHandlers } from './ipc-handlers'
import { initDatabase } from './storage/database'
import { ensureModelsDir } from './models/manager'
import { startMeetingDetection, stopMeetingDetection } from './meeting-detector'
import { setupPowerMonitor } from './power-manager'

app.setName('Syag')

app.whenReady().then(async () => {
  try {
    initDatabase()
  } catch (err) {
    console.error('Failed to initialize database:', err)
  }
  ensureModelsDir()
  registerIPCHandlers()

  const mainWindow = createMainWindow()
  setupTray(mainWindow)
  startMeetingDetection(mainWindow)
  setupPowerMonitor(mainWindow)

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
