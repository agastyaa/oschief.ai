import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { BrowserWindow } from 'electron'

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  // Silent updates — no blocking dialogs
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Private repo: use GH_TOKEN env var for authentication
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (ghToken) {
    autoUpdater.requestHeaders = { Authorization: `token ${ghToken}` }
  }

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

  autoUpdater.on('update-not-available', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available')
    }
  })

  autoUpdater.on('error', (err) => {
    if (!mainWindow.isDestroyed()) {
      const message = err instanceof Error ? err.message : String(err)
      mainWindow.webContents.send('update-error', message)
    }
  })
}
