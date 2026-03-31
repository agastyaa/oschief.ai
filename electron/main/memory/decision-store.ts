/**
 * Decision Store
 *
 * CRUD for the decisions table. Decisions are extracted from meetings
 * by the entity extractor and are the canonical structured source
 * (summary.decisions remains for backward-compatible display).
 */

import { randomUUID } from 'crypto'
import { getDb } from '../storage/database'
import { isSyncEnabled, getChangeLogger } from '../storage/icloud-sync'

function logDecisionSync(op: 'INSERT' | 'UPDATE' | 'DELETE', id: string, data: Record<string, any> | null): void {
  if (!isSyncEnabled()) return
  getChangeLogger()?.logChange('decisions', op, id, data)
}

// ── Read ────────────────────────────────────────────────────────────

export function getDecision(id: string): any | null {
  return getDb().prepare('SELECT * FROM decisions WHERE id = ?').get(id) as any ?? null
}

export function getDecisionsForNote(noteId: string): any[] {
  return getDb().prepare(`
    SELECT d.*, GROUP_CONCAT(p.name, ', ') as participant_names
    FROM decisions d
    LEFT JOIN decision_people dp ON dp.decision_id = d.id
    LEFT JOIN people p ON p.id = dp.person_id
    WHERE d.note_id = ?
    GROUP BY d.id
    ORDER BY d.created_at ASC
  `).all(noteId) as any[]
}

export function getDecisionsForProject(projectId: string): any[] {
  return getDb().prepare(`
    SELECT d.*, n.title as note_title, GROUP_CONCAT(p.name, ', ') as participant_names
    FROM decisions d
    LEFT JOIN notes n ON n.id = d.note_id
    LEFT JOIN decision_people dp ON dp.decision_id = d.id
    LEFT JOIN people p ON p.id = dp.person_id
    WHERE d.project_id = ?
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `).all(projectId) as any[]
}

export function getUnassignedDecisions(): any[] {
  return getDb().prepare(`
    SELECT d.*, n.title as note_title, GROUP_CONCAT(p.name, ', ') as participant_names
    FROM decisions d
    LEFT JOIN notes n ON n.id = d.note_id
    LEFT JOIN decision_people dp ON dp.decision_id = d.id
    LEFT JOIN people p ON p.id = dp.person_id
    WHERE d.project_id IS NULL
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `).all() as any[]
}

export function getAllDecisions(filters?: { projectId?: string; noteId?: string }): any[] {
  let sql = `
    SELECT d.*, n.title as note_title, pr.name as project_name
    FROM decisions d
    LEFT JOIN notes n ON n.id = d.note_id
    LEFT JOIN projects pr ON pr.id = d.project_id
  `
  const conditions: string[] = []
  const values: any[] = []
  if (filters?.projectId) { conditions.push('d.project_id = ?'); values.push(filters.projectId) }
  if (filters?.noteId) { conditions.push('d.note_id = ?'); values.push(filters.noteId) }
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
  sql += ' ORDER BY d.created_at DESC'
  return getDb().prepare(sql).all(...values) as any[]
}

// ── Write ───────────────────────────────────────────────────────────

export type DecisionStatus = 'MADE' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'ABANDONED' | 'REVISITED'

export function addDecision(data: {
  noteId?: string
  projectId?: string
  text: string
  context?: string
  date?: string
}): any {
  const id = randomUUID()
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO decisions (id, note_id, project_id, text, context, date, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'MADE', ?, ?)
  `).run(
    id,
    data.noteId ?? null,
    data.projectId ?? null,
    data.text,
    data.context ?? null,
    data.date ?? now.slice(0, 10),
    now,
    now
  )
  const created = getDecision(id)
  if (created) logDecisionSync('INSERT', id, created)
  return created
}

export function updateDecisionStatus(id: string, status: DecisionStatus): boolean {
  const now = new Date().toISOString()
  const result = getDb().prepare(`
    UPDATE decisions SET status = ?, updated_at = ? WHERE id = ?
  `).run(status, now, id)
  if ((result as any).changes > 0) {
    const updated = getDecision(id)
    if (updated) logDecisionSync('UPDATE', id, updated)
  }
  return (result as any).changes > 0
}

export function updateDecision(id: string, data: { text?: string; context?: string; projectId?: string | null }): boolean {
  const sets: string[] = []
  const values: any[] = []
  if (data.text !== undefined) { sets.push('text = ?'); values.push(data.text) }
  if (data.context !== undefined) { sets.push('context = ?'); values.push(data.context) }
  if (data.projectId !== undefined) { sets.push('project_id = ?'); values.push(data.projectId) }
  if (sets.length === 0) return false
  sets.push('updated_at = ?'); values.push(new Date().toISOString())
  values.push(id)
  const result = getDb().prepare(`UPDATE decisions SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  if ((result as any).changes > 0) {
    const updated = getDecision(id)
    if (updated) logDecisionSync('UPDATE', id, updated)
  }
  return (result as any).changes > 0
}

export function deleteDecision(id: string): boolean {
  const db = getDb()
  db.prepare('DELETE FROM decision_people WHERE decision_id = ?').run(id)
  const result = db.prepare('DELETE FROM decisions WHERE id = ?').run(id)
  if ((result as any).changes > 0) logDecisionSync('DELETE', id, null)
  return (result as any).changes > 0
}

// ── People Links ────────────────────────────────────────────────────

export function linkDecisionToPeople(decisionId: string, personIds: string[]): void {
  if (!personIds?.length) return
  const db = getDb()
  const stmt = db.prepare('INSERT OR IGNORE INTO decision_people (decision_id, person_id) VALUES (?, ?)')
  for (const personId of personIds) {
    if (personId) stmt.run(decisionId, personId)
  }
}
