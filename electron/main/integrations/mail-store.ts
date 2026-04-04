/**
 * Mail Store — local cache of Gmail thread metadata.
 *
 * Syncs from Gmail API and stores threads + person linkage locally
 * so mail data can feed into digest, routines, and people pages
 * without live API calls.
 */

import { getDb, getSetting } from '../storage/database'
import { fetchAllRecentGmailThreads, type GmailThread } from './google-gmail'

// ── Sync ───────────────────────────────────────────────────────────

let syncing = false

/**
 * Bulk-fetch recent Gmail threads and upsert into local cache.
 * Matches thread participants against the people table by email.
 * Guarded by a mutex to prevent concurrent syncs from corrupting data.
 */
export async function syncGmailThreads(accessToken?: string): Promise<{ ok: boolean; synced: number; error?: string }> {
  if (syncing) return { ok: true, synced: 0, error: 'Sync already in progress' }
  syncing = true
  try {
    return await _syncGmailThreadsInner(accessToken)
  } finally {
    syncing = false
  }
}

async function _syncGmailThreadsInner(accessToken?: string): Promise<{ ok: boolean; synced: number; error?: string }> {
  const token = accessToken || getSetting('google-access-token')
  if (!token) return { ok: false, synced: 0, error: 'No Google access token' }

  const result = await fetchAllRecentGmailThreads(token, 14, 50)
  if (!result.ok) return { ok: false, synced: 0, error: result.error }

  const db = getDb()

  // Build email→personId lookup from people table
  const people = db.prepare(`SELECT id, email FROM people WHERE email IS NOT NULL AND email != ''`).all() as { id: string; email: string }[]
  const emailToPersonId = new Map<string, string>()
  for (const p of people) {
    // Handle comma-separated or semicolon-separated emails
    for (const raw of p.email.split(/[,;]/)) {
      const e = raw.trim().toLowerCase()
      if (e) emailToPersonId.set(e, p.id)
    }
  }

  const upsertThread = db.prepare(`
    INSERT OR REPLACE INTO mail_threads (id, source, subject, snippet, from_address, from_name, to_addresses, date, message_count, raw_metadata, fetched_at)
    VALUES (?, 'gmail', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `)

  const deleteLinks = db.prepare(`DELETE FROM mail_thread_people WHERE thread_id = ?`)
  const insertLink = db.prepare(`INSERT OR IGNORE INTO mail_thread_people (thread_id, person_id) VALUES (?, ?)`)

  const upsertAll = db.transaction((threads: GmailThread[]) => {
    for (const t of threads) {
      // Parse from address
      const fromMatch = t.from.match(/<([^>]+)>/)
      const fromAddress = fromMatch ? fromMatch[1].toLowerCase() : t.from.toLowerCase()
      const fromName = t.from.split('<')[0].trim().replace(/"/g, '') || fromAddress

      upsertThread.run(
        t.id,
        t.subject,
        t.snippet,
        fromAddress,
        fromName,
        JSON.stringify(t.toAddresses || []),
        t.date,
        t.messageCount,
        null
      )

      // Link to people
      deleteLinks.run(t.id)
      const allAddresses = [fromAddress, ...(t.toAddresses || []).map((a: string) => a.toLowerCase())]
      const linked = new Set<string>()
      for (const addr of allAddresses) {
        const personId = emailToPersonId.get(addr)
        if (personId && !linked.has(personId)) {
          insertLink.run(t.id, personId)
          linked.add(personId)
        }
      }
    }
    return threads.length
  })

  try {
    const synced = upsertAll(result.threads)
    console.log(`[mail-store] Synced ${synced} Gmail threads`)
    return { ok: true, synced }
  } catch (err: any) {
    console.error('[mail-store] Sync failed:', err)
    return { ok: false, synced: 0, error: err.message }
  }
}

// ── Queries ────────────────────────────────────────────────────────

export interface MailThread {
  id: string
  source: string
  subject: string
  snippet: string | null
  from_address: string | null
  from_name: string | null
  date: string
  message_count: number
}

/** Get recent mail threads for a specific person. */
export function getMailThreadsForPerson(personId: string, limit = 5): MailThread[] {
  return getDb().prepare(`
    SELECT mt.* FROM mail_threads mt
    JOIN mail_thread_people mtp ON mtp.thread_id = mt.id
    WHERE mtp.person_id = ?
    ORDER BY mt.date DESC LIMIT ?
  `).all(personId, limit) as MailThread[]
}

/** Get all recent mail threads within a date range. */
export function getRecentMailThreads(daysPast = 7): MailThread[] {
  const since = localDate(-daysPast)
  return getDb().prepare(`
    SELECT * FROM mail_threads WHERE date >= ? ORDER BY date DESC
  `).all(since) as MailThread[]
}

/** Get mail stats for a date range. */
export function getMailStats(since: string): { threadCount: number; topCorrespondents: { name: string; threadCount: number }[] } {
  const db = getDb()
  const countResult = db.prepare(`SELECT COUNT(*) as cnt FROM mail_threads WHERE date >= ?`).get(since) as any
  const correspondents = db.prepare(`
    SELECT mt.from_name as name, COUNT(*) as threadCount
    FROM mail_threads mt
    WHERE mt.date >= ? AND mt.from_name IS NOT NULL AND mt.from_name != ''
    GROUP BY mt.from_name
    ORDER BY threadCount DESC LIMIT 5
  `).all(since) as { name: string; threadCount: number }[]

  return {
    threadCount: countResult?.cnt || 0,
    topCorrespondents: correspondents,
  }
}

/** Return YYYY-MM-DD in the user's local timezone. */
function localDate(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
