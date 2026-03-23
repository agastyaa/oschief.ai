import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  // Silent updates — no blocking dialogs
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Check for updates on launch (silent — errors are swallowed)
  autoUpdater.checkForUpdatesAndNotify().catch(() => {})

  // Re-check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }, 4 * 60 * 60 * 1000)

  // Notify renderer about update status
  autoUpdater.on('update-available', (info) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info.version)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info.version)
    }
  })
}
