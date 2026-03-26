/**
 * Project Store
 *
 * CRUD for the projects table. Projects are auto-detected from meetings
 * (via entity extraction and calendar title parsing) and start as 'suggested'.
 * Users can confirm, merge, or dismiss them.
 */

import { randomUUID } from 'crypto'
import { getDb } from '../storage/database'
import { isSyncEnabled, getChangeLogger } from '../storage/icloud-sync'
import { findBestMatch } from './fuzzy-match'

function logProjectSync(op: 'INSERT' | 'UPDATE' | 'DELETE', id: string, data: Record<string, any> | null): void {
  if (!isSyncEnabled()) return
  getChangeLogger()?.logChange('projects', op, id, data)
}

// ── Read ────────────────────────────────────────────────────────────

export function getAllProjects(filters?: { status?: string }): any[] {
  let sql = `
    SELECT p.*, COALESCE(mc.cnt, 0) as meetingCount, COALESCE(dc.cnt, 0) as decisionCount
    FROM projects p
    LEFT JOIN (SELECT project_id, COUNT(*) as cnt FROM note_projects GROUP BY project_id) mc
      ON mc.project_id = p.id
    LEFT JOIN (SELECT project_id, COUNT(*) as cnt FROM decisions GROUP BY project_id) dc
      ON dc.project_id = p.id
  `
  const values: any[] = []
  if (filters?.status) {
    sql += ' WHERE p.status = ?'
    values.push(filters.status)
  }
  sql += ' ORDER BY p.updated_at DESC'
  return getDb().prepare(sql).all(...values) as any[]
}

export function getProject(id: string): any | null {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as any ?? null
}

export function getProjectsForNote(noteId: string): any[] {
  return getDb().prepare(`
    SELECT p.* FROM projects p
    JOIN note_projects np ON np.project_id = p.id
    WHERE np.note_id = ?
  `).all(noteId) as any[]
}

// ── Upsert ──────────────────────────────────────────────────────────

/**
 * Find or create a project by name using fuzzy matching.
 * Returns the matched/created project.
 */
export function upsertProject(name: string, opts?: { description?: string }): any {
  const db = getDb()
  const now = new Date().toISOString()

  // Exact name match first
  const exact = db.prepare('SELECT * FROM projects WHERE LOWER(name) = LOWER(?)').get(name) as any
  if (exact) {
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, exact.id)
    return getProject(exact.id)
  }

  // Fuzzy match against all projects
  const allProjects = db.prepare('SELECT * FROM projects').all() as any[]
  const match = findBestMatch(name, allProjects, (p) => p.name, 0.7)
  if (match) {
    db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, match.item.id)
    return getProject(match.item.id)
  }

  // Create new project with 'suggested' status
  const id = randomUUID()
  db.prepare(`
    INSERT INTO projects (id, name, description, status, created_at, updated_at)
    VALUES (?, ?, ?, 'suggested', ?, ?)
  `).run(id, name, opts?.description ?? null, now, now)
  const created = getProject(id)
  if (created) logProjectSync('INSERT', id, created)
  return created
}

// ── Mutations ───────────────────────────────────────────────────────

export function confirmProject(id: string): boolean {
  const now = new Date().toISOString()
  getDb().prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('active', now, id)
  const updated = getProject(id)
  if (updated) logProjectSync('UPDATE', id, updated)
  return true
}

export function archiveProject(id: string): boolean {
  const now = new Date().toISOString()
  getDb().prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('archived', now, id)
  const updated = getProject(id)
  if (updated) logProjectSync('UPDATE', id, updated)
  return true
}

export function updateProject(id: string, data: { name?: string; description?: string; status?: string }): boolean {
  const fields: string[] = []
  const values: any[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status) }
  if (fields.length === 0) return false
  fields.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)
  getDb().prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  const updated = getProject(id)
  if (updated) logProjectSync('UPDATE', id, updated)
  return true
}

export function deleteProject(id: string): boolean {
  const db = getDb()
  db.prepare('DELETE FROM note_projects WHERE project_id = ?').run(id)
  db.prepare('UPDATE decisions SET project_id = NULL WHERE project_id = ?').run(id)
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  if ((result as any).changes > 0) logProjectSync('DELETE', id, null)
  return (result as any).changes > 0
}

/**
 * Merge two projects: re-link all note_projects and decisions from source to target, delete source.
 */
export function mergeProjects(keepId: string, mergeId: string): boolean {
  const db = getDb()
  const merge = db.transaction(() => {
    const existingNotes = db.prepare('SELECT note_id FROM note_projects WHERE project_id = ?').all(keepId) as any[]
    const existingNoteIds = new Set(existingNotes.map((r: any) => r.note_id))
    const toMerge = db.prepare('SELECT note_id FROM note_projects WHERE project_id = ?').all(mergeId) as any[]
    for (const row of toMerge) {
      if (!existingNoteIds.has(row.note_id)) {
        db.prepare('INSERT INTO note_projects (note_id, project_id) VALUES (?, ?)').run(row.note_id, keepId)
      }
    }
    db.prepare('UPDATE decisions SET project_id = ? WHERE project_id = ?').run(keepId, mergeId)
    db.prepare('DELETE FROM projects WHERE id = ?').run(mergeId)
  })
  merge()
  return true
}

// ── Links ───────────────────────────────────────────────────────────

export function linkProjectToNote(noteId: string, projectId: string): void {
  const db = getDb()
  db.prepare('INSERT OR IGNORE INTO note_projects (note_id, project_id) VALUES (?, ?)').run(noteId, projectId)

  // Auto-confirm: if project is 'suggested' and now has 2+ meetings, promote to 'active'
  const project = db.prepare('SELECT status FROM projects WHERE id = ?').get(projectId) as any
  if (project?.status === 'suggested') {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM note_projects WHERE project_id = ?').get(projectId) as any
    if (count?.cnt >= 2) {
      const now = new Date().toISOString()
      db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('active', now, projectId)
      console.log(`[projects] Auto-confirmed project ${projectId} (${count.cnt} meetings)`)
    }
  }
}

export function unlinkProjectFromNote(noteId: string, projectId: string): void {
  getDb().prepare('DELETE FROM note_projects WHERE note_id = ? AND project_id = ?').run(noteId, projectId)
}

// ── Timeline ────────────────────────────────────────────────────────

export function getProjectTimeline(projectId: string): {
  meetings: any[]
  decisions: any[]
  people: any[]
  commitments: any[]
} {
  const db = getDb()

  const meetings = db.prepare(`
    SELECT n.id, n.title, n.date, n.time, n.duration, n.time_range, n.summary
    FROM notes n
    JOIN note_projects np ON np.note_id = n.id
    WHERE np.project_id = ?
    ORDER BY n.date DESC, n.time DESC
  `).all(projectId) as any[]

  const decisions = db.prepare(`
    SELECT d.*, n.title as note_title
    FROM decisions d
    LEFT JOIN notes n ON n.id = d.note_id
    WHERE d.project_id = ?
    ORDER BY d.created_at DESC
  `).all(projectId) as any[]

  // People who attended meetings linked to this project
  const people = db.prepare(`
    SELECT DISTINCT p.id, p.name, p.email, p.company, p.role, COUNT(np2.note_id) as meetingCount
    FROM people p
    JOIN note_people np2 ON np2.person_id = p.id
    JOIN note_projects nproj ON nproj.note_id = np2.note_id
    WHERE nproj.project_id = ?
    GROUP BY p.id
    ORDER BY meetingCount DESC
  `).all(projectId) as any[]

  // Commitments from meetings linked to this project
  const commitments = db.prepare(`
    SELECT c.*, p.name as assignee_name
    FROM commitments c
    LEFT JOIN people p ON p.id = c.assignee_id
    JOIN note_projects nproj ON nproj.note_id = c.note_id
    WHERE nproj.project_id = ?
    ORDER BY c.created_at DESC
  `).all(projectId) as any[]

  return { meetings, decisions, people, commitments }
}

// ── Calendar Title Parsing ──────────────────────────────────────────

/**
 * Extract a project name from a calendar event title.
 * Patterns: [ACME] Weekly, Project Phoenix Review, ACME Revamp – Sprint Planning
 */
export function parseProjectFromCalendarTitle(title: string): string | null {
  if (!title) return null

  // [Brackets] pattern: "[ACME] Weekly Sync" → "ACME"
  const bracketMatch = title.match(/^\[([^\]]+)\]/)
  if (bracketMatch) return bracketMatch[1].trim()

  // "Project X" prefix: "Project Phoenix Review" → "Project Phoenix"
  const projectMatch = title.match(/^Project\s+(\S+(?:\s+\S+)?)/i)
  if (projectMatch) return `Project ${projectMatch[1].trim()}`

  // Separator pattern: "ACME Revamp – Sprint Planning" → "ACME Revamp"
  const separatorMatch = title.match(/^(.+?)\s+[–—-]\s+/)
  if (separatorMatch && separatorMatch[1].length > 2 && separatorMatch[1].length < 40) {
    return separatorMatch[1].trim()
  }

  return null
}
