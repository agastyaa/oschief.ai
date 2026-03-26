import { randomUUID } from 'crypto'
import { getDb } from '../storage/database'
import { isSyncEnabled, getChangeLogger } from '../storage/icloud-sync'

function logCommitmentSync(op: 'INSERT' | 'UPDATE' | 'DELETE', id: string, data: Record<string, any> | null): void {
  if (!isSyncEnabled()) return
  getChangeLogger()?.logChange('commitments', op, id, data)
}

export function getAllCommitments(filters?: { status?: string; assigneeId?: string }): any[] {
  let sql = 'SELECT * FROM commitments'
  const conditions: string[] = []
  const values: any[] = []

  if (filters?.status) {
    conditions.push('status = ?')
    values.push(filters.status)
  }
  if (filters?.assigneeId) {
    conditions.push('assignee_id = ?')
    values.push(filters.assigneeId)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }
  sql += ' ORDER BY created_at DESC'

  return getDb().prepare(sql).all(...values) as any[]
}

export function getCommitment(id: string): any | null {
  return getDb().prepare('SELECT * FROM commitments WHERE id = ?').get(id) as any ?? null
}

export function getCommitmentsForNote(noteId: string): any[] {
  return getDb().prepare('SELECT * FROM commitments WHERE note_id = ? ORDER BY created_at ASC').all(noteId) as any[]
}

export function getOpenCommitments(): any[] {
  return getDb().prepare(`
    SELECT c.*, p.name as assignee_name
    FROM commitments c
    LEFT JOIN people p ON p.id = c.assignee_id
    WHERE c.status = 'open'
    ORDER BY
      CASE WHEN c.due_date IS NULL THEN 1 ELSE 0 END,
      c.due_date ASC,
      c.created_at ASC
  `).all() as any[]
}

export function addCommitment(data: {
  noteId?: string
  text: string
  owner?: string
  assigneeId?: string
  dueDate?: string
  projectId?: string
  jiraIssueKey?: string
  jiraIssueUrl?: string
}): any {
  const id = randomUUID()
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO commitments (id, note_id, text, owner, assignee_id, due_date, project_id, jira_issue_key, jira_issue_url, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(
    id,
    data.noteId ?? null,
    data.text,
    data.owner ?? 'you',
    data.assigneeId ?? null,
    data.dueDate ?? null,
    data.projectId ?? null,
    data.jiraIssueKey ?? null,
    data.jiraIssueUrl ?? null,
    now,
    now
  )
  const created = getCommitment(id)
  if (created) logCommitmentSync('INSERT', id, created)
  return created
}

export function updateCommitmentStatus(id: string, status: 'open' | 'completed' | 'overdue' | 'cancelled'): boolean {
  const completedAt = status === 'completed' ? new Date().toISOString() : null
  const now = new Date().toISOString()
  getDb().prepare(`
    UPDATE commitments SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?
  `).run(status, completedAt, now, id)
  const updated = getCommitment(id)
  if (updated) logCommitmentSync('UPDATE', id, updated)
  return true
}

export function updateCommitment(id: string, data: any): boolean {
  const fields: string[] = []
  const values: any[] = []

  if (data.text !== undefined) { fields.push('text = ?'); values.push(data.text) }
  if (data.owner !== undefined) { fields.push('owner = ?'); values.push(data.owner) }
  if (data.assigneeId !== undefined) { fields.push('assignee_id = ?'); values.push(data.assigneeId) }
  if (data.dueDate !== undefined) { fields.push('due_date = ?'); values.push(data.dueDate) }
  if (data.status !== undefined) {
    fields.push('status = ?'); values.push(data.status)
    if (data.status === 'completed') {
      fields.push('completed_at = ?'); values.push(new Date().toISOString())
    }
  }
  if (data.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(data.completedAt) }
  if (data.jiraIssueKey !== undefined) { fields.push('jira_issue_key = ?'); values.push(data.jiraIssueKey) }
  if (data.jiraIssueUrl !== undefined) { fields.push('jira_issue_url = ?'); values.push(data.jiraIssueUrl) }
  if (data.noteId !== undefined) { fields.push('note_id = ?'); values.push(data.noteId) }

  if (fields.length === 0) return false

  fields.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)

  getDb().prepare(`UPDATE commitments SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  const updated = getCommitment(id)
  if (updated) logCommitmentSync('UPDATE', id, updated)
  return true
}

export function markOverdueCommitments(): void {
  const now = new Date().toISOString()
  const result = getDb().prepare(`
    UPDATE commitments SET status = 'overdue', updated_at = ?
    WHERE status = 'open'
      AND due_date IS NOT NULL
      AND due_date GLOB '????-??-??*'
      AND date(due_date) < date('now')
      AND (snoozed_until IS NULL OR datetime(snoozed_until) < datetime('now'))
  `).run(now)
  if ((result as any).changes > 0) {
    console.log(`[commitments] Marked ${(result as any).changes} commitment(s) as overdue`)
  }
}

export function snoozeCommitment(id: string, until: string): boolean {
  const now = new Date().toISOString()
  getDb().prepare(`
    UPDATE commitments SET snoozed_until = ?, status = 'open', updated_at = ? WHERE id = ?
  `).run(until, now, id)
  const updated = getCommitment(id)
  if (updated) logCommitmentSync('UPDATE', id, updated)
  return true
}

// ── Due date normalization ───────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export function normalizeDueDate(raw: string, referenceDate?: Date): string | null {
  if (!raw || raw === 'null') return null
  const trimmed = raw.trim()

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)

  const ref = referenceDate ?? new Date()
  const lower = trimmed.toLowerCase().replace(/^by\s+/i, '').replace(/^on\s+/i, '').trim()

  // "tomorrow"
  if (lower === 'tomorrow') {
    const d = new Date(ref); d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  // "today"
  if (lower === 'today') return ref.toISOString().slice(0, 10)

  // "in N days"
  const inDays = lower.match(/^in\s+(\d+)\s+days?$/)
  if (inDays) {
    const d = new Date(ref); d.setDate(d.getDate() + parseInt(inDays[1]))
    return d.toISOString().slice(0, 10)
  }

  // Day name: "friday", "next monday"
  const isNext = lower.startsWith('next ')
  const dayStr = lower.replace(/^next\s+/, '')
  const dayIdx = DAY_NAMES.indexOf(dayStr)
  if (dayIdx >= 0) {
    const d = new Date(ref)
    const currentDay = d.getDay()
    let daysAhead = dayIdx - currentDay
    if (daysAhead <= 0 || isNext) daysAhead += 7
    if (isNext && daysAhead <= 7) daysAhead += 7
    d.setDate(d.getDate() + daysAhead)
    return d.toISOString().slice(0, 10)
  }

  // "next week" / "end of week"
  if (lower === 'next week' || lower === 'end of week' || lower === 'end of the week') {
    const d = new Date(ref)
    const daysToFriday = (5 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + daysToFriday)
    return d.toISOString().slice(0, 10)
  }

  // "next month" / "end of month"
  if (lower === 'next month' || lower === 'end of month' || lower === 'end of the month') {
    const d = new Date(ref)
    d.setMonth(d.getMonth() + 1, 0) // last day of current month
    return d.toISOString().slice(0, 10)
  }

  // Couldn't parse — return null (caller keeps raw as fallback)
  return null
}
