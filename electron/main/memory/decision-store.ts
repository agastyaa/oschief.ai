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
    INSERT INTO decisions (id, note_id, project_id, text, context, date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.noteId ?? null,
    data.projectId ?? null,
    data.text,
    data.context ?? null,
    data.date ?? now.slice(0, 10),
    now
  )
  const created = getDecision(id)
  if (created) logDecisionSync('INSERT', id, created)
  return created
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
  const db = getDb()
  const stmt = db.prepare('INSERT OR IGNORE INTO decision_people (decision_id, person_id) VALUES (?, ?)')
  for (const personId of personIds) {
    stmt.run(decisionId, personId)
  }
}
