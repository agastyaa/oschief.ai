import { randomUUID } from 'crypto'
import { getDb } from '../storage/database'
import { isSyncEnabled, getChangeLogger } from '../storage/icloud-sync'

function logPeopleSync(op: 'INSERT' | 'UPDATE' | 'DELETE', id: string, data: Record<string, any> | null): void {
  if (!isSyncEnabled()) return
  getChangeLogger()?.logChange('people', op, id, data)
}

function logNotePeopleSync(op: 'INSERT' | 'DELETE', noteId: string, personId: string, data: Record<string, any> | null): void {
  if (!isSyncEnabled()) return
  getChangeLogger()?.logChange('note_people', op, `${noteId}::${personId}`, data)
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

export function getAllPeople(): any[] {
  return getDb().prepare(`
    SELECT p.*, COALESCE(mc.cnt, 0) as meetingCount
    FROM people p
    LEFT JOIN (SELECT person_id, COUNT(*) as cnt FROM note_people GROUP BY person_id) mc
      ON mc.person_id = p.id
    ORDER BY p.last_seen DESC
  `).all() as any[]
}

export function getPerson(id: string): any | null {
  return getDb().prepare('SELECT * FROM people WHERE id = ?').get(id) as any ?? null
}

export function upsertPerson(data: { name: string; email?: string; company?: string; role?: string; relationship?: string; notes?: string }, opts?: { forceCreate?: boolean }): any {
  const db = getDb()
  const now = new Date().toISOString()

  // forceCreate: user explicitly clicked "+ Create", skip all matching — always insert
  if (!opts?.forceCreate) {
    // Email-first matching
    if (data.email) {
      const existing = db.prepare('SELECT * FROM people WHERE email = ?').get(data.email) as any
      if (existing) {
        const fields: string[] = []
        const values: any[] = []
        if (data.name) { fields.push('name = ?'); values.push(data.name) }
        if (data.company !== undefined) { fields.push('company = ?'); values.push(data.company) }
        if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role) }
        if (data.relationship !== undefined) { fields.push('relationship = ?'); values.push(data.relationship) }
        fields.push('last_seen = ?'); values.push(now)
        values.push(existing.id)
        db.prepare(`UPDATE people SET ${fields.join(', ')} WHERE id = ?`).run(...values)
        const updated = getPerson(existing.id)
        if (updated) logPeopleSync('UPDATE', existing.id, updated)
        return updated
      }
    }

    // Fuzzy name matching
    if (data.name.length > 3) {
      const allPeople = db.prepare('SELECT * FROM people').all() as any[]
      const nameLower = data.name.toLowerCase()
      for (const person of allPeople) {
        if (levenshteinDistance(nameLower, person.name.toLowerCase()) <= 3) {
          db.prepare('UPDATE people SET last_seen = ? WHERE id = ?').run(now, person.id)
          return getPerson(person.id)
        }
      }
    }
  }

  // Create new
  const id = randomUUID()
  db.prepare(`
    INSERT INTO people (id, name, email, company, role, relationship, notes, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.email ?? null, data.company ?? null, data.role ?? null, data.relationship ?? null, data.notes ?? null, now, now)
  const created = getPerson(id)
  if (created) logPeopleSync('INSERT', id, created)
  return created
}

export function deletePerson(id: string): boolean {
  const db = getDb()
  db.prepare('DELETE FROM note_people WHERE person_id = ?').run(id)
  db.prepare('UPDATE commitments SET assignee_id = NULL WHERE assignee_id = ?').run(id)
  const result = db.prepare('DELETE FROM people WHERE id = ?').run(id)
  if ((result as any).changes > 0) logPeopleSync('DELETE', id, null)
  return (result as any).changes > 0
}

export function mergePeople(keepId: string, mergeId: string): boolean {
  const db = getDb()
  const merge = db.transaction(() => {
    // Re-link note_people rows, skip duplicates
    const existing = db.prepare('SELECT note_id FROM note_people WHERE person_id = ?').all(keepId) as any[]
    const existingNoteIds = new Set(existing.map((r: any) => r.note_id))
    const toMerge = db.prepare('SELECT note_id, role FROM note_people WHERE person_id = ?').all(mergeId) as any[]
    for (const row of toMerge) {
      if (!existingNoteIds.has(row.note_id)) {
        db.prepare('INSERT INTO note_people (note_id, person_id, role) VALUES (?, ?, ?)').run(row.note_id, keepId, row.role)
      }
    }
    // Re-link commitments
    db.prepare('UPDATE commitments SET assignee_id = ? WHERE assignee_id = ?').run(keepId, mergeId)
    // Delete merged person (cascade deletes their note_people rows)
    db.prepare('DELETE FROM people WHERE id = ?').run(mergeId)
  })
  merge()
  return true
}

export function getPersonMeetings(personId: string): any[] {
  return getDb().prepare(`
    SELECT n.id, n.title, n.date, n.time, n.duration, n.time_range, np.role
    FROM notes n
    JOIN note_people np ON np.note_id = n.id
    WHERE np.person_id = ?
    ORDER BY n.date DESC, n.time DESC
  `).all(personId) as any[]
}

export function linkPersonToNote(noteId: string, personId: string, role?: string): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO note_people (note_id, person_id, role) VALUES (?, ?, ?)
  `).run(noteId, personId, role ?? 'attendee')
  logNotePeopleSync('INSERT', noteId, personId, { note_id: noteId, person_id: personId, role: role ?? 'attendee' })
}

export function getNotePeople(noteId: string): any[] {
  return getDb().prepare(`
    SELECT p.*, np.role as meeting_role
    FROM people p
    JOIN note_people np ON np.person_id = p.id
    WHERE np.note_id = ?
  `).all(noteId) as any[]
}

export function updatePerson(id: string, data: { name?: string; email?: string; company?: string; role?: string; relationship?: string; notes?: string }): boolean {
  const db = getDb()
  const fields: string[] = []
  const values: any[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email || null) }
  if (data.company !== undefined) { fields.push('company = ?'); values.push(data.company || null) }
  if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role || null) }
  if (data.relationship !== undefined) { fields.push('relationship = ?'); values.push(data.relationship || null) }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes || null) }
  if (fields.length === 0) return false
  values.push(id)
  db.prepare(`UPDATE people SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  const updated = getPerson(id)
  if (updated) logPeopleSync('UPDATE', id, updated)
  return true
}

/**
 * Batch import people from calendar events.
 *
 * Loads the entire people table into memory ONCE, then fuzzy-matches each
 * attendee against the in-memory index. Much faster than calling upsertPerson()
 * in a loop (which does a full table scan per call).
 *
 * FLOW:
 *   Load people into memory → for each attendee:
 *     1. Email match? → update last_seen
 *     2. Fuzzy name match (Levenshtein ≤ 3)? → update last_seen
 *     3. No match → insert new person
 *   All wrapped in a single transaction for atomicity.
 *
 * Returns: { created: number, updated: number, total: number }
 */
export function batchImportFromCalendar(
  attendees: Array<{ name: string; email?: string }>
): { created: number; updated: number; total: number } {
  const db = getDb()
  const now = new Date().toISOString()

  // Deduplicate input attendees by email (prefer first occurrence)
  const seen = new Set<string>()
  const unique: Array<{ name: string; email?: string }> = []
  for (const a of attendees) {
    if (!a.name || a.name.trim().length < 2) continue
    const key = a.email?.toLowerCase() || a.name.toLowerCase().trim()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push({ name: a.name.trim(), email: a.email?.trim() || undefined })
  }

  // Load existing people into memory for fast matching
  const existing = db.prepare('SELECT id, name, email FROM people').all() as Array<{ id: string; name: string; email: string | null }>
  const emailIndex = new Map<string, string>() // email → id
  const nameIndex: Array<{ id: string; nameLower: string }> = []
  for (const p of existing) {
    if (p.email) emailIndex.set(p.email.toLowerCase(), p.id)
    if (p.name) nameIndex.push({ id: p.id, nameLower: p.name.toLowerCase() })
  }

  let created = 0
  let updated = 0

  const importAll = db.transaction(() => {
    for (const attendee of unique) {
      // 1. Email match
      if (attendee.email) {
        const matchId = emailIndex.get(attendee.email.toLowerCase())
        if (matchId) {
          db.prepare('UPDATE people SET last_seen = ? WHERE id = ?').run(now, matchId)
          updated++
          continue
        }
      }

      // 2. Fuzzy name match
      const nameLower = attendee.name.toLowerCase()
      let fuzzyMatch = false
      if (nameLower.length > 3) {
        for (const entry of nameIndex) {
          if (levenshteinDistance(nameLower, entry.nameLower) <= 3) {
            db.prepare('UPDATE people SET last_seen = ? WHERE id = ?').run(now, entry.id)
            // If attendee has email and existing person doesn't, add it
            if (attendee.email) {
              db.prepare('UPDATE people SET email = ? WHERE id = ? AND (email IS NULL OR email = "")').run(attendee.email, entry.id)
            }
            updated++
            fuzzyMatch = true
            break
          }
        }
      }
      if (fuzzyMatch) continue

      // 3. Create new person
      const id = randomUUID()
      db.prepare(`
        INSERT INTO people (id, name, email, company, role, relationship, notes, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, attendee.name, attendee.email ?? null, null, null, null, null, now, now)
      logPeopleSync('INSERT', id, { id, name: attendee.name, email: attendee.email ?? null })

      // Add to in-memory index for subsequent matches within this batch
      if (attendee.email) emailIndex.set(attendee.email.toLowerCase(), id)
      nameIndex.push({ id, nameLower: nameLower })
      created++
    }
  })

  importAll()

  console.log(`[people-store] Calendar import: ${created} created, ${updated} updated, ${unique.length} total attendees`)
  return { created, updated, total: unique.length }
}

export function unlinkPersonFromNote(noteId: string, personId: string): boolean {
  const result = getDb().prepare('DELETE FROM note_people WHERE note_id = ? AND person_id = ?').run(noteId, personId)
  if ((result as any).changes > 0) logNotePeopleSync('DELETE', noteId, personId, null)
  return (result as any).changes > 0
}
