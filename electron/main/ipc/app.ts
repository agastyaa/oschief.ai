import { ipcMain, app } from 'electron'
import { getOptionalProviders } from '../cloud/router'
import { checkAppleFoundationAvailable } from '../cloud/apple-llm'
import { netFetch } from '../cloud/net-request'
import { getSetting, setSetting } from '../storage/database'
import { checkPermission, requestPermission, openRecoveryPane } from '../permissions'

/**
 * App lifecycle / setup / permissions / agent API / URL fetch / optional providers.
 * app (9) + setup (2) + fetch (1) + permissions (4) + api (4) = 20 channels.
 */
export function registerAppHandlers(): void {
  // Auto-setup
  ipcMain.handle('setup:is-complete', async () => {
    const { isSetupComplete } = await import('../models/auto-setup')
    return isSetupComplete()
  })
  ipcMain.handle('setup:retry', async () => {
    const { BrowserWindow } = await import('electron')
    const { runAutoSetup } = await import('../models/auto-setup')
    setSetting('auto-setup-complete', '')
    return runAutoSetup((status) => {
      const win = BrowserWindow.getFocusedWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('setup:progress', status)
      }
    })
  })

  // Optional providers
  ipcMain.handle('app:get-optional-providers', () => getOptionalProviders())

  // Permissions — routed through the central permissions module (R5).
  // Legacy channels keep their exact return shapes for backwards compat.
  ipcMain.handle('permissions:check-mic', () => checkPermission('microphone'))
  ipcMain.handle('permissions:request-mic', async () => {
    const result = await requestPermission('microphone')
    return result === 'granted'
  })
  ipcMain.handle('permissions:check-screen', () => checkPermission('screen'))
  ipcMain.handle('permissions:request-screen', async () => {
    // macOS has no programmatic screen-recording prompt — opens System
    // Settings so the user can grant manually.
    return requestPermission('screen')
  })
  // R5 — generic handlers any future feature can use
  ipcMain.handle('permissions:check', (_e, kind) => checkPermission(kind))
  ipcMain.handle('permissions:request', async (_e, kind) => requestPermission(kind))
  ipcMain.handle('permissions:open-pane', async (_e, kind) => openRecoveryPane(kind))

  // v2.11 — fire a diagnostic notification so users can verify that macOS
  // is actually willing to show notifications for OSChief. Common failure:
  // unsigned alpha builds don't always get the native permission prompt,
  // so notifications silently go nowhere. This button proves the pipe.
  ipcMain.handle('app:test-notification', async () => {
    const { Notification } = await import('electron')
    const supported = Notification.isSupported()
    if (!supported) return { ok: false, supported: false, reason: 'Notification API not supported on this platform' }
    try {
      const n = new Notification({
        title: 'OSChief test notification',
        body: 'If you see this, notifications work. The meeting nudge uses the same pipe.',
        silent: false,
        urgency: 'normal',
        actions: [{ type: 'button', text: 'Confirm' }],
        closeButtonText: 'Dismiss',
      })
      n.show()
      return { ok: true, supported: true }
    } catch (err: any) {
      return { ok: false, supported: true, reason: err?.message || 'Notification.show() threw' }
    }
  })

  // URL fetch
  ipcMain.handle('fetch:url', async (_e, url: string) => {
    try {
      const { statusCode, data } = await netFetch(url, { method: 'GET' })
      return { ok: statusCode < 400, status: statusCode, body: data }
    } catch (err: any) {
      return { ok: false, status: 0, body: err.message || 'Network error' }
    }
  })

  // Agent API
  ipcMain.handle('api:enable', async () => {
    const { startApiServer, getApiToken, generateApiToken } = await import('../api/server')
    if (!getApiToken()) generateApiToken()
    setSetting('api-enabled', 'true')
    await startApiServer()
    return true
  })
  ipcMain.handle('api:disable', async () => {
    const { stopApiServer } = await import('../api/server')
    setSetting('api-enabled', 'false')
    await stopApiServer()
    return true
  })
  ipcMain.handle('api:get-status', async () => {
    const { getApiToken, getSocketPath, isApiRunning } = await import('../api/server')
    return {
      enabled: getSetting('api-enabled') === 'true',
      running: isApiRunning(),
      token: getApiToken(),
      socketPath: getSocketPath(),
    }
  })
  ipcMain.handle('api:regenerate-token', async () => {
    const { generateApiToken } = await import('../api/server')
    return generateApiToken()
  })

  // App info + actions
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:open-external', async (_e, url: string) => {
    const { shell } = await import('electron')
    await shell.openExternal(url)
  })
  ipcMain.handle('app:write-clipboard', async (_e, text: string) => {
    const { clipboard } = await import('electron')
    clipboard.writeText(text)
  })
  ipcMain.handle('app:get-arch', () => process.arch)
  ipcMain.handle('app:apple-foundation-available', () => checkAppleFoundationAvailable())
  ipcMain.handle('app:set-login-item', (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return true
  })

  // Auto-updates
  ipcMain.handle('app:check-for-updates', async () => {
    try {
      const pkg = await import('electron-updater')
      const autoUpdater = pkg.default?.autoUpdater ?? (pkg as any).autoUpdater
      if (!autoUpdater?.checkForUpdates) {
        return { ok: false as const, error: 'Auto-updater not available in this build' }
      }
      if (!autoUpdater.requestHeaders?.Authorization) {
        const { readFileSync } = require('fs')
        const { join } = require('path')
        const { homedir } = require('os')
        const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || (() => {
          for (const f of ['.zshrc', '.zprofile', '.bashrc', '.bash_profile']) {
            try {
              const content = readFileSync(join(homedir(), f), 'utf-8')
              const m = content.match(/export\s+(?:GH_TOKEN|GITHUB_TOKEN)\s*=\s*["']?([^\s"'#]+)["']?/)
              if (m?.[1]) return m[1]
            } catch {}
          }
          return null
        })()
        if (ghToken) {
          autoUpdater.requestHeaders = { ...autoUpdater.requestHeaders, Authorization: `token ${ghToken}` }
        }
      }
      const result = await autoUpdater.checkForUpdates()
      const info = result?.updateInfo
      const isUpdateAvailable =
        typeof result?.isUpdateAvailable === 'boolean'
          ? result.isUpdateAvailable
          : !!(info?.version && info.version !== app.getVersion())
      return {
        ok: true as const,
        isUpdateAvailable,
        version: info?.version ?? null,
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false as const, error: message }
    }
  })
  ipcMain.handle('app:install-update', async () => {
    // v2.11.2 — on unsigned macOS alpha builds, autoUpdater.quitAndInstall
    // fails to relaunch the app after install because Squirrel.Mac's helper
    // can't pass Gatekeeper for the replaced binary. The app quits, install
    // completes, but the relaunch is silently blocked. Fix: schedule a
    // relaunch via app.relaunch() BEFORE quitAndInstall, so the OS queues
    // the relaunch independently of Squirrel's helper.
    const { setQuittingForUpdate } = await import('../windows')
    setQuittingForUpdate()
    const pkg = await import('electron-updater')
    const autoUpdater = pkg.default?.autoUpdater ?? (pkg as any).autoUpdater
    if (!autoUpdater) {
      console.error('[auto-updater] autoUpdater not available on install-update')
      return
    }
    try {
      // Belt: tell Electron to re-launch after the current process exits.
      // Works regardless of whether Squirrel's post-install helper runs.
      app.relaunch()
      // Suspenders: run the installer. isSilent=true on macOS skips the
      // built-in restart dialog (we've already committed to restart at the
      // UI layer). isForceRunAfter=true asks Squirrel to relaunch too —
      // belt-and-suspenders with app.relaunch().
      autoUpdater.quitAndInstall(true, true)
    } catch (err) {
      console.error('[auto-updater] quitAndInstall threw:', err)
      // Fallback: relaunch the current binary (user will still have the old
      // version but at least the app comes back up and the update will
      // auto-apply on next quit via autoInstallOnAppQuit=true).
      try { app.relaunch() } catch { /* no-op */ }
      try { app.exit(0) } catch { /* no-op */ }
    }
  })
}
