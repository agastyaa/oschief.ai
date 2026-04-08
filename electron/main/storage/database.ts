import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync, existsSync, copyFileSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { createHash } from 'crypto'
import { runMigrations } from './migrations'
import type { SyncableTable } from './sync-types'

let db: Database.Database | null = null
let syncLogFn: ((table: SyncableTable, op: 'INSERT' | 'UPDATE' | 'DELETE', entityId: string, data: Record<string, any> | null) => void) | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

/**
 * Migrate data from old "Syag" app directory to new "OSChief" directory.
 * Copies the database and secure keychain if they exist at the old location.
 * Only runs once — skips if the new location already has data.
 */
function migrateFromSyagIfNeeded(): void {
  const { statSync } = require('fs')
  const newDataDir = join(app.getPath('userData'), 'data')
  const newDbPath = join(newDataDir, 'syag.db')
  const oldDataDir = join(homedir(), 'Library', 'Application Support', 'Syag', 'data')
  const oldDbPath = join(oldDataDir, 'syag.db')

  if (!existsSync(oldDbPath)) return

  // Check if migration needed: no new DB, or old DB is significantly larger (WAL data was lost)
  let needsMigration = !existsSync(newDbPath)
  if (!needsMigration) {
    try {
      const oldSize = statSync(oldDbPath).size
      const newSize = statSync(newDbPath).size
      // If old DB is >2x larger, the initial copy missed WAL data — re-copy
      if (oldSize > newSize * 2 && oldSize > 100000) {
        console.log(`[database] Old DB (${oldSize}B) much larger than new (${newSize}B) — re-migrating`)
        needsMigration = true
      }
    } catch { /* stat failed, skip size check */ }
  }

  if (!needsMigration) return

  console.log('[database] Migrating data from Syag → OSChief...')
  try {
    mkdirSync(newDataDir, { recursive: true })

    // First, checkpoint the old WAL to merge it into the main DB file
    try {
      const OldDb = require('better-sqlite3')
      const oldConn = new OldDb(oldDbPath, { readonly: false })
      oldConn.pragma('wal_checkpoint(TRUNCATE)')
      oldConn.close()
      console.log('[database] WAL checkpointed before copy')
    } catch (walErr) {
      console.log('[database] WAL checkpoint skipped:', (walErr as any)?.message)
    }

    copyFileSync(oldDbPath, newDbPath)
    // SHA-256 checksum verification — retry once on mismatch
    const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
    const srcHash = sha256(oldDbPath)
    const dstHash = sha256(newDbPath)
    if (srcHash !== dstHash) {
      console.warn('[database] Checksum mismatch after copy, retrying...')
      copyFileSync(oldDbPath, newDbPath)
      const retryHash = sha256(newDbPath)
      if (srcHash !== retryHash) {
        throw new Error(`Database copy checksum mismatch: src=${srcHash} dst=${retryHash}`)
      }
    }
    // Also copy WAL/SHM if they exist (belt and suspenders)
    if (existsSync(oldDbPath + '-wal')) copyFileSync(oldDbPath + '-wal', newDbPath + '-wal')
    if (existsSync(oldDbPath + '-shm')) copyFileSync(oldDbPath + '-shm', newDbPath + '-shm')
    console.log('[database] Database migrated successfully')

    // Also copy the secure keychain if it exists
    const oldKeychain = join(homedir(), 'Library', 'Application Support', 'Syag', 'secure', 'keychain.enc')
    const newKeychainDir = join(app.getPath('userData'), 'secure')
    const newKeychain = join(newKeychainDir, 'keychain.enc')
    if (existsSync(oldKeychain) && !existsSync(newKeychain)) {
      mkdirSync(newKeychainDir, { recursive: true })
      copyFileSync(oldKeychain, newKeychain)
      console.log('[database] Keychain migrated successfully')
    }

    // Symlink models directory if it exists (models can be GBs)
    const oldModels = join(homedir(), 'Library', 'Application Support', 'Syag', 'models')
    const newModels = join(app.getPath('userData'), 'models')
    if (existsSync(oldModels) && !existsSync(newModels)) {
      try {
        const { symlinkSync } = require('fs')
        symlinkSync(oldModels, newModels)
        console.log('[database] Models directory symlinked')
      } catch {
        console.log('[database] Could not symlink models — user may need to re-download')
      }
    }
  } catch (err) {
    console.error('[database] Migration failed:', err)
  }
}

export function getDbPath(): string {
  migrateFromSyagIfNeeded()
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'data', 'syag.db')
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/** Register a sync change logger callback. Called after every write when sync is enabled. */
export function setSyncLogger(fn: typeof syncLogFn): void {
  syncLogFn = fn
}

function logSync(table: SyncableTable, op: 'INSERT' | 'UPDATE' | 'DELETE', entityId: string, data: Record<string, any> | null): void {
  if (syncLogFn) syncLogFn(table, op, entityId, data)
}

export function initDatabase(): void {
  const dbPath = getDbPath()
  const dbDir = join(dbPath, '..')
  mkdirSync(dbDir, { recursive: true })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
}

// --- Notes CRUD ---

export function getAllNotes(): any[] {
  const rows = getDb().prepare(`
    SELECT id, title, date, time, duration, time_range, personal_notes, transcript, summary, folder_id, coaching_metrics, mic_only
    FROM notes ORDER BY created_at DESC
  `).all() as any[]
  return rows.map(deserializeNote)
}

export function getNote(id: string): any | null {
  const row = getDb().prepare(`
    SELECT id, title, date, time, duration, time_range, personal_notes, transcript, summary, folder_id, coaching_metrics, mic_only
    FROM notes WHERE id = ?
  `).get(id) as any
  return row ? deserializeNote(row) : null
}

export function addNote(note: any): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO notes (id, title, date, time, duration, time_range, personal_notes, transcript, summary, folder_id, coaching_metrics, mic_only)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    note.id,
    note.title,
    note.date,
    note.time,
    note.duration,
    note.timeRange ?? null,
    note.personalNotes || '',
    JSON.stringify(note.transcript || []),
    note.summary ? JSON.stringify(note.summary) : null,
    note.folderId || null,
    note.coachingMetrics ? JSON.stringify(note.coachingMetrics) : null,
    note.micOnly ? 1 : 0
  )
  logSync('notes', 'INSERT', note.id, {
    id: note.id, title: note.title, date: note.date, time: note.time,
    duration: note.duration, time_range: note.timeRange ?? null,
    personal_notes: note.personalNotes || '',
    transcript: JSON.stringify(note.transcript || []),
    summary: note.summary ? JSON.stringify(note.summary) : null,
    folder_id: note.folderId || null,
    coaching_metrics: note.coachingMetrics ? JSON.stringify(note.coachingMetrics) : null,
    mic_only: note.micOnly ? 1 : 0,
  })
}

export function updateNote(id: string, data: any): void {
  const fields: string[] = []
  const values: any[] = []

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title) }
  if (data.date !== undefined) { fields.push('date = ?'); values.push(data.date) }
  if (data.time !== undefined) { fields.push('time = ?'); values.push(data.time) }
  if (data.duration !== undefined) { fields.push('duration = ?'); values.push(data.duration) }
  if (data.timeRange !== undefined) { fields.push('time_range = ?'); values.push(data.timeRange) }
  if (data.personalNotes !== undefined) { fields.push('personal_notes = ?'); values.push(data.personalNotes) }
  if (data.transcript !== undefined) { fields.push('transcript = ?'); values.push(JSON.stringify(data.transcript)) }
  if (data.summary !== undefined) { fields.push('summary = ?'); values.push(data.summary ? JSON.stringify(data.summary) : null) }
  if (data.folderId !== undefined) { fields.push('folder_id = ?'); values.push(data.folderId) }
  if (data.coachingMetrics !== undefined) { fields.push('coaching_metrics = ?'); values.push(data.coachingMetrics ? JSON.stringify(data.coachingMetrics) : null) }

  if (fields.length === 0) return

  fields.push("updated_at = datetime('now')")
  values.push(id)

  getDb().prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  // Log sync with the full current row
  const updated = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
  if (updated) logSync('notes', 'UPDATE', id, updated)
}

export function deleteNote(id: string): void {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
  logSync('notes', 'DELETE', id, null)
}

export function updateNoteFolder(noteId: string, folderId: string | null): void {
  getDb().prepare("UPDATE notes SET folder_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(folderId, noteId)
  const updated = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as any
  if (updated) logSync('notes', 'UPDATE', noteId, updated)
}

// --- Folders CRUD ---

export function getAllFolders(): any[] {
  return getDb().prepare('SELECT * FROM folders ORDER BY created_at ASC').all() as any[]
}

export function addFolder(folder: any): void {
  getDb().prepare(`
    INSERT INTO folders (id, name, color, icon) VALUES (?, ?, ?, ?)
  `).run(folder.id, folder.name, folder.color || '#8B7355', folder.icon || 'folder')
  logSync('folders', 'INSERT', folder.id, {
    id: folder.id, name: folder.name, color: folder.color || '#8B7355', icon: folder.icon || 'folder',
  })
}

export function updateFolder(id: string, data: any): void {
  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color) }
  if (data.icon !== undefined) { fields.push('icon = ?'); values.push(data.icon) }

  if (fields.length === 0) return
  values.push(id)

  getDb().prepare(`UPDATE folders SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  const updated = getDb().prepare('SELECT * FROM folders WHERE id = ?').get(id) as any
  if (updated) logSync('folders', 'UPDATE', id, updated)
}

export function deleteFolder(id: string): void {
  getDb().prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?').run(id)
  getDb().prepare('DELETE FROM folders WHERE id = ?').run(id)
  logSync('folders', 'DELETE', id, null)
}

// --- Local calendar blocks (OSChief-only, not synced to Google/Outlook) ---

export interface LocalCalendarBlockRow {
  id: string
  title: string
  startIso: string
  endIso: string
  noteId: string | null
  createdAt: string
}

export function getAllLocalCalendarBlocks(): LocalCalendarBlockRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, title, start_iso, end_iso, note_id, created_at
       FROM local_calendar_blocks ORDER BY start_iso ASC`
    )
    .all() as any[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startIso: r.start_iso,
    endIso: r.end_iso,
    noteId: r.note_id ?? null,
    createdAt: r.created_at,
  }))
}

export function addLocalCalendarBlock(block: {
  id: string
  title: string
  startIso: string
  endIso: string
  noteId?: string | null
}): void {
  getDb()
    .prepare(
      `INSERT INTO local_calendar_blocks (id, title, start_iso, end_iso, note_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(block.id, block.title, block.startIso, block.endIso, block.noteId ?? null)
}

export function deleteLocalCalendarBlock(id: string): void {
  getDb().prepare('DELETE FROM local_calendar_blocks WHERE id = ?').run(id)
}

// --- Settings KV ---

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
  logSync('settings', 'UPDATE', key, { key, value })
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as any[]
  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return result
}

// --- Helpers ---

/** Parse JSON safely — returns fallback on corruption instead of crashing the app. */
function safeJsonParse<T>(str: string | null | undefined, fallback: T, context?: string): T {
  if (!str) return fallback
  try {
    return JSON.parse(str)
  } catch (err) {
    console.warn(`[DB] Corrupted JSON${context ? ` in ${context}` : ''}: ${(err as Error).message}`)
    return fallback
  }
}

// --- Pipeline Quality Log ---

export function logPipelineQuality(entry: {
  noteId?: string
  gateName: string
  outcome: string
  retryCount?: number
  groundingScore?: number
  durationMs?: number
  model?: string
}): void {
  getDb().prepare(`
    INSERT INTO pipeline_quality_log (note_id, gate_name, outcome, retry_count, grounding_score, duration_ms, model)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.noteId ?? null,
    entry.gateName,
    entry.outcome,
    entry.retryCount ?? 0,
    entry.groundingScore ?? null,
    entry.durationMs ?? null,
    entry.model ?? null,
  )
}

/** Get aggregate summary benchmark stats grouped by model. */
export function getPipelineQualityStats(): any[] {
  return getDb().prepare(`
    SELECT model,
           COUNT(*) as count,
           ROUND(AVG(duration_ms) / 1000.0, 1) as avg_seconds,
           ROUND(MIN(duration_ms) / 1000.0, 1) as min_seconds,
           ROUND(MAX(duration_ms) / 1000.0, 1) as max_seconds
    FROM pipeline_quality_log
    WHERE gate_name = 'grounding' AND duration_ms IS NOT NULL
    GROUP BY model ORDER BY avg_seconds ASC
  `).all()
}

function deserializeNote(row: any): any {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time,
    duration: row.duration,
    timeRange: row.time_range ?? undefined,
    personalNotes: row.personal_notes,
    transcript: safeJsonParse(row.transcript, [], `note ${row.id} transcript`),
    summary: safeJsonParse(row.summary, null, `note ${row.id} summary`),
    folderId: row.folder_id,
    micOnly: !!row.mic_only,
    coachingMetrics: safeJsonParse(row.coaching_metrics, undefined, `note ${row.id} coachingMetrics`),
  }
}
