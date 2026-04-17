import { ipcMain, BrowserWindow } from 'electron'
import { summarize, summarizeAndExtract } from '../models/llm-engine'
import { chat, invalidateKeychainCache } from '../cloud/router'
import { updateNote, getSetting } from '../storage/database'
import { loadKeychain, saveKeychain, withKeychainLock } from './keychain-state'

/**
 * LLM + weekly digest. llm (6) + digest (1) = 7 channels.
 * Digest is included here because it orchestrates LLM synthesis.
 */
export function registerLLMHandlers(): void {
  ipcMain.handle('llm:summarize', async (_e, data: any) => {
    const { resolveSelectedAIModel } = await import('../models/model-resolver')
    const model = resolveSelectedAIModel(data.model)
    return summarize(
      data.transcript, data.personalNotes, model, data.meetingTemplateId,
      data.customPrompt, data.meetingTitle, data.meetingDuration, data.attendees,
      data.accountDisplayName,
    )
  })
  ipcMain.handle('llm:summarize-and-extract', async (_e, data: any) => {
    const result = await summarizeAndExtract(
      data.transcript, data.personalNotes, data.model, data.meetingTemplateId,
      data.customPrompt, data.meetingTitle, data.meetingDuration, data.attendees,
      data.accountDisplayName,
    )
    try {
      const { logPipelineQuality } = await import('../storage/database')
      logPipelineQuality({
        gateName: 'grounding',
        outcome: result.groundingScore >= 0.5 ? 'pass' : result.groundingScore >= 0.3 ? 'borderline' : 'fail',
        groundingScore: result.groundingScore,
        durationMs: result.durationMs,
        model: data.model,
      })
      logPipelineQuality({
        gateName: 'entity_extraction',
        outcome: result.entities ? 'pass' : 'fail',
        durationMs: result.durationMs,
        model: data.model,
      })
    } catch (err) {
      console.warn('[quality-log] Failed to log pipeline quality:', err)
    }
    return result
  })
  ipcMain.handle('llm:is-unified-eligible', async () => true)

  ipcMain.handle('llm:summarize-background', async (event, noteId: string, data: any) => {
    ;(async () => {
      const startMs = Date.now()
      try {
        const { resolveSelectedAIModel } = await import('../models/model-resolver')
        const model = resolveSelectedAIModel(data.model)
        const summary = await summarize(
          data.transcript, data.personalNotes, model, data.meetingTemplateId,
          data.customPrompt, data.meetingTitle, data.meetingDuration, data.attendees,
          data.accountDisplayName,
        )
        const durationMs = Date.now() - startMs
        updateNote(noteId, { summary })
        try {
          const { syncActionItemsToCommitments } = await import('../memory/commitment-store')
          const actionItems = summary.actionItems || summary.nextSteps || []
          syncActionItemsToCommitments(noteId, actionItems)
        } catch (syncErr) {
          console.error(`[summarize-background] Commitment sync failed:`, syncErr)
        }
        console.log(`[summarize-background] ${noteId} done in ${(durationMs / 1000).toFixed(1)}s (${model})`)
        event.sender.send('note:summary-ready', noteId, summary, durationMs)
      } catch (err) {
        const durationMs = Date.now() - startMs
        console.error(`[summarize-background] ${noteId} failed after ${(durationMs / 1000).toFixed(1)}s:`, err)
        event.sender.send('note:summary-failed', noteId)
      }
    })()
    return { ok: true }
  })

  ipcMain.handle('llm:chat', async (_e, data: any) => {
    const sender = _e.sender
    const { resolveSelectedAIModel } = await import('../models/model-resolver')
    const model = resolveSelectedAIModel(data.model)
    return chat(data.messages, data.context, model, (chunk) => {
      sender.send('llm:chat-chunk', chunk)
    })
  })

  ipcMain.handle('llm:build-graph-context', async () => {
    try {
      const { getAllPeople } = await import('../memory/people-store')
      const { getAllProjects } = await import('../memory/project-store')
      const { getAllDecisions } = await import('../memory/decision-store')
      const { getOpenCommitments } = await import('../memory/commitment-store')
      const parts: string[] = []

      const people = getAllPeople()
      if (people.length > 0) {
        parts.push(`People (${people.length}):`)
        for (const p of people.slice(0, 30)) {
          parts.push(`  - ${p.name}${p.company ? ` (${p.company})` : ''}${p.role ? `, ${p.role}` : ''} — ${p.meetingCount || 0} meetings`)
        }
      }

      const projects = getAllProjects()
      if (projects.length > 0) {
        parts.push(`\nProjects (${projects.length}):`)
        for (const p of projects.slice(0, 15)) {
          parts.push(`  - ${p.name} [${p.status}] — ${p.meetingCount || 0} meetings, ${p.decisionCount || 0} decisions`)
        }
      }

      const decisions = getAllDecisions()
      if (decisions.length > 0) {
        parts.push(`\nRecent decisions (${decisions.length}):`)
        for (const d of decisions.slice(0, 20)) {
          parts.push(`  - ${d.text}${d.project_name ? ` (${d.project_name})` : ''}${d.note_title ? ` from "${d.note_title}"` : ''}`)
        }
      }

      const commitments = getOpenCommitments()
      if (commitments.length > 0) {
        parts.push(`\nOpen commitments (${commitments.length}):`)
        for (const c of commitments.slice(0, 15)) {
          const owner = c.owner === 'you' ? 'You' : (c.assignee_name || c.owner)
          parts.push(`  - ${owner}: ${c.text}${c.due_date ? ` (due ${c.due_date})` : ''}`)
        }
      }

      return parts.join('\n')
    } catch (err: any) {
      console.error('[llm:build-graph-context]', err)
      return ''
    }
  })

  ipcMain.handle('digest:get-weekly', async (_e, opts?: { mode?: 'current' | 'retrospective'; skipNarrative?: boolean }) => {
    const db = (await import('../storage/database')).getDb()
    const now = new Date()
    const dayOfWeek = now.getDay()
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

    const thisWeekStart = new Date(now)
    thisWeekStart.setDate(now.getDate() - diffToMonday)
    thisWeekStart.setHours(0, 0, 0, 0)
    const thisWeekEnd = new Date(thisWeekStart)
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6)
    thisWeekEnd.setHours(23, 59, 59, 999)

    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(thisWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(thisWeekStart)
    lastWeekEnd.setDate(thisWeekStart.getDate() - 1)
    lastWeekEnd.setHours(23, 59, 59, 999)

    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const today = fmt(now)
    const mode = opts?.mode || (dayOfWeek === 1 ? 'retrospective' : 'current')

    const retroFrom = fmt(lastWeekStart)
    const retroTo = fmt(lastWeekEnd)
    const currentFrom = fmt(thisWeekStart)
    const currentTo = fmt(thisWeekEnd)

    const meetings = db.prepare(`
      SELECT n.id, n.title, n.date, n.time, n.duration, n.coaching_metrics
      FROM notes n WHERE n.date >= ? AND n.date <= ? ORDER BY n.date DESC
    `).all(retroFrom, retroTo) as any[]

    const decisions = db.prepare(`
      SELECT d.id, d.text, d.context, d.date, n.title as noteTitle, n.id as noteId
      FROM decisions d LEFT JOIN notes n ON n.id = d.note_id
      WHERE d.created_at >= ? AND d.created_at <= ? ORDER BY d.created_at DESC
    `).all(retroFrom, retroTo + 'T23:59:59') as any[]

    const commitmentsCreated = db.prepare(`SELECT COUNT(*) as cnt FROM commitments WHERE created_at >= ? AND created_at <= ?`).get(retroFrom, retroTo + 'T23:59:59') as any
    const commitmentsCompleted = db.prepare(`SELECT COUNT(*) as cnt FROM commitments WHERE status = 'completed' AND completed_at >= ? AND completed_at <= ?`).get(retroFrom, retroTo + 'T23:59:59') as any
    const commitmentsOverdue = db.prepare(`SELECT COUNT(*) as cnt FROM commitments WHERE status = 'open' AND due_date < ?`).get(today) as any
    const overdueItems = db.prepare(`
      SELECT c.text, c.owner, c.due_date, p.name as assigneeName
      FROM commitments c LEFT JOIN people p ON p.id = c.assignee_id
      WHERE c.status = 'open' AND c.due_date < ? ORDER BY c.due_date ASC LIMIT 5
    `).all(today) as any[]

    const people = db.prepare(`
      SELECT p.id, p.name, p.company, p.role, COUNT(np.note_id) as meetingCount
      FROM people p JOIN note_people np ON np.person_id = p.id
      JOIN notes n ON n.id = np.note_id
      WHERE n.date >= ? AND n.date <= ?
      GROUP BY p.id ORDER BY meetingCount DESC LIMIT 10
    `).all(retroFrom, retroTo) as any[]

    const projects = db.prepare(`
      SELECT p.id, p.name, p.status,
        (SELECT COUNT(*) FROM note_projects np2 JOIN notes n2 ON n2.id = np2.note_id WHERE np2.project_id = p.id AND n2.date >= ? AND n2.date <= ?) as weekMeetings
      FROM projects p WHERE p.status = 'active'
    `).all(retroFrom, retroTo) as any[]
    const activeProjects = projects.filter((p: any) => p.weekMeetings > 0)

    const coachingScores = meetings
      .filter((m: any) => { try { return m.coaching_metrics && JSON.parse(m.coaching_metrics)?.overallScore > 0 } catch { return false } })
      .map((m: any) => {
        const cm = JSON.parse(m.coaching_metrics)
        return { date: m.date, score: cm.overallScore, headline: cm.conversationInsights?.headline || null }
      })

    const totalDurationMin = meetings.reduce((sum: number, m: any) => sum + (m.duration || 0), 0)

    let mailActivity: { threadCount: number; topCorrespondents: { name: string; threadCount: number }[] } | null = null
    try {
      const { getMailStats } = await import('../integrations/mail-store')
      mailActivity = getMailStats(retroFrom)
    } catch { /* no mail tables */ }

    let upcoming: { meetings: any[]; commitmentsDue: any[] } | null = null
    if (mode === 'current') {
      const commitmentsDue = db.prepare(`
        SELECT c.text, c.owner, c.due_date, p.name as assigneeName
        FROM commitments c LEFT JOIN people p ON p.id = c.assignee_id
        WHERE c.status = 'open' AND c.due_date >= ? AND c.due_date <= ?
        ORDER BY c.due_date ASC
      `).all(today, currentTo) as any[]

      let upcomingMeetings: any[] = []
      try {
        const calendarProvider = getSetting('calendar-provider')
        let googleToken: string | null = null
        try {
          const raw = loadKeychain()['google-calendar-config']
          if (raw) {
            const config = JSON.parse(raw)
            googleToken = config.accessToken || null
            if (config.expiresAt && Date.now() > config.expiresAt - 60_000 && config.clientId && config.refreshToken) {
              const { refreshGoogleToken } = await import('../integrations/google-auth')
              const refreshResult = await refreshGoogleToken(config.clientId, config.refreshToken)
              if (refreshResult.ok && refreshResult.accessToken) {
                googleToken = refreshResult.accessToken
                config.accessToken = googleToken
                config.expiresAt = Date.now() + (refreshResult.expiresIn || 3600) * 1000
                withKeychainLock(() => {
                  const chain = loadKeychain()
                  chain['google-calendar-config'] = JSON.stringify(config)
                  saveKeychain(chain)
                  invalidateKeychainCache()
                })
              }
            }
          }
        } catch { /* no Google config */ }

        if (calendarProvider === 'apple' || (!calendarProvider && !googleToken)) {
          const { fetchAppleCalendarEvents } = await import('../integrations/apple-calendar')
          const result = await fetchAppleCalendarEvents({ daysPast: 0, daysAhead: 7 })
          if (result.ok) {
            upcomingMeetings = result.events.map((e: any) => ({
              title: e.title,
              date: e.startDate?.split('T')[0] || '',
              time: e.startDate?.split('T')[1]?.slice(0, 5) || '',
              attendees: e.attendees || [],
            }))
          }
        } else if (googleToken) {
          const { fetchGoogleCalendarEvents } = await import('../integrations/google-calendar')
          const result = await fetchGoogleCalendarEvents(googleToken, 'primary', { daysPast: 0, daysAhead: 7 })
          if (result.ok) {
            upcomingMeetings = result.events.map((e: any) => ({
              title: e.summary || e.title || 'Untitled',
              date: (e.start?.dateTime || e.start?.date || '').split('T')[0],
              time: (e.start?.dateTime || '').split('T')[1]?.slice(0, 5) || '',
              attendees: (e.attendees || []).map((a: any) => a.displayName || a.email || ''),
            }))
          }
        }
      } catch (err) {
        console.error('[digest] Failed to fetch upcoming calendar events:', err)
      }
      upcoming = { meetings: upcomingMeetings, commitmentsDue }
    }

    let narrative: string | null = null
    if (!opts?.skipNarrative) {
      try {
        const { routeLLM } = await import('../cloud/router')
        const { resolveSelectedAIModel } = await import('../models/model-resolver')
        const model = resolveSelectedAIModel() || 'openai:gpt-4o-mini'

        const dataPoints: string[] = []
        dataPoints.push(`Week: ${retroFrom} to ${retroTo}`)
        dataPoints.push(`Meetings: ${meetings.length} (${totalDurationMin} min total)`)
        dataPoints.push(`Decisions: ${decisions.length}${decisions.length > 0 ? ' — ' + decisions.slice(0, 3).map((d: any) => d.text.slice(0, 60)).join('; ') : ''}`)
        dataPoints.push(`Commitments: ${commitmentsCreated?.cnt || 0} created, ${commitmentsCompleted?.cnt || 0} completed, ${commitmentsOverdue?.cnt || 0} overdue`)
        if (overdueItems.length > 0) dataPoints.push(`Overdue: ${overdueItems.map((c: any) => `${c.assigneeName || c.owner}: ${c.text.slice(0, 40)}`).join('; ')}`)
        if (people.length > 0) dataPoints.push(`Key people: ${people.slice(0, 5).map((p: any) => p.name).join(', ')}`)
        if (activeProjects.length > 0) dataPoints.push(`Active projects: ${activeProjects.map((p: any) => p.name).join(', ')}`)
        if (mailActivity?.threadCount) dataPoints.push(`Email: ${mailActivity.threadCount} threads`)

        if (mode === 'current' && upcoming) {
          if (upcoming.meetings.length > 0) dataPoints.push(`Upcoming this week: ${upcoming.meetings.length} meetings`)
          if (upcoming.commitmentsDue.length > 0) dataPoints.push(`Due this week: ${upcoming.commitmentsDue.length} commitments`)
        }

        if (meetings.length > 0 || decisions.length > 0 || (commitmentsCreated?.cnt || 0) > 0) {
          const prompt = mode === 'current'
            ? 'Write a 3-4 sentence executive brief. First summarize last week (what happened, key decisions, any overdue items needing attention). Then preview this week (upcoming meetings, deadlines). Be specific with names and numbers. No headers or bullet points — just a crisp paragraph.'
            : 'Write a 3-4 sentence executive summary of this week. Highlight the most important decisions, any overdue items needing attention, and who the user spent the most time with. Be specific with names and numbers. No headers or bullet points — just a crisp paragraph.'

          narrative = await routeLLM(
            [
              { role: 'system', content: 'You are OSChief, a concise executive assistant. Write brief, specific summaries. No fluff, no filler.' },
              { role: 'user', content: `${prompt}\n\nData:\n${dataPoints.join('\n')}` },
            ],
            model,
          )
        }
      } catch (err) {
        console.error('[digest] AI summary failed:', err)
      }
    }

    return {
      mode,
      weekRange: { from: retroFrom, to: retroTo },
      currentWeekRange: mode === 'current' ? { from: currentFrom, to: currentTo } : undefined,
      narrative,
      meetings: meetings.map((m: any) => ({ id: m.id, title: m.title, date: m.date, time: m.time, duration: m.duration })),
      meetingCount: meetings.length,
      totalDurationMin,
      decisions,
      commitments: {
        created: commitmentsCreated?.cnt || 0,
        completed: commitmentsCompleted?.cnt || 0,
        overdue: commitmentsOverdue?.cnt || 0,
        overdueItems,
      },
      people,
      projects: activeProjects,
      coachingScores,
      mailActivity,
      upcoming,
    }
  })

  // Standalone narrative generator — takes the already-computed data points
  // from digest:get-weekly and returns only the LLM text. Used so the UI can
  // render data instantly and fill in the narrative asynchronously.
  ipcMain.handle('digest:generate-narrative', async (_e, payload: {
    mode: 'current' | 'retrospective'
    weekRange: { from: string; to: string }
    meetingCount: number
    totalDurationMin: number
    decisions: Array<{ text: string }>
    commitments: { created: number; completed: number; overdue: number; overdueItems: Array<{ text: string; owner: string; assigneeName?: string }> }
    people: Array<{ name: string }>
    projects: Array<{ name: string }>
    mailActivity?: { threadCount: number } | null
    upcoming?: { meetings: any[]; commitmentsDue: any[] } | null
  }): Promise<string | null> => {
    try {
      const { routeLLM } = await import('../cloud/router')
      const { resolveSelectedAIModel } = await import('../models/model-resolver')
      const model = resolveSelectedAIModel() || 'openai:gpt-4o-mini'

      const dataPoints: string[] = []
      dataPoints.push(`Week: ${payload.weekRange.from} to ${payload.weekRange.to}`)
      dataPoints.push(`Meetings: ${payload.meetingCount} (${payload.totalDurationMin} min total)`)
      dataPoints.push(`Decisions: ${payload.decisions.length}${payload.decisions.length > 0 ? ' — ' + payload.decisions.slice(0, 3).map((d) => d.text.slice(0, 60)).join('; ') : ''}`)
      dataPoints.push(`Commitments: ${payload.commitments.created} created, ${payload.commitments.completed} completed, ${payload.commitments.overdue} overdue`)
      if (payload.commitments.overdueItems.length > 0) {
        dataPoints.push(`Overdue: ${payload.commitments.overdueItems.map((c) => `${c.assigneeName || c.owner}: ${c.text.slice(0, 40)}`).join('; ')}`)
      }
      if (payload.people.length > 0) dataPoints.push(`Key people: ${payload.people.slice(0, 5).map((p) => p.name).join(', ')}`)
      if (payload.projects.length > 0) dataPoints.push(`Active projects: ${payload.projects.map((p) => p.name).join(', ')}`)
      if (payload.mailActivity?.threadCount) dataPoints.push(`Email: ${payload.mailActivity.threadCount} threads`)

      if (payload.mode === 'current' && payload.upcoming) {
        if (payload.upcoming.meetings.length > 0) dataPoints.push(`Upcoming this week: ${payload.upcoming.meetings.length} meetings`)
        if (payload.upcoming.commitmentsDue.length > 0) dataPoints.push(`Due this week: ${payload.upcoming.commitmentsDue.length} commitments`)
      }

      if (payload.meetingCount === 0 && payload.decisions.length === 0 && payload.commitments.created === 0) {
        return null
      }

      const prompt = payload.mode === 'current'
        ? 'Write a 3-4 sentence executive brief. First summarize last week (what happened, key decisions, any overdue items needing attention). Then preview this week (upcoming meetings, deadlines). Be specific with names and numbers. No headers or bullet points — just a crisp paragraph.'
        : 'Write a 3-4 sentence executive summary of this week. Highlight the most important decisions, any overdue items needing attention, and who the user spent the most time with. Be specific with names and numbers. No headers or bullet points — just a crisp paragraph.'

      return await routeLLM(
        [
          { role: 'system', content: 'You are OSChief, a concise executive assistant. Write brief, specific summaries. No fluff, no filler.' },
          { role: 'user', content: `${prompt}\n\nData:\n${dataPoints.join('\n')}` },
        ],
        model,
      )
    } catch (err) {
      console.error('[digest] Narrative generation failed:', err)
      return null
    }
  })
}
