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

  // v2.11.3 — every auto-updater event handler is now wrapped in a
  // try/catch AND gated on `mainWindow.isDestroyed()` AT the access point,
  // not once at the top. The old code called mainWindow.isVisible() and
  // dialog.showMessageBox(mainWindow, ...) after a stale isDestroyed check,
  // which threw "TypeError: Object has been destroyed" as an uncaught
  // exception into the event emitter — crashing the whole auto-update
  // flow silently. See also `safeWindowCall` below.
  const safeSend = (channel: string, ...args: unknown[]) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args)
      }
    } catch (err) {
      console.warn(`[auto-updater] safeSend(${channel}) failed:`, err instanceof Error ? err.message : err)
    }
  }
  const windowIsAlive = (): boolean => {
    try {
      return !!mainWindow && !mainWindow.isDestroyed()
    } catch { return false }
  }
  const windowIsVisible = (): boolean => {
    try {
      return windowIsAlive() && mainWindow.isVisible()
    } catch { return false }
  }

  autoUpdater.on('update-available', (info) => {
    try {
      console.log(`[auto-updater] Update available: v${info.version}`)
      safeSend('update-available', info.version)
    } catch (err) {
      console.error('[auto-updater] update-available handler threw:', err)
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    try {
      safeSend('update-download-progress', {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      })
    } catch (err) {
      console.error('[auto-updater] download-progress handler threw:', err)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    try {
      console.log(`[auto-updater] Update downloaded: v${info.version} — surfacing`)

      // Tray banner is persistent — survives mainWindow being destroyed or
      // hidden. Always set it first so the user has a path to restart even
      // if the dialog path below no-ops.
      try { setPendingUpdate(info.version) } catch (err) {
        console.warn('[auto-updater] setPendingUpdate failed:', err)
      }

      safeSend('update-downloaded', info.version)

      if (isRecordingActive) {
        console.log('[auto-updater] Recording active — deferring restart prompt until meeting ends')
        return
      }

      if (!windowIsVisible()) {
        console.log('[auto-updater] Main window not visible — skipping restart dialog (tray banner still set)')
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
        if (response !== 0) return
        try {
          setQuittingForUpdate()
          app.relaunch()
          autoUpdater.quitAndInstall(true, true)
        } catch (err) {
          console.error('[auto-updater] quitAndInstall threw:', err)
          try { app.relaunch() } catch {}
          try { app.exit(0) } catch {}
        }
      }).catch((err) => {
        console.error('[auto-updater] showMessageBox rejected:', err)
      })
    } catch (err) {
      console.error('[auto-updater] update-downloaded handler threw:', err)
    }
  })

  autoUpdater.on('update-not-available', () => {
    try { safeSend('update-not-available') } catch (err) {
      console.error('[auto-updater] update-not-available handler threw:', err)
    }
  })

  autoUpdater.on('error', (err) => {
    try {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[auto-updater] Error:', message)
      safeSend('update-error', message)
    } catch (inner) {
      console.error('[auto-updater] error handler itself threw:', inner)
    }
  })
}
