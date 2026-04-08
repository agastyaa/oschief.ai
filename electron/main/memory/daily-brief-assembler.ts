/**
 * Daily Brief Assembler
 *
 * Single source of truth for the proactive intelligence layer.
 * Computes commitment risk levels, detects stale decisions, and
 * assembles structured data for the home page and morning brief routine.
 *
 * DATA FLOW:
 *   daily-brief-assembler.ts (structured data)
 *         │
 *         ├──→ IPC handler → Index.tsx (home page rendering)
 *         │
 *         └──→ routines-data.ts (formats as text) → LLM → notification
 *
 *   context-assembler.ts stays scoped to live meeting prep only.
 */

import { getDb } from '../storage/database'

// ── Types ──────────────────────────────────────────────────────────

export type RiskLevel = 'green' | 'amber' | 'red'

export interface RiskCommitment {
  id: string
  text: string
  owner: string
  assignee_name: string | null
  due_date: string
  risk_level: RiskLevel
  days_until_due: number
  note_id: string | null
  note_title: string | null
  snoozed_until: string | null
  amber_notified_at: string | null
}

export interface StaleDecision {
  id: string
  text: string
  context: string | null
  status: string
  date: string
  updated_at: string
  days_stale: number
  note_id: string | null
  note_title: string | null
  project_name: string | null
}

export interface DailyBriefData {
  riskCommitments: RiskCommitment[]
  staleDecisions: StaleDecision[]
  todayMeetingCount: number
  overdueSummary: { amber: number; red: number }
}

// ── Risk Level Computation ─────────────────────────────────────────

const MS_PER_DAY = 86_400_000
const AMBER_THRESHOLD_HOURS = 48
const STALE_THRESHOLD_DAYS = 14

/**
 * Compute risk levels for all open/overdue commitments with due dates.
 * GREEN: >72h until due
 * AMBER: ≤48h until due, not yet completed
 * RED: overdue (past due date)
 *
 * Undated commitments are excluded — they appear only in CommitmentsPage.
 */
export function computeRiskLevels(): RiskCommitment[] {
  const db = getDb()
  let rows: any[]
  try {
    rows = db.prepare(`
      SELECT c.id, c.text, c.owner, c.due_date, c.note_id, c.snoozed_until, c.amber_notified_at,
             p.name as assignee_name, n.title as note_title
      FROM commitments c
      LEFT JOIN people p ON p.id = c.assignee_id
      LEFT JOIN notes n ON n.id = c.note_id
      WHERE c.status IN ('open', 'overdue')
        AND c.due_date IS NOT NULL
        AND c.due_date GLOB '????-??-??*'
      ORDER BY c.due_date ASC
    `).all() as any[]
  } catch (err: any) {
    if (/no such column/i.test(err.message)) {
      // Fallback: query without amber_notified_at if migration 12 hasn't run
      rows = db.prepare(`
        SELECT c.id, c.text, c.owner, c.due_date, c.note_id, c.snoozed_until,
               p.name as assignee_name, n.title as note_title
        FROM commitments c
        LEFT JOIN people p ON p.id = c.assignee_id
        LEFT JOIN notes n ON n.id = c.note_id
        WHERE c.status IN ('open', 'overdue')
          AND c.due_date IS NOT NULL
          AND c.due_date GLOB '????-??-??*'
        ORDER BY c.due_date ASC
      `).all() as any[]
    } else {
      throw err
    }
  }

  const now = Date.now()

  return rows.map(row => {
    let dueMs: number
    try {
      dueMs = new Date(row.due_date).getTime()
      if (isNaN(dueMs)) return null // malformed date — skip
    } catch {
      return null
    }

    const msUntilDue = dueMs - now
    const daysUntilDue = Math.ceil(msUntilDue / MS_PER_DAY)
    const hoursUntilDue = msUntilDue / (1000 * 60 * 60)

    let risk_level: RiskLevel
    if (msUntilDue < 0) {
      risk_level = 'red'
    } else if (hoursUntilDue <= AMBER_THRESHOLD_HOURS) {
      risk_level = 'amber'
    } else {
      risk_level = 'green'
    }

    return {
      id: row.id,
      text: row.text,
      owner: row.owner,
      assignee_name: row.assignee_name,
      due_date: row.due_date,
      risk_level,
      days_until_due: daysUntilDue,
      note_id: row.note_id,
      note_title: row.note_title,
      snoozed_until: row.snoozed_until,
      amber_notified_at: row.amber_notified_at,
    } as RiskCommitment
  }).filter((r): r is RiskCommitment => r !== null)
}

// ── Stale Decision Detection ───────────────────────────────────────

/**
 * Find decisions that haven't been updated in >14 days and aren't DONE/ABANDONED.
 */
export function getStaleDecisions(): StaleDecision[] {
  const db = getDb()
  return db.prepare(`
    SELECT d.id, d.text, d.context, d.status, d.date, d.updated_at, d.note_id,
           n.title as note_title, pr.name as project_name,
           CAST(julianday('now') - julianday(d.updated_at) AS INTEGER) as days_stale
    FROM decisions d
    LEFT JOIN notes n ON n.id = d.note_id
    LEFT JOIN projects pr ON pr.id = d.project_id
    WHERE d.status NOT IN ('DONE', 'ABANDONED')
      AND d.updated_at IS NOT NULL
      AND d.updated_at < datetime('now', '-${STALE_THRESHOLD_DAYS} days')
    ORDER BY d.updated_at ASC
  `).all() as StaleDecision[]
}

// ── Daily Brief Assembly ───────────────────────────────────────────

/**
 * Assemble the full daily brief: risk commitments + stale decisions +
 * today's meeting count. This is the single source of truth — both the
 * home page and the morning brief routine consume this.
 */
export function assembleDailyBrief(): DailyBriefData {
  const riskCommitments = computeRiskLevels()
  const staleDecisions = getStaleDecisions()

  // Count today's calendar events
  const db = getDb()
  const today = localDate()
  const todayNotes = db.prepare(`
    SELECT COUNT(*) as cnt FROM notes WHERE date = ?
  `).get(today) as any
  const todayMeetingCount = todayNotes?.cnt ?? 0

  const amber = riskCommitments.filter(c => c.risk_level === 'amber').length
  const red = riskCommitments.filter(c => c.risk_level === 'red').length

  return {
    riskCommitments,
    staleDecisions,
    todayMeetingCount,
    overdueSummary: { amber, red },
  }
}

// ── Follow-up Draft Generation ─────────────────────────────────────

/**
 * Generate a follow-up message for a commitment.
 *
 * FLOW:
 *   1. Query commitment + context from DB
 *   2. Try LLM-powered draft (warm, contextual, references the meeting)
 *   3. Fall back to template on LLM timeout, refusal, or error
 *
 * Returns plain text for clipboard.
 */
export async function generateFollowUpDraft(commitmentId: string): Promise<string | null> {
  const db = getDb()
  const row = db.prepare(`
    SELECT c.text, c.owner, p.name as assignee_name, p.email as assignee_email,
           n.title as note_title, n.date as note_date
    FROM commitments c
    LEFT JOIN people p ON p.id = c.assignee_id
    LEFT JOIN notes n ON n.id = c.note_id
    WHERE c.id = ?
  `).get(commitmentId) as any

  if (!row) return null

  const name = row.assignee_name || row.owner || 'there'
  const meetingRef = row.note_title && row.note_date
    ? `from our "${row.note_title}" on ${row.note_date}`
    : ''

  // Template fallback (used if LLM fails or is unavailable)
  const templateDraft = `Hi ${name}, following up on: ${row.text}${meetingRef ? ` (${meetingRef})` : ''}. Let me know if you need anything.`

  // Try LLM-powered draft
  try {
    const { routeLLM } = await import('../cloud/router')
    const { resolveSelectedAIModel } = await import('../models/model-resolver')
    const model = resolveSelectedAIModel()

    if (!model) return templateDraft

    const prompt = `Write a brief, warm follow-up message for a work commitment. Keep it natural — 2-3 sentences, professional but not stiff. Reference the specific commitment and meeting context.

Commitment: "${row.text}"
Person: ${name}
${meetingRef ? `Context: ${meetingRef}` : ''}
${row.assignee_email ? `Their email: ${row.assignee_email}` : ''}

Write ONLY the message body (no subject line, no "Hi [name]," — the user will add their own greeting). Start with the follow-up directly.`

    // Race against 10s timeout
    const llmPromise = routeLLM(
      [
        { role: 'system', content: 'You write concise, warm professional follow-up messages. No fluff, no corporate speak. Sound like a real person.' },
        { role: 'user', content: prompt },
      ],
      model
    )
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 10_000)
    )

    const response = await Promise.race([llmPromise, timeoutPromise])
    const draft = (response as string).trim()

    // Sanity check: if LLM returned something too short or too long, fall back
    if (draft.length < 10 || draft.length > 500) return templateDraft

    return `Hi ${name}, ${draft}`
  } catch (err) {
    console.warn('[follow-up-draft] LLM failed, using template:', err)
    return templateDraft
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function localDate(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
