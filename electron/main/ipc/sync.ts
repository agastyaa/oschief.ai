import { ipcMain } from 'electron'
import {
  getSyncStatus,
  isICloudAvailable,
  enableSync,
  disableSync,
  forceSyncNow,
} from '../storage/icloud-sync'

/**
 * iCloud sync IPC handlers. 5 channels.
 * Split out of ipc-handlers.ts as the first representative domain file in the
 * v2.10 decomposition — see docs/channel-to-domain.md.
 */
export function registerSyncHandlers(): void {
  ipcMain.handle('sync:get-status', () => getSyncStatus())
  ipcMain.handle('sync:is-icloud-available', () => isICloudAvailable())
  ipcMain.handle('sync:enable', async () => enableSync())
  ipcMain.handle('sync:disable', () => { disableSync(); return true })
  ipcMain.handle('sync:force-sync', async () => { await forceSyncNow(); return true })
}
