import { ipcMain } from 'electron'
import {
  getAllLocalCalendarBlocks,
  addLocalCalendarBlock,
  deleteLocalCalendarBlock,
} from '../storage/database'

/**
 * Google + Apple calendar + local calendar blocks.
 * google (3) + apple (2) + calendar-local-blocks (3) = 8 channels.
 */
export function registerCalendarHandlers(): void {
  // Google Calendar OAuth
  ipcMain.handle('google:calendar-auth', async (_e, clientId: string) => {
    try {
      const { startGoogleOAuth } = await import('../integrations/google-auth')
      return startGoogleOAuth(clientId)
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
  ipcMain.handle('google:calendar-fetch', async (_e, accessToken: string, range?: { daysPast?: number; daysAhead?: number }) => {
    try {
      const { fetchGoogleCalendarEvents } = await import('../integrations/google-calendar')
      return fetchGoogleCalendarEvents(accessToken, 'primary', range ?? { daysPast: 30, daysAhead: 30 })
    } catch (err: any) {
      return { ok: false, events: [], error: err.message }
    }
  })
  ipcMain.handle('google:calendar-refresh', async (_e, clientId: string, refreshToken: string) => {
    try {
      const { refreshGoogleToken } = await import('../integrations/google-auth')
      return refreshGoogleToken(clientId, refreshToken)
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  // Apple Calendar
  ipcMain.handle('apple:calendar-fetch', async (_e, range?: { daysPast?: number; daysAhead?: number }) => {
    try {
      const { fetchAppleCalendarEvents } = await import('../integrations/apple-calendar')
      return fetchAppleCalendarEvents(range ?? { daysPast: 7, daysAhead: 14 })
    } catch (err: any) {
      return { ok: false, events: [], error: err.message }
    }
  })
  ipcMain.handle('apple:calendar-check', async () => {
    try {
      const { checkAppleCalendarAccess } = await import('../integrations/apple-calendar')
      return { ok: await checkAppleCalendarAccess() }
    } catch {
      return { ok: false }
    }
  })

  // Local blocks
  ipcMain.handle('calendar-local-blocks:list', () => getAllLocalCalendarBlocks())
  ipcMain.handle('calendar-local-blocks:add', (_e, block: { id: string; title: string; startIso: string; endIso: string; noteId?: string | null }) => {
    addLocalCalendarBlock(block)
    return true
  })
  ipcMain.handle('calendar-local-blocks:delete', (_e, id: string) => {
    deleteLocalCalendarBlock(id)
    return true
  })
}
