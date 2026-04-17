import { ipcMain, BrowserWindow } from 'electron'
import { getSetting } from '../storage/database'

/** Coaching feedback / conversation analysis / batch-analyze. 4 channels. */
export function registerCoachingHandlers(): void {
  ipcMain.handle('coaching:generate-role-insights', async (_e, metrics: any, roleId: string, model?: string) => {
    const { generateRoleCoachingInsights } = await import('../models/coaching-feedback')
    return generateRoleCoachingInsights(metrics, roleId, model)
  })
  ipcMain.handle('coaching:analyze-conversation', async (_e, payload: any) => {
    const { analyzeConversationQuality } = await import('../models/conversation-coaching')
    if (!payload.userName) {
      payload.userName = getSetting('accountDisplayName') || undefined
    }
    return analyzeConversationQuality(payload)
  })
  ipcMain.handle('coaching:aggregate-insights', async (_e, meetings: any[], roleId: string, model?: string) => {
    const { aggregateCrossMeetingInsights } = await import('../models/conversation-coaching')
    return aggregateCrossMeetingInsights(meetings, roleId, model)
  })

  ipcMain.handle('coaching:analyze-all', async () => {
    const { analyzeConversationQuality } = await import('../models/conversation-coaching')
    const db = (await import('../storage/database')).getDb()
    const userName = getSetting('accountDisplayName') || undefined
    const roleId = getSetting('accountRoleId') || 'pm'

    const notes = db.prepare(`
      SELECT id, title, transcript, coaching_metrics FROM notes
      WHERE transcript IS NOT NULL AND transcript != '' AND transcript != '[]'
    `).all() as any[]

    const needsAnalysis = notes.filter((n) => {
      if (!n.transcript) return false
      try {
        const cm = n.coaching_metrics ? JSON.parse(n.coaching_metrics) : null
        return !cm?.conversationInsights?.headline
      } catch { return true }
    })

    const win = BrowserWindow.getAllWindows()[0]
    let completed = 0
    const total = needsAnalysis.length
    const errors: string[] = []

    for (const note of needsAnalysis) {
      try {
        let transcript: any[]
        try { transcript = JSON.parse(note.transcript) } catch { continue }
        if (!Array.isArray(transcript) || transcript.length === 0) continue

        const yourLines = transcript.filter((l: any) => l.speaker === 'You' || l.speaker === 'Me')
        const otherLines = transcript.filter((l: any) => l.speaker !== 'You' && l.speaker !== 'Me')
        const yourWords = yourLines.reduce((sum: number, l: any) => sum + (l.text?.split(/\s+/).length || 0), 0)
        const otherWords = otherLines.reduce((sum: number, l: any) => sum + (l.text?.split(/\s+/).length || 0), 0)
        const totalWords = yourWords + otherWords
        const metrics = {
          yourSpeakingTimeSec: yourLines.length * 10,
          othersSpeakingTimeSec: otherLines.length * 10,
          talkToListenRatio: totalWords > 0 ? yourWords / totalWords : 0.5,
          wordsPerMinute: 0,
          fillerWordsPerMinute: 0,
          overallScore: 50,
        }

        const result = await analyzeConversationQuality({ transcript, metrics, roleId, userName })

        if (result.ok) {
          let existing: any = {}
          try { if (note.coaching_metrics) existing = JSON.parse(note.coaching_metrics) } catch {}
          existing.conversationInsights = result.data
          db.prepare('UPDATE notes SET coaching_metrics = ? WHERE id = ?')
            .run(JSON.stringify(existing), note.id)
        } else {
          errors.push(`${note.title || note.id}: ${result.message}`)
        }
      } catch (err: any) {
        errors.push(`${note.title || note.id}: ${err.message}`)
      }

      completed++
      if (win) {
        win.webContents.send('coaching:analyze-progress', { current: completed, total, noteTitle: note.title })
      }
    }

    return { ok: true, total, completed, errors }
  })
}
