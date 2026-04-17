import { ipcMain, systemPreferences, app } from 'electron'
import { getOptionalProviders } from '../cloud/router'
import { checkAppleFoundationAvailable } from '../cloud/apple-llm'
import { netFetch } from '../cloud/net-request'
import { getSetting, setSetting } from '../storage/database'

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

  // Permissions
  ipcMain.handle('permissions:check-mic', () => {
    if (process.platform === 'darwin') return systemPreferences.getMediaAccessStatus('microphone')
    return 'granted'
  })
  ipcMain.handle('permissions:request-mic', async () => {
    if (process.platform === 'darwin') return systemPreferences.askForMediaAccess('microphone')
    return true
  })
  ipcMain.handle('permissions:check-screen', () => {
    if (process.platform === 'darwin') return systemPreferences.getMediaAccessStatus('screen')
    return 'granted'
  })
  ipcMain.handle('permissions:request-screen', () => {
    if (process.platform === 'darwin') return systemPreferences.getMediaAccessStatus('screen')
    return 'granted'
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
    const { setQuittingForUpdate } = await import('../windows')
    setQuittingForUpdate()
    const pkg = await import('electron-updater')
    const autoUpdater = pkg.default?.autoUpdater ?? (pkg as any).autoUpdater
    autoUpdater?.quitAndInstall(false, true)
  })
}
