/**
 * Routines Data Assembler
 *
 * Builds the context string for each routine type by querying
 * the meeting graph stores. The output is passed to the LLM
 * as the user message alongside the routine's prompt.
 */

import { getDb } from '../storage/database'
import type { RoutineConfig } from './routines-engine'

export async function assembleRoutineData(routine: RoutineConfig): Promise<string> {
  switch (routine.builtin_type) {
    case 'morning_briefing': return assembleMorningBriefing()
    case 'weekly_recap': return assembleWeeklyRecap()
    case 'overdue_commitments': return assembleOverdueCommitments()
    default: return assembleCustom(routine.data_query)
  }
}

// ── Morning Briefing ────────────────────────────────────────────────

async function assembleMorningBriefing(): Promise<string> {
  const db = getDb()
  const parts: string[] = []
  const today = new Date().toISOString().slice(0, 10)

  // Today's notes (already recorded today)
  const todayNotes = db.prepare(`
    SELECT title, date, time FROM notes WHERE date = ? ORDER BY time ASC
  `).all(today) as any[]
  if (todayNotes.length > 0) {
    parts.push(`Already recorded today: ${todayNotes.map(n => n.title || 'Untitled').join(', ')}`)
  }

  // Open commitments (overdue + due today)
  const commitments = db.prepare(`
    SELECT c.text, c.owner, c.due_date, p.name as assignee_name
    FROM commitments c
    LEFT JOIN people p ON p.id = c.assignee_id
    WHERE c.status = 'open'
    ORDER BY c.due_date ASC NULLS LAST
    LIMIT 10
  `).all() as any[]

  const overdue = commitments.filter(c => c.due_date && c.due_date < today)
  const dueToday = commitments.filter(c => c.due_date === today)

  if (overdue.length > 0) {
    parts.push('Overdue commitments:')
    for (const c of overdue) {
      const days = Math.floor((Date.now() - new Date(c.due_date).getTime()) / 86400000)
      parts.push(`  - ${c.owner === 'you' ? 'You' : c.assignee_name || c.owner}: ${c.text} (${days}d overdue)`)
    }
  }
  if (dueToday.length > 0) {
    parts.push('Due today:')
    for (const c of dueToday) {
      parts.push(`  - ${c.owner === 'you' ? 'You' : c.assignee_name || c.owner}: ${c.text}`)
    }
  }

  // Active projects
  const projects = db.prepare(`
    SELECT p.name, p.status,
      (SELECT COUNT(*) FROM note_projects np WHERE np.project_id = p.id) as meetingCount
    FROM projects p WHERE p.status = 'active'
    ORDER BY p.updated_at DESC LIMIT 5
  `).all() as any[]
  if (projects.length > 0) {
    parts.push('Active projects: ' + projects.map(p => `${p.name} (${p.meetingCount} meetings)`).join(', '))
  }

  // Recent meetings (last 3 days for context)
  const recentNotes = db.prepare(`
    SELECT n.title, n.date, GROUP_CONCAT(p.name, ', ') as attendees
    FROM notes n
    LEFT JOIN note_people np ON np.note_id = n.id
    LEFT JOIN people p ON p.id = np.person_id
    WHERE n.date >= date('now', '-3 days') AND n.date < ?
    GROUP BY n.id
    ORDER BY n.date DESC, n.time DESC
    LIMIT 5
  `).all(today) as any[]
  if (recentNotes.length > 0) {
    parts.push('Recent meetings:')
    for (const n of recentNotes) {
      parts.push(`  - ${n.date}: ${n.title || 'Untitled'}${n.attendees ? ` (with ${n.attendees})` : ''}`)
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'No meetings, commitments, or projects found yet. The user is just getting started with OSChief.'
}

// ── Weekly Recap ────────────────────────────────────────────────────

async function assembleWeeklyRecap(): Promise<string> {
  const db = getDb()
  const parts: string[] = []

  // Notes from past 7 days
  const weekNotes = db.prepare(`
    SELECT n.id, n.title, n.date FROM notes
    WHERE date >= date('now', '-7 days')
    ORDER BY date DESC
  `).all() as any[]
  parts.push(`Meetings this week: ${weekNotes.length}`)
  if (weekNotes.length > 0) {
    parts.push('  ' + weekNotes.map(n => `${n.date}: ${n.title || 'Untitled'}`).join('\n  '))
  }

  // Commitments stats
  const created = db.prepare(`SELECT COUNT(*) as cnt FROM commitments WHERE created_at >= date('now', '-7 days')`).get() as any
  const completed = db.prepare(`SELECT COUNT(*) as cnt FROM commitments WHERE status = 'completed' AND completed_at >= date('now', '-7 days')`).get() as any
  const overdue = db.prepare(`SELECT COUNT(*) as cnt FROM commitments WHERE status = 'open' AND due_date < date('now')`).get() as any
  parts.push(`Commitments: ${created?.cnt || 0} created, ${completed?.cnt || 0} completed, ${overdue?.cnt || 0} overdue`)

  // Decisions this week
  const decisions = db.prepare(`
    SELECT d.text, n.title as note_title FROM decisions d
    LEFT JOIN notes n ON n.id = d.note_id
    WHERE d.created_at >= date('now', '-7 days')
    ORDER BY d.created_at DESC
  `).all() as any[]
  parts.push(`Decisions made: ${decisions.length}`)
  for (const d of decisions.slice(0, 5)) {
    parts.push(`  - ${d.text}${d.note_title ? ` (from: ${d.note_title})` : ''}`)
  }

  // People frequency
  const peopleSeen = db.prepare(`
    SELECT p.name, COUNT(np.note_id) as cnt
    FROM people p
    JOIN note_people np ON np.person_id = p.id
    JOIN notes n ON n.id = np.note_id
    WHERE n.date >= date('now', '-7 days')
    GROUP BY p.id
    ORDER BY cnt DESC
    LIMIT 5
  `).all() as any[]
  if (peopleSeen.length > 0) {
    parts.push('Most-seen people: ' + peopleSeen.map(p => `${p.name} (${p.cnt})`).join(', '))
  }

  // Active projects
  const projects = db.prepare(`
    SELECT p.name,
      (SELECT COUNT(*) FROM note_projects np JOIN notes n2 ON n2.id = np.note_id WHERE np.project_id = p.id AND n2.date >= date('now', '-7 days')) as weekMeetings
    FROM projects p WHERE p.status = 'active'
  `).all() as any[]
  const activeProjects = projects.filter((p: any) => p.weekMeetings > 0)
  if (activeProjects.length > 0) {
    parts.push('Active projects: ' + activeProjects.map((p: any) => `${p.name} (${p.weekMeetings} meetings)`).join(', '))
  }

  return parts.join('\n')
}

// ── Overdue Commitments ─────────────────────────────────────────────

async function assembleOverdueCommitments(): Promise<string> {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)

  const overdue = db.prepare(`
    SELECT c.text, c.owner, c.due_date, p.name as assignee_name, n.title as note_title
    FROM commitments c
    LEFT JOIN people p ON p.id = c.assignee_id
    LEFT JOIN notes n ON n.id = c.note_id
    WHERE c.status = 'open' AND c.due_date < ?
    ORDER BY c.due_date ASC
  `).all(today) as any[]

  if (overdue.length === 0) return 'No overdue commitments.'

  const lines = [`${overdue.length} overdue commitment${overdue.length > 1 ? 's' : ''}:`]
  for (const c of overdue) {
    const days = Math.floor((Date.now() - new Date(c.due_date).getTime()) / 86400000)
    const owner = c.owner === 'you' ? 'You' : (c.assignee_name || c.owner)
    lines.push(`- ${owner}: "${c.text}" — ${days} days overdue (due ${c.due_date})${c.note_title ? ` from "${c.note_title}"` : ''}`)
  }
  return lines.join('\n')
}

// ── Custom Routine ──────────────────────────────────────────────────

async function assembleCustom(dataQueryJson: string | null): Promise<string> {
  const db = getDb()
  const parts: string[] = []
  const dataQuery = dataQueryJson ? JSON.parse(dataQueryJson) : {}

  // Recent notes (last 14 days)
  const notes = db.prepare(`
    SELECT n.title, n.date, n.summary FROM notes
    WHERE date >= date('now', '-14 days')
    ORDER BY date DESC LIMIT 20
  `).all() as any[]
  parts.push(`Recent meetings (${notes.length}):`)
  for (const n of notes) {
    const overview = n.summary ? JSON.parse(n.summary)?.overview?.slice(0, 100) : ''
    parts.push(`  - ${n.date}: ${n.title || 'Untitled'}${overview ? ` — ${overview}` : ''}`)
  }

  // Open commitments
  const commitments = db.prepare(`
    SELECT c.text, c.owner, c.due_date FROM commitments
    WHERE status = 'open' ORDER BY due_date ASC NULLS LAST LIMIT 10
  `).all() as any[]
  if (commitments.length > 0) {
    parts.push(`Open commitments (${commitments.length}):`)
    for (const c of commitments) {
      parts.push(`  - ${c.owner}: ${c.text}${c.due_date ? ` (due ${c.due_date})` : ''}`)
    }
  }

  // Active projects
  const projects = db.prepare(`SELECT name, status FROM projects WHERE status = 'active'`).all() as any[]
  if (projects.length > 0) {
    parts.push('Active projects: ' + projects.map((p: any) => p.name).join(', '))
  }

  // If project-specific query
  if (dataQuery.project) {
    const project = db.prepare('SELECT * FROM projects WHERE LOWER(name) = LOWER(?)').get(dataQuery.project) as any
    if (project) {
      const projDecisions = db.prepare(`
        SELECT text, date FROM decisions WHERE project_id = ? ORDER BY created_at DESC LIMIT 10
      `).all(project.id) as any[]
      if (projDecisions.length > 0) {
        parts.push(`Decisions for "${project.name}":`)
        for (const d of projDecisions) { parts.push(`  - ${d.text}`) }
      }
    }
  }

  return parts.join('\n')
}
