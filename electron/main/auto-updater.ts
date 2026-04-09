import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { BrowserWindow, dialog } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { setQuittingForUpdate } from './windows'

/** Read GH_TOKEN from shell profile (~/.zshrc, ~/.zprofile, ~/.bashrc) since macOS GUI apps don't inherit shell env vars. */
function readTokenFromShellProfile(): string | null {
  const profiles = ['.zshrc', '.zprofile', '.bashrc', '.bash_profile'].map(f => join(homedir(), f))
  for (const p of profiles) {
    try {
      const content = readFileSync(p, 'utf-8')
      const match = content.match(/export\s+(?:GH_TOKEN|GITHUB_TOKEN)\s*=\s*["']?([^\s"'#]+)["']?/)
      if (match?.[1]) return match[1]
    } catch { /* file not found — try next */ }
  }
  return null
}

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Auth header for private repos (public repos don't need this)
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || readTokenFromShellProfile()
  if (ghToken) {
    autoUpdater.requestHeaders = { Authorization: `token ${ghToken}` }
  }

  // Check for updates on launch
  autoUpdater.checkForUpdatesAndNotify().catch(() => {})

  // Re-check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }, 4 * 60 * 60 * 1000)

  autoUpdater.on('update-available', (info) => {
    console.log(`[auto-updater] Update available: v${info.version}`)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info.version)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[auto-updater] Update downloaded: v${info.version} — prompting restart`)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info.version)
    }
    // Prompt user to restart and install
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `OSChief v${info.version} has been downloaded.`,
      detail: 'Restart now to install the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        setQuittingForUpdate()
        autoUpdater.quitAndInstall(false, true)
      }
    })
  })

  autoUpdater.on('update-not-available', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available')
    }
  })

  autoUpdater.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[auto-updater] Error:', message)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', message)
    }
  })
}
