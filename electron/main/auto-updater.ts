import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

/** Read GH_TOKEN from shell profile (~/.zshrc, ~/.zprofile, ~/.bashrc) since macOS GUI apps don't inherit shell env vars. */
function readTokenFromShellProfile(): string | null {
  const profiles = ['.zshrc', '.zprofile', '.bashrc', '.bash_profile'].map(f => join(homedir(), f))
  for (const p of profiles) {
    try {
      const content = readFileSync(p, 'utf-8')
      // Match: export GH_TOKEN=xxx or export GITHUB_TOKEN=xxx (with or without quotes)
      const match = content.match(/export\s+(?:GH_TOKEN|GITHUB_TOKEN)\s*=\s*["']?([^\s"'#]+)["']?/)
      if (match?.[1]) return match[1]
    } catch { /* file not found — try next */ }
  }
  return null
}

export function setupAutoUpdater(mainWindow: BrowserWindow) {
  // Silent updates — no blocking dialogs
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // Private repo: resolve GH token automatically — env var, shell profile, or DB setting
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || readTokenFromShellProfile()
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
