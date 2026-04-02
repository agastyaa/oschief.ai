/**
 * Lenny's Podcast Transcript Knowledge Base — FTS5 query API.
 *
 * Searches a sidecar SQLite DB of 303 podcast episode transcripts
 * to ground coaching insights in real practitioner quotes.
 *
 * The DB is built at release time by scripts/build-transcript-db.ts
 * and shipped in resources/lenny-transcripts.db.
 */

import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'

export interface TranscriptPassage {
  text: string
  guest: string
  episodeTitle: string
  youtubeUrl?: string
  rank: number
}

let db: any = null
let dbUnavailable = false

function getDbPath(): string {
  // In packaged app: resources/lenny-transcripts.db
  // In dev: resources/lenny-transcripts.db (project root)
  const isPacked = app.isPackaged
  if (isPacked) {
    return join(process.resourcesPath, 'lenny-transcripts.db')
  }
  return join(app.getAppPath(), 'resources', 'lenny-transcripts.db')
}

function getDb(): any | null {
  if (db) return db
  if (dbUnavailable) return null

  const dbPath = getDbPath()
  if (!existsSync(dbPath)) {
    console.warn('[transcript-kb] Database not found:', dbPath)
    dbUnavailable = true
    return null
  }

  try {
    const Database = require('better-sqlite3')
    db = new Database(dbPath, { readonly: true })
    db.pragma('journal_mode = WAL')
    console.log('[transcript-kb] Opened transcript KB:', dbPath)
    return db
  } catch (err: any) {
    console.warn('[transcript-kb] Failed to open database:', err.message)
    dbUnavailable = true
    return null
  }
}

/**
 * Search the podcast transcript KB for passages relevant to a query.
 *
 * @param query  Natural language search query (e.g. "product roadmap prioritization")
 * @param limit  Max passages to return (default 5)
 * @returns Ranked passages with guest/episode attribution, or empty array if DB unavailable
 */
export function searchTranscriptKB(query: string, limit = 5): TranscriptPassage[] {
  const connection = getDb()
  if (!connection) return []

  const trimmed = query.trim()
  if (!trimmed) return []

  try {
    // FTS5 query: use double-quotes for phrase matching, OR for flexibility
    // Split query into words and join with OR for broader matching
    const ftsQuery = trimmed
      .replace(/['"]/g, '') // strip quotes
      .split(/\s+/)
      .filter(w => w.length > 2)
      .join(' OR ')

    if (!ftsQuery) return []

    const stmt = connection.prepare(`
      SELECT
        p.text,
        e.guest,
        e.title AS episodeTitle,
        e.youtube_url AS youtubeUrl,
        bm25(passages_fts) AS rank
      FROM passages_fts
      JOIN passages p ON p.id = passages_fts.rowid
      JOIN episodes e ON e.id = p.episode_id
      WHERE passages_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)

    const rows = stmt.all(ftsQuery, limit)
    return rows.map((r: any) => ({
      text: r.text,
      guest: r.guest,
      episodeTitle: r.episodeTitle,
      youtubeUrl: r.youtubeUrl || undefined,
      rank: r.rank,
    }))
  } catch (err: any) {
    console.warn('[transcript-kb] Search failed:', err.message)
    return []
  }
}

/**
 * Get the total number of episodes and passages in the KB.
 * Returns null if DB is unavailable.
 */
export function getTranscriptKBStats(): { episodes: number; passages: number } | null {
  const connection = getDb()
  if (!connection) return null

  try {
    const episodes = connection.prepare('SELECT COUNT(*) AS c FROM episodes').get() as any
    const passages = connection.prepare('SELECT COUNT(*) AS c FROM passages').get() as any
    return { episodes: episodes.c, passages: passages.c }
  } catch {
    return null
  }
}
