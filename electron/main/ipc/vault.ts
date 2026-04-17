import { ipcMain, BrowserWindow, app } from 'electron'
import { invalidateKeychainCache } from '../cloud/router'
import { loadKeychain, saveKeychain, withKeychainLock } from './keychain-state'

/**
 * Obsidian vault config + encrypted keychain CRUD.
 * vault (3) + keychain (3) = 6 channels.
 */
export function registerVaultHandlers(): void {
  // Keychain
  ipcMain.handle('keychain:get', (_e, service: string) => {
    const chain = loadKeychain()
    return chain[service] ?? null
  })
  ipcMain.handle('keychain:set', async (_e, service: string, value: string) => {
    return withKeychainLock(() => {
      const chain = loadKeychain()
      chain[service] = value
      saveKeychain(chain)
      invalidateKeychainCache()
      return true
    })
  })
  ipcMain.handle('keychain:delete', async (_e, service: string) => {
    return withKeychainLock(() => {
      const chain = loadKeychain()
      delete chain[service]
      saveKeychain(chain)
      invalidateKeychainCache()
      return true
    })
  })

  // Vault config
  ipcMain.handle('vault:get-config', async () => {
    const { getVaultPath, isVaultConfigured, getVaultName, validateVaultPath } = await import('../vault/vault-config')
    const path = getVaultPath()
    return {
      configured: isVaultConfigured(),
      path,
      vaultName: getVaultName(),
      validation: path ? validateVaultPath(path) : null,
    }
  })

  ipcMain.handle('vault:pick-folder', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { ok: false, error: 'No active window' }
      const { dialog } = await import('electron')
      const { getVaultPath, setVaultPath, validateVaultPath, getVaultName } = await import('../vault/vault-config')
      const currentPath = getVaultPath()
      const result = await dialog.showOpenDialog(win, {
        title: 'Select Obsidian Vault Folder',
        defaultPath: currentPath || app.getPath('home'),
        properties: ['openDirectory'],
      })
      if (result.canceled || !result.filePaths.length) return { ok: false, error: 'Cancelled' }
      const chosenPath = result.filePaths[0]
      const validation = validateVaultPath(chosenPath)
      if (!validation.valid) return { ok: false, error: validation.error }
      setVaultPath(chosenPath)
      return { ok: true, path: chosenPath, vaultName: getVaultName(), warning: validation.warning }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('vault:set-path', async (_e, path: string) => {
    const { setVaultPath, validateVaultPath } = await import('../vault/vault-config')
    const validation = validateVaultPath(path)
    if (!validation.valid) return { ok: false, error: validation.error }
    setVaultPath(path)
    return { ok: true, warning: validation.warning }
  })
}
