import { ipcMain, BrowserWindow } from 'electron'
import { getSetting, setSetting } from '../storage/database'

/**
 * Proactive intelligence + knowledge base + context assembly + prep briefs + routines.
 * intelligence (5) + kb (6) + context (2) + prep (1) + routines (9) = 23 channels.
 */
export function registerIntelligenceHandlers(): void {
  // Daily brief + risk
  ipcMain.handle('intelligence:daily-brief', async () => {
    try {
      const { assembleDailyBrief } = await import('../memory/daily-brief-assembler')
      return assembleDailyBrief()
    } catch (err: any) {
      console.error('[intelligence:daily-brief]', err)
      return { riskCommitments: [], staleDecisions: [], todayMeetingCount: 0, overdueSummary: { amber: 0, red: 0 } }
    }
  })
  ipcMain.handle('intelligence:risk-levels', async () => {
    try {
      const { computeRiskLevels } = await import('../memory/daily-brief-assembler')
      return computeRiskLevels()
    } catch (err: any) {
      console.error('[intelligence:risk-levels]', err)
      return []
    }
  })
  ipcMain.handle('intelligence:stale-decisions', async () => {
    try {
      const { getStaleDecisions } = await import('../memory/daily-brief-assembler')
      return getStaleDecisions()
    } catch (err: any) {
      console.error('[intelligence:stale-decisions]', err)
      return []
    }
  })
  ipcMain.handle('intelligence:follow-up-draft', async (_e, commitmentId: string) => {
    try {
      const { generateFollowUpDraft } = await import('../memory/daily-brief-assembler')
      const draft = await generateFollowUpDraft(commitmentId)
      if (draft) {
        const { clipboard } = await import('electron')
        clipboard.writeText(draft)
        return { ok: true, draft }
      }
      return { ok: false, error: 'Commitment not found' }
    } catch (err: any) {
      console.error('[intelligence:follow-up-draft]', err)
      return { ok: false, error: err.message }
    }
  })
  ipcMain.handle('intelligence:latest-brief-run', async () => {
    try {
      const db = (await import('../storage/database')).getDb()
      return db.prepare(`
        SELECT rr.output, rr.status, rr.started_at
        FROM routine_runs rr
        JOIN routines r ON r.id = rr.routine_id
        WHERE r.builtin_type IN ('morning_briefing', 'end_of_day')
          AND rr.status = 'success'
          AND rr.started_at >= date('now')
        ORDER BY rr.started_at DESC LIMIT 1
      `).get() ?? null
    } catch {
      return null
    }
  })

  // Routines
  ipcMain.handle('routines:get-all', async () => {
    const { getAllRoutines } = await import('../routines/routines-engine')
    return getAllRoutines()
  })
  ipcMain.handle('routines:get', async (_e, id: string) => {
    const { getRoutine } = await import('../routines/routines-engine')
    return getRoutine(id)
  })
  ipcMain.handle('routines:create', async (_e, data: any) => {
    const { createRoutine, rescheduleAllRoutines } = await import('../routines/routines-engine')
    const result = createRoutine(data)
    rescheduleAllRoutines()
    return result
  })
  ipcMain.handle('routines:update', async (_e, id: string, data: any) => {
    const { updateRoutine, rescheduleAllRoutines } = await import('../routines/routines-engine')
    updateRoutine(id, data)
    rescheduleAllRoutines()
    return true
  })
  ipcMain.handle('routines:delete', async (_e, id: string) => {
    const { deleteRoutine, rescheduleAllRoutines } = await import('../routines/routines-engine')
    const ok = deleteRoutine(id)
    rescheduleAllRoutines()
    return ok
  })
  ipcMain.handle('routines:toggle', async (_e, id: string, enabled: boolean) => {
    const { toggleRoutine, rescheduleAllRoutines } = await import('../routines/routines-engine')
    toggleRoutine(id, enabled)
    rescheduleAllRoutines()
    return true
  })
  ipcMain.handle('routines:run-now', async (_e, id: string) => {
    const { getRoutine, executeRoutine } = await import('../routines/routines-engine')
    const routine = getRoutine(id)
    if (!routine) return { ok: false, error: 'Not found' }
    return await executeRoutine(routine)
  })
  ipcMain.handle('routines:get-runs', async (_e, routineId: string, limit?: number) => {
    const { getRoutineRuns } = await import('../routines/routines-engine')
    return getRoutineRuns(routineId, limit ?? 20)
  })
  ipcMain.handle('routines:next-run', async (_e, id: string) => {
    const { getRoutine, getNextRunTime } = await import('../routines/routines-engine')
    const routine = getRoutine(id)
    if (!routine || !routine.enabled) return null
    return getNextRunTime(routine)
  })

  // Context assembly + prep
  ipcMain.handle('context:assemble', async (_e, data: { attendeeNames: string[]; attendeeEmails: string[]; eventTitle?: string }) => {
    try {
      const { assembleContext } = await import('../memory/context-assembler')
      return await assembleContext(data.attendeeNames, data.attendeeEmails, data.eventTitle)
    } catch (err: any) {
      console.error('[context:assemble]', err)
      return null
    }
  })
  ipcMain.handle('context:live-extract', async (_e, recentTranscript: string) => {
    try {
      const { extractAndEnrich } = await import('../memory/live-context')
      return await extractAndEnrich(recentTranscript)
    } catch (err: any) {
      console.error('[context:live-extract]', err)
      return null
    }
  })
  ipcMain.handle('prep:generate', async (_e, data: { attendeeNames: string[]; attendeeEmails: string[]; eventTitle?: string; model: string }) => {
    try {
      const { generatePrepBrief } = await import('../memory/prep-brief')
      return await generatePrepBrief(data.attendeeNames, data.attendeeEmails, data.eventTitle, data.model)
    } catch (err: any) {
      console.error('[prep:generate]', err)
      return null
    }
  })

  // Knowledge base
  ipcMain.handle('kb:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { ok: false, error: 'No active window' }
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog(win, {
      title: 'Select Knowledge Base Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false }
    const folderPath = result.filePaths[0]
    setSetting('kb-folder-path', folderPath)
    const { scanFolder } = await import('../knowledge-base/kb-store')
    const stats = scanFolder(folderPath)
    return { ok: true, path: folderPath, ...stats }
  })
  ipcMain.handle('kb:scan', async () => {
    const folderPath = getSetting('kb-folder-path')
    if (!folderPath) return { ok: false, error: 'No KB folder configured' }
    const { scanFolder } = await import('../knowledge-base/kb-store')
    const stats = scanFolder(folderPath)
    return { ok: true, ...stats }
  })
  ipcMain.handle('kb:search', async (_e, query: string, topK?: number) => {
    const { searchKB } = await import('../knowledge-base/kb-store')
    return searchKB(query, topK ?? 5)
  })
  ipcMain.handle('kb:get-chunk-count', async () => {
    const { getChunkCount } = await import('../knowledge-base/kb-store')
    return getChunkCount()
  })
  ipcMain.handle('kb:clear', async () => {
    const { clearAllChunks } = await import('../knowledge-base/kb-store')
    clearAllChunks()
    setSetting('kb-folder-path', '')
    return { ok: true }
  })
  ipcMain.handle('kb:get-live-suggestions', async (_e, recentTranscript: string, model?: string) => {
    const { getLiveSuggestions } = await import('../knowledge-base/live-suggestions')
    return getLiveSuggestions(recentTranscript, model)
  })
}
