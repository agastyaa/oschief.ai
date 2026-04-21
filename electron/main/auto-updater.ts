import pkg from 'electron-updater'
const { autoUpdater } = pkg
import { BrowserWindow, dialog, app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { setQuittingForUpdate } from './windows'
import { setPendingUpdate } from './tray'

// Tracks whether a recording is active so the update flow doesn't kill a
// live meeting. Set from the same tray state flag via updateTrayRecordingState
// (renderer-driven). Auto-updater.ts can't import tray's private state, so
// we piggyback on a local flag updated by a small setter.
let isRecordingActive = false
export function setAutoUpdaterRecordingFlag(recording: boolean): void {
  isRecordingActive = recording
}

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

  autoUpdater.on('download-progress', (progress) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[auto-updater] Update downloaded: v${info.version} — surfacing`)

    // Tell the tray so it shows "Restart & install vX.Y.Z" at the top of
    // its menu. This is the persistent, always-reachable entry point — it
    // stays there until the user restarts. If a recording is active, the
    // tray shows a disabled banner instead.
    setPendingUpdate(info.version)

    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info.version)
    }

    // Skip the restart dialog during an active recording — no popup that
    // could interrupt a meeting. The tray banner still shows the pending
    // update; user can restart from there when they're done.
    if (isRecordingActive) {
      console.log('[auto-updater] Recording active — deferring restart prompt until meeting ends')
      return
    }

    // Also skip if the main window isn't visible (user is using the tray
    // workflow). Dialog would pop in the background and confuse. Tray
    // banner + the in-app banner cover that case.
    if (!mainWindow.isVisible()) {
      return
    }

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
        try {
          // v2.11.2 — app.relaunch() as belt-and-suspenders against the
          // unsigned-macOS case where Squirrel's helper can't relaunch the
          // app after install. isSilent=true skips the built-in restart
          // dialog since we've already confirmed above.
          app.relaunch()
          autoUpdater.quitAndInstall(true, true)
        } catch (err) {
          console.error('[auto-updater] quitAndInstall threw:', err)
          try { app.relaunch() } catch {}
          try { app.exit(0) } catch {}
        }
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
