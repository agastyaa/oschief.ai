import { randomUUID } from 'crypto'
import { getDb } from '../storage/database'
import { isSyncEnabled, getChangeLogger } from '../storage/icloud-sync'

function logCommitmentSync(op: 'INSERT' | 'UPDATE' | 'DELETE', id: string, data: Record<string, any> | null): void {
  if (!isSyncEnabled()) return
  getChangeLogger()?.logChange('commitments', op, id, data)
}

export function getAllCommitments(filters?: { status?: string; assigneeId?: string }): any[] {
  let sql = `SELECT c.*, p.name as assignee_name, pr.name as project_name, n.date as note_date, n.title as note_title
    FROM commitments c
    LEFT JOIN people p ON p.id = c.assignee_id
    LEFT JOIN projects pr ON pr.id = c.project_id
    LEFT JOIN notes n ON n.id = c.note_id`
  const conditions: string[] = []
  const values: any[] = []

  if (filters?.status) {
    conditions.push('c.status = ?')
    values.push(filters.status)
  }
  if (filters?.assigneeId) {
    conditions.push('c.assignee_id = ?')
    values.push(filters.assigneeId)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }
  sql += ' ORDER BY c.created_at DESC'

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
  confidence?: 'high' | 'medium' | 'low'
}): any {
  const id = randomUUID()
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO commitments (id, note_id, text, owner, assignee_id, due_date, project_id, jira_issue_key, jira_issue_url, confidence, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
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
    data.confidence ?? 'medium',
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
  // Clear amber notification when completed or cancelled
  if (status === 'completed' || status === 'cancelled') {
    clearAmberNotification(id)
  }
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

export function deleteCommitment(id: string): boolean {
  const existing = getCommitment(id)
  if (!existing) return false
  getDb().prepare('DELETE FROM commitments WHERE id = ?').run(id)
  logCommitmentSync('DELETE', id, null)
  return true
}

/**
 * Sync commitments 1:1 with action items from a meeting summary.
 * Creates, updates, or removes commitments so they exactly mirror action items.
 * Preserves commitment-side state (status, snooze, Jira/Asana links) when updating.
 */
export function syncActionItemsToCommitments(
  noteId: string,
  actionItems: Array<{
    text: string
    assignee?: string
    dueDate?: string
    done: boolean
    priority?: string
    jiraIssueKey?: string
    jiraIssueUrl?: string
    asanaTaskGid?: string
    asanaTaskUrl?: string
  }>
): { created: number; updated: number; removed: number } {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM commitments WHERE note_id = ? ORDER BY created_at ASC').all(noteId) as any[]
  const now = new Date().toISOString()

  let created = 0
  let updated = 0
  let removed = 0

  // Match existing commitments to action items by position (index order)
  for (let i = 0; i < actionItems.length; i++) {
    const ai = actionItems[i]
    const assigneeName = ai.assignee && ai.assignee !== 'Unassigned' ? ai.assignee : null
    const status = ai.done ? 'completed' : 'open'

    if (i < existing.length) {
      // Update existing commitment — preserve Jira/Asana links if not provided
      const c = existing[i]
      const changes: string[] = []
      const values: any[] = []

      if (c.text !== ai.text) { changes.push('text = ?'); values.push(ai.text) }
      if ((c.owner || 'you') !== (assigneeName ? assigneeName : 'you')) {
        changes.push('owner = ?'); values.push(assigneeName || 'you')
      }
      if (c.due_date !== (ai.dueDate || null)) { changes.push('due_date = ?'); values.push(ai.dueDate || null) }
      // Sync done status: action item done → commitment completed, not done → open
      if (ai.done && c.status !== 'completed') {
        changes.push('status = ?'); values.push('completed')
        changes.push('completed_at = ?'); values.push(now)
      } else if (!ai.done && c.status === 'completed') {
        changes.push('status = ?'); values.push('open')
        changes.push('completed_at = ?'); values.push(null)
      }
      // Sync Jira/Asana links from action item if present
      if (ai.jiraIssueKey !== undefined) { changes.push('jira_issue_key = ?'); values.push(ai.jiraIssueKey || null) }
      if (ai.jiraIssueUrl !== undefined) { changes.push('jira_issue_url = ?'); values.push(ai.jiraIssueUrl || null) }

      if (changes.length > 0) {
        changes.push('updated_at = ?'); values.push(now)
        values.push(c.id)
        db.prepare(`UPDATE commitments SET ${changes.join(', ')} WHERE id = ?`).run(...values)
        const u = getCommitment(c.id)
        if (u) logCommitmentSync('UPDATE', c.id, u)
        updated++
      }
    } else {
      // Create new commitment for this action item
      const id = randomUUID()
      db.prepare(`
        INSERT INTO commitments (id, note_id, text, owner, due_date, jira_issue_key, jira_issue_url, confidence, status, completed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'high', ?, ?, ?, ?)
      `).run(
        id, noteId, ai.text,
        assigneeName || 'you',
        ai.dueDate || null,
        ai.jiraIssueKey || null, ai.jiraIssueUrl || null,
        status, ai.done ? now : null,
        now, now
      )
      const c = getCommitment(id)
      if (c) logCommitmentSync('INSERT', id, c)
      created++
    }
  }

  // Remove extra commitments if action items were deleted
  for (let i = actionItems.length; i < existing.length; i++) {
    const c = existing[i]
    db.prepare('DELETE FROM commitments WHERE id = ?').run(c.id)
    logCommitmentSync('DELETE', c.id, null)
    removed++
  }

  if (created || updated || removed) {
    console.log(`[commitments] Synced for note ${noteId}: ${created} created, ${updated} updated, ${removed} removed`)
  }

  return { created, updated, removed }
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

// ── Risk Scoring + AMBER Notifications ─────────────────────────────
//
// Runs on the same 15-min interval as markOverdueCommitments (index.ts).
// Detects GREEN→AMBER transitions and fires macOS notifications.
// Risk level is computed at read time (daily-brief-assembler.ts),
// but amber_notified_at is persisted here to survive restarts.

import { Notification } from 'electron'

const AMBER_THRESHOLD_MS = 48 * 60 * 60 * 1000

export function checkAmberTransitions(): number {
  const db = getDb()
  const now = Date.now()
  let notified = 0

  // Find open commitments approaching due date that haven't been notified
  let candidates: any[]
  try {
    candidates = db.prepare(`
      SELECT c.id, c.text, c.due_date, c.owner, c.amber_notified_at,
             p.name as assignee_name
      FROM commitments c
      LEFT JOIN people p ON p.id = c.assignee_id
      WHERE c.status = 'open'
        AND c.due_date IS NOT NULL
        AND c.due_date GLOB '????-??-??*'
        AND c.amber_notified_at IS NULL
        AND (c.snoozed_until IS NULL OR datetime(c.snoozed_until) < datetime('now'))
    `).all() as any[]
  } catch (err: any) {
    // amber_notified_at column may not exist if migration 12 hasn't run yet
    if (/no such column/i.test(err.message)) {
      console.warn('[commitments] amber_notified_at column missing — migration pending. Skipping amber check.')
      return 0
    }
    throw err
  }

  for (const c of candidates) {
    try {
      const dueMs = new Date(c.due_date).getTime()
      if (isNaN(dueMs)) continue
      const msUntilDue = dueMs - now
      if (msUntilDue > 0 && msUntilDue <= AMBER_THRESHOLD_MS) {
        // GREEN → AMBER transition
        db.prepare('UPDATE commitments SET amber_notified_at = ? WHERE id = ?')
          .run(new Date().toISOString(), c.id)

        const owner = c.owner === 'you' ? 'You' : (c.assignee_name || c.owner)
        const notification = new Notification({
          title: 'Commitment due soon',
          body: `${owner}: ${c.text} — due ${c.due_date}`,
          silent: false,
        })
        notification.show()
        notified++
      }
    } catch { /* skip malformed */ }
  }

  if (notified > 0) {
    console.log(`[commitments] Sent ${notified} amber notification(s)`)
  }
  return notified
}

/**
 * Clear amber_notified_at when commitment returns to GREEN (due date extended)
 * or is completed. Called from updateCommitment/updateCommitmentStatus.
 */
export function clearAmberNotification(id: string): void {
  try {
    getDb().prepare('UPDATE commitments SET amber_notified_at = NULL WHERE id = ?').run(id)
  } catch (err: any) {
    if (/no such column/i.test(err.message)) return // migration pending
    throw err
  }
}

/**
 * Override snooze for RED commitments — if snoozed but now overdue, clear snooze.
 */
export function clearSnoozeForOverdue(): void {
  const result = getDb().prepare(`
    UPDATE commitments SET snoozed_until = NULL
    WHERE status = 'overdue' AND snoozed_until IS NOT NULL
  `).run()
  if ((result as any).changes > 0) {
    console.log(`[commitments] Cleared snooze for ${(result as any).changes} overdue commitment(s)`)
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
