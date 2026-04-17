import { ipcMain, BrowserWindow } from 'electron'

/**
 * Memory graph: people / commitments / decisions / projects / topics / entities
 * + contacts VCF import + aggregate stats. 54 channels.
 */
export function registerMemoryHandlers(): void {
  // People
  ipcMain.handle('memory:people-get-all', async () => {
    const { getAllPeople } = await import('../memory/people-store')
    return getAllPeople()
  })
  ipcMain.handle('memory:people-get', async (_e, id: string) => {
    const { getPerson } = await import('../memory/people-store')
    return getPerson(id)
  })
  ipcMain.handle('memory:people-upsert', async (_e, data: any, opts?: { forceCreate?: boolean }) => {
    const { upsertPerson } = await import('../memory/people-store')
    return upsertPerson(data, opts)
  })
  ipcMain.handle('memory:people-delete', async (_e, id: string) => {
    const { deletePerson } = await import('../memory/people-store')
    return deletePerson(id)
  })
  ipcMain.handle('memory:people-forget', async (_e, id: string) => {
    try {
      const { getPerson, deletePerson } = await import('../memory/people-store')
      const person = getPerson(id)
      if (!person) return false
      const { getDb } = await import('../storage/database')
      const db = getDb()
      db.prepare('DELETE FROM decision_people WHERE person_id = ?').run(id)
      try {
        const { getVaultPath } = await import('../vault/vault-config')
        const { existsSync, unlinkSync } = await import('fs')
        const { join } = await import('path')
        const { homedir } = await import('os')
        const vaultPath = getVaultPath()
        if (vaultPath) {
          const resolved = vaultPath.startsWith('~') ? vaultPath.replace('~', homedir()) : vaultPath
          const filePath = join(resolved, 'people', `${person.name.replace(/[/\\?%*:|"<>]/g, '-')}.md`)
          if (existsSync(filePath)) unlinkSync(filePath)
        }
      } catch { /* vault not configured */ }
      deletePerson(id)
      console.log(`[privacy] Forgot person: ${person.name} (${id})`)
      return true
    } catch (err: any) {
      console.error('[privacy:forget]', err)
      return false
    }
  })
  ipcMain.handle('memory:people-merge', async (_e, keepId: string, mergeId: string) => {
    const { mergePeople } = await import('../memory/people-store')
    return mergePeople(keepId, mergeId)
  })
  ipcMain.handle('memory:people-get-meetings', async (_e, personId: string) => {
    const { getPersonMeetings } = await import('../memory/people-store')
    return getPersonMeetings(personId)
  })
  ipcMain.handle('memory:people-for-note', async (_e, noteId: string) => {
    const { getNotePeople } = await import('../memory/people-store')
    return getNotePeople(noteId)
  })
  ipcMain.handle('memory:people-update', async (_e, id: string, data: any) => {
    const { updatePerson } = await import('../memory/people-store')
    return updatePerson(id, data)
  })
  ipcMain.handle('memory:people-unlink-from-note', async (_e, noteId: string, personId: string) => {
    const { unlinkPersonFromNote } = await import('../memory/people-store')
    return unlinkPersonFromNote(noteId, personId)
  })
  ipcMain.handle('memory:people-link-to-note', async (_e, noteId: string, personId: string, role?: string) => {
    const { linkPersonToNote } = await import('../memory/people-store')
    linkPersonToNote(noteId, personId, role)
    return true
  })
  ipcMain.handle('memory:people-import-from-calendar', async (_e, events: Array<{ attendees?: Array<{ name?: string; email?: string }> }>) => {
    try {
      const { batchImportFromCalendar } = await import('../memory/people-store')
      const allAttendees: Array<{ name: string; email?: string }> = []
      for (const event of events) {
        if (!event.attendees) continue
        for (const a of event.attendees) {
          if (a.name) allAttendees.push({ name: a.name, email: a.email })
        }
      }
      if (allAttendees.length === 0) return { ok: true, created: 0, updated: 0, total: 0 }
      const result = batchImportFromCalendar(allAttendees)
      return { ok: true, ...result }
    } catch (err: any) {
      console.error('[calendar-import] Failed:', err)
      return { ok: false, error: err.message, created: 0, updated: 0, total: 0 }
    }
  })

  // Commitments
  ipcMain.handle('memory:commitments-get-all', async (_e, filters?: any) => {
    const { getAllCommitments } = await import('../memory/commitment-store')
    return getAllCommitments(filters)
  })
  ipcMain.handle('memory:commitments-for-note', async (_e, noteId: string) => {
    const { getCommitmentsForNote } = await import('../memory/commitment-store')
    return getCommitmentsForNote(noteId)
  })
  ipcMain.handle('memory:commitments-open', async () => {
    const { getOpenCommitments } = await import('../memory/commitment-store')
    return getOpenCommitments()
  })
  ipcMain.handle('memory:commitments-add', async (_e, data: any) => {
    const { addCommitment } = await import('../memory/commitment-store')
    return addCommitment(data)
  })
  ipcMain.handle('memory:commitments-update-status', async (_e, id: string, status: string) => {
    const { updateCommitmentStatus } = await import('../memory/commitment-store')
    return updateCommitmentStatus(id, status as any)
  })
  ipcMain.handle('memory:commitments-update', async (_e, id: string, data: any) => {
    const { updateCommitment } = await import('../memory/commitment-store')
    return updateCommitment(id, data)
  })
  ipcMain.handle('memory:commitments-delete', async (_e, id: string) => {
    const { deleteCommitment } = await import('../memory/commitment-store')
    return deleteCommitment(id)
  })
  ipcMain.handle('memory:commitments-snooze', async (_e, id: string, until: string) => {
    const { snoozeCommitment } = await import('../memory/commitment-store')
    return snoozeCommitment(id, until)
  })
  ipcMain.handle('memory:sync-action-items', async (_e, noteId: string, actionItems: any[]) => {
    const { syncActionItemsToCommitments } = await import('../memory/commitment-store')
    return syncActionItemsToCommitments(noteId, actionItems)
  })

  // Decisions
  ipcMain.handle('memory:decisions-update-status', async (_e, id: string, status: string) => {
    const { updateDecisionStatus } = await import('../memory/decision-store')
    return updateDecisionStatus(id, status as any)
  })
  ipcMain.handle('memory:decisions-link-person', async (_e, decisionId: string, personId: string) => {
    const { linkDecisionToPeople } = await import('../memory/decision-store')
    linkDecisionToPeople(decisionId, [personId])
    return true
  })
  ipcMain.handle('memory:decisions-unlink-person', async (_e, decisionId: string, personId: string) => {
    const { unlinkDecisionFromPerson } = await import('../memory/decision-store')
    return unlinkDecisionFromPerson(decisionId, personId)
  })
  ipcMain.handle('memory:decisions-get-people', async (_e, decisionId: string) => {
    const { getPeopleForDecision } = await import('../memory/decision-store')
    return getPeopleForDecision(decisionId)
  })
  ipcMain.handle('memory:decisions-for-note', async (_e, noteId: string) => {
    const { getDecisionsForNote } = await import('../memory/decision-store')
    return getDecisionsForNote(noteId)
  })
  ipcMain.handle('memory:decisions-for-project', async (_e, projectId: string) => {
    const { getDecisionsForProject } = await import('../memory/decision-store')
    return getDecisionsForProject(projectId)
  })
  ipcMain.handle('memory:decisions-get-all', async (_e, filters?: any) => {
    const { getAllDecisions } = await import('../memory/decision-store')
    return getAllDecisions(filters)
  })
  ipcMain.handle('memory:decisions-create', async (_e, data: { text: string; context?: string; noteId?: string; projectId?: string; date?: string }) => {
    const { addDecision } = await import('../memory/decision-store')
    return addDecision(data)
  })
  ipcMain.handle('memory:decisions-delete', async (_e, id: string) => {
    const { deleteDecision } = await import('../memory/decision-store')
    return deleteDecision(id)
  })
  ipcMain.handle('memory:decisions-update', async (_e, id: string, data: any) => {
    const { updateDecision } = await import('../memory/decision-store')
    return updateDecision(id, data)
  })
  ipcMain.handle('memory:decisions-unassigned', async () => {
    const { getUnassignedDecisions } = await import('../memory/decision-store')
    return getUnassignedDecisions()
  })

  // Projects
  ipcMain.handle('memory:projects-link-note', async (_e, noteId: string, projectId: string) => {
    const { linkProjectToNote } = await import('../memory/project-store')
    linkProjectToNote(noteId, projectId)
    return true
  })
  ipcMain.handle('memory:projects-unlink-note', async (_e, noteId: string, projectId: string) => {
    const { unlinkProjectFromNote } = await import('../memory/project-store')
    unlinkProjectFromNote(noteId, projectId)
    return true
  })
  ipcMain.handle('memory:projects-get-all', async (_e, filters?: { status?: string }) => {
    const { getAllProjects } = await import('../memory/project-store')
    return getAllProjects(filters)
  })
  ipcMain.handle('memory:projects-get', async (_e, id: string) => {
    const { getProject } = await import('../memory/project-store')
    return getProject(id)
  })
  ipcMain.handle('memory:projects-for-note', async (_e, noteId: string) => {
    const { getProjectsForNote } = await import('../memory/project-store')
    return getProjectsForNote(noteId)
  })
  ipcMain.handle('memory:projects-confirm', async (_e, id: string) => {
    const { confirmProject } = await import('../memory/project-store')
    return confirmProject(id)
  })
  ipcMain.handle('memory:projects-archive', async (_e, id: string) => {
    const { archiveProject } = await import('../memory/project-store')
    return archiveProject(id)
  })
  ipcMain.handle('memory:projects-create', async (_e, name: string) => {
    const { upsertProject, confirmProject } = await import('../memory/project-store')
    const project = upsertProject(name)
    if (project) confirmProject(project.id)
    return project
  })
  ipcMain.handle('memory:projects-update', async (_e, id: string, data: any) => {
    const { updateProject } = await import('../memory/project-store')
    return updateProject(id, data)
  })
  ipcMain.handle('memory:projects-delete', async (_e, id: string) => {
    const { deleteProject } = await import('../memory/project-store')
    return deleteProject(id)
  })
  ipcMain.handle('memory:projects-merge', async (_e, keepId: string, mergeId: string) => {
    const { mergeProjects } = await import('../memory/project-store')
    return mergeProjects(keepId, mergeId)
  })
  ipcMain.handle('memory:projects-timeline', async (_e, projectId: string) => {
    const { getProjectTimeline } = await import('../memory/project-store')
    return getProjectTimeline(projectId)
  })
  ipcMain.handle('memory:projects-link-person', async (_e, projectId: string, personId: string) => {
    const { getDb } = await import('../storage/database')
    const db = getDb()
    db.prepare('INSERT OR IGNORE INTO project_people (project_id, person_id, role) VALUES (?, ?, ?)').run(projectId, personId, 'member')
    return true
  })

  // Topics
  ipcMain.handle('memory:topics-get-all', async () => {
    const { getAllTopics } = await import('../memory/topic-store')
    return getAllTopics()
  })
  ipcMain.handle('memory:topics-for-note', async (_e, noteId: string) => {
    const { getNoteTopics } = await import('../memory/topic-store')
    return getNoteTopics(noteId)
  })
  ipcMain.handle('memory:topics-add-to-note', async (_e, noteId: string, label: string) => {
    const { upsertTopic, linkTopicToNote } = await import('../memory/topic-store')
    const topic = upsertTopic(label)
    linkTopicToNote(noteId, topic.id)
    return topic
  })
  ipcMain.handle('memory:topics-unlink-from-note', async (_e, noteId: string, topicId: string) => {
    const { unlinkTopicFromNote } = await import('../memory/topic-store')
    return unlinkTopicFromNote(noteId, topicId)
  })
  ipcMain.handle('memory:topics-update-label', async (_e, id: string, label: string) => {
    const { updateTopicLabel } = await import('../memory/topic-store')
    return updateTopicLabel(id, label)
  })

  // Entity extraction
  ipcMain.handle('memory:extract-entities', async (_e, data: { noteId: string; summary: any; transcript: any[]; model: string; calendarAttendees?: any[]; calendarTitle?: string }) => {
    try {
      const { extractEntities, storeExtractedEntities } = await import('../memory/entity-extractor')
      const entities = await extractEntities(data.summary, data.transcript, data.model, data.calendarAttendees?.map((a: any) => a.email).filter(Boolean))
      const result = await storeExtractedEntities(data.noteId, entities, data.calendarAttendees, data.calendarTitle)
      return { ok: true, ...result }
    } catch (err: any) {
      console.error('[memory:extract-entities]', err)
      return { ok: false, error: err.message || 'Entity extraction failed' }
    }
  })
  ipcMain.handle('memory:store-entities', async (_e, data: { noteId: string; entities: any; calendarAttendees?: any[]; calendarTitle?: string }) => {
    try {
      const { storeExtractedEntities } = await import('../memory/entity-extractor')
      const result = await storeExtractedEntities(data.noteId, data.entities, data.calendarAttendees, data.calendarTitle)
      return { ok: true, ...result }
    } catch (err: any) {
      console.error('[memory:store-entities]', err)
      return { ok: false, error: err.message || 'Entity storage failed' }
    }
  })

  // Aggregate stats (Professional Memory home)
  ipcMain.handle('memory:stats', async () => {
    try {
      const { getDb } = await import('../storage/database')
      const db = getDb()
      const count = (sql: string) => (db.prepare(sql).get() as any)?.c ?? 0

      const totalNotes = count('SELECT COUNT(*) as c FROM notes')
      const totalPeople = count('SELECT COUNT(*) as c FROM people')
      const totalProjects = count("SELECT COUNT(*) as c FROM projects WHERE status != 'archived'")
      const totalDecisions = count('SELECT COUNT(*) as c FROM decisions')
      const totalCommitments = count('SELECT COUNT(*) as c FROM commitments')
      const openCommitments = count("SELECT COUNT(*) as c FROM commitments WHERE status = 'open'")
      const overdueCommitments = count("SELECT COUNT(*) as c FROM commitments WHERE status = 'open' AND due_date < date('now')")
      const activeProjects = count("SELECT COUNT(*) as c FROM projects WHERE status = 'active'")
      const meetingsThisWeek = count("SELECT COUNT(*) as c FROM notes WHERE created_at >= date('now', '-7 days')")
      const decisionsThisMonth = count("SELECT COUNT(*) as c FROM decisions WHERE created_at >= date('now', 'start of month')")
      const firstNote = db.prepare('SELECT MIN(created_at) as d FROM notes').get() as any
      const firstNoteDate = firstNote?.d || null

      const topPeople = db.prepare(`
        SELECT p.id, p.name, COUNT(np.note_id) as meetingCount
        FROM people p
        JOIN note_people np ON np.person_id = p.id
        GROUP BY p.id
        ORDER BY meetingCount DESC
        LIMIT 3
      `).all() as any[]

      return {
        totalNotes, totalPeople, totalProjects, totalDecisions, totalCommitments,
        openCommitments, overdueCommitments, activeProjects, meetingsThisWeek,
        decisionsThisMonth, firstNoteDate, topPeople,
      }
    } catch (err) {
      console.error('[memory:stats]', err)
      return {
        totalNotes: 0, totalPeople: 0, totalProjects: 0, totalDecisions: 0, totalCommitments: 0,
        openCommitments: 0, overdueCommitments: 0, activeProjects: 0, meetingsThisWeek: 0,
        decisionsThisMonth: 0, firstNoteDate: null, topPeople: [],
      }
    }
  })

  // Contacts import (VCF) — lives in memory domain since it populates people
  ipcMain.handle('contacts:import-vcf', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return { ok: false, error: 'No active window' }
      const { dialog } = await import('electron')
      const result = await dialog.showOpenDialog(win, {
        title: 'Import Contacts (VCF)',
        filters: [{ name: 'vCard', extensions: ['vcf'] }],
        properties: ['openFile'],
      })
      if (result.canceled || !result.filePaths.length) return { ok: false, error: 'Cancelled' }
      const { importVCFFile } = await import('../integrations/contacts-import')
      const importResult = importVCFFile(result.filePaths[0])
      return { ok: true, ...importResult }
    } catch (err: any) {
      console.error('[contacts:import-vcf]', err)
      return { ok: false, error: err.message || 'Import failed' }
    }
  })
}
