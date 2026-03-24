/**
 * Meeting Context Assembler
 *
 * Given attendee info and an event title, assembles relevant context
 * from the memory layer: previous meetings, open commitments,
 * KB search results, and project data.
 *
 * Used by the Command Center panel during active recording.
 */

import { getDb } from '../storage/database'

export interface MeetingContext {
  previousMeetings: Array<{
    personName: string
    meetings: Array<{ id: string; title: string; date: string }>
  }>
  openCommitments: Array<{
    text: string
    owner: string
    assignee: string | null
    dueDate: string | null
    isOverdue: boolean
  }>
  relatedNotes: Array<{
    title: string
    snippet: string
    score: number
  }>
  projects: Array<{
    id: string
    name: string
    meetingCount: number
    status: string
  }>
}

/**
 * Assemble meeting context for a set of attendees and event title.
 * Runs all queries in parallel for speed.
 */
export async function assembleContext(
  attendeeNames: string[],
  attendeeEmails: string[],
  eventTitle?: string
): Promise<MeetingContext> {
  const db = getDb()

  // 1. Resolve attendees to person IDs
  const personIds: Array<{ id: string; name: string }> = []
  for (const email of attendeeEmails) {
    if (!email) continue
    const person = db.prepare('SELECT id, name FROM people WHERE email = ?').get(email) as any
    if (person) personIds.push(person)
  }
  // Also try name matching for attendees without email matches
  for (const name of attendeeNames) {
    if (!name) continue
    if (personIds.some(p => p.name.toLowerCase() === name.toLowerCase())) continue
    const person = db.prepare('SELECT id, name FROM people WHERE LOWER(name) = LOWER(?)').get(name) as any
    if (person) personIds.push(person)
  }

  // 2. Previous meetings per person (last 5 each)
  const previousMeetings = personIds.map(person => {
    const meetings = db.prepare(`
      SELECT n.id, n.title, n.date
      FROM notes n
      JOIN note_people np ON np.note_id = n.id
      WHERE np.person_id = ?
      ORDER BY n.date DESC, n.time DESC
      LIMIT 5
    `).all(person.id) as any[]
    return { personName: person.name, meetings }
  }).filter(pm => pm.meetings.length > 0)

  // 3. Open commitments involving attendees
  const today = new Date().toISOString().slice(0, 10)
  const allOpenCommitments = db.prepare(`
    SELECT c.text, c.owner, c.due_date, p.name as assignee_name
    FROM commitments c
    LEFT JOIN people p ON p.id = c.assignee_id
    WHERE c.status = 'open'
    ORDER BY
      CASE WHEN c.due_date IS NULL THEN 1 ELSE 0 END,
      c.due_date ASC
  `).all() as any[]

  // Filter to commitments relevant to attendees (owner='you' with attendee as assignee, or vice versa)
  const attendeeIdSet = new Set(personIds.map(p => p.id))
  const openCommitments = allOpenCommitments
    .filter(c => {
      // "you" promised something to an attendee
      if (c.owner === 'you') return true
      // An attendee promised something
      const nameMatch = personIds.some(p => p.name.toLowerCase() === (c.owner || '').toLowerCase())
      return nameMatch
    })
    .slice(0, 10) // Limit to 10
    .map(c => ({
      text: c.text,
      owner: c.owner,
      assignee: c.assignee_name || null,
      dueDate: c.due_date || null,
      isOverdue: c.due_date ? c.due_date < today : false,
    }))

  // 4. Related notes via KB search (if eventTitle provided)
  let relatedNotes: MeetingContext['relatedNotes'] = []
  if (eventTitle) {
    try {
      const { searchKB } = await import('../knowledge-base/kb-store')
      const results = searchKB(eventTitle, 5)
      relatedNotes = results.map((r: any) => ({
        title: r.file_name || r.fileName || 'Untitled',
        snippet: (r.content || '').slice(0, 150),
        score: r.score || 0,
      }))
    } catch {
      // KB might not be configured — that's fine
    }
  }

  // 5. Projects linked to these attendees
  const projects: MeetingContext['projects'] = []
  if (personIds.length > 0) {
    const placeholders = personIds.map(() => '?').join(',')
    const projectRows = db.prepare(`
      SELECT DISTINCT p.id, p.name, p.status,
        (SELECT COUNT(*) FROM note_projects np2 WHERE np2.project_id = p.id) as meetingCount
      FROM projects p
      JOIN note_projects np ON np.project_id = p.id
      JOIN note_people npe ON npe.note_id = np.note_id
      WHERE npe.person_id IN (${placeholders})
        AND p.status IN ('active', 'suggested')
      ORDER BY meetingCount DESC
      LIMIT 5
    `).all(...personIds.map(p => p.id)) as any[]
    projects.push(...projectRows.map(r => ({
      id: r.id,
      name: r.name,
      meetingCount: r.meetingCount,
      status: r.status,
    })))
  }

  // Also check calendar title for project match
  if (eventTitle) {
    try {
      const { parseProjectFromCalendarTitle } = await import('./project-store')
      const calendarProject = parseProjectFromCalendarTitle(eventTitle)
      if (calendarProject) {
        const match = db.prepare('SELECT id, name, status FROM projects WHERE LOWER(name) = LOWER(?)').get(calendarProject) as any
        if (match && !projects.some(p => p.id === match.id)) {
          const count = db.prepare('SELECT COUNT(*) as cnt FROM note_projects WHERE project_id = ?').get(match.id) as any
          projects.unshift({ id: match.id, name: match.name, meetingCount: count?.cnt || 0, status: match.status })
        }
      }
    } catch {
      // Project store might not be ready
    }
  }

  return { previousMeetings, openCommitments, relatedNotes, projects }
}
