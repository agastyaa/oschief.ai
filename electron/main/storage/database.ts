import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')
  mkdirSync(dbDir, { recursive: true })
  const dbPath = join(dbDir, 'syag.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
}

// --- Notes CRUD ---

export function getAllNotes(): any[] {
  const rows = getDb().prepare(`
    SELECT id, title, date, time, duration, time_range, personal_notes, transcript, summary, folder_id, coaching_metrics
    FROM notes ORDER BY created_at DESC
  `).all() as any[]
  return rows.map(deserializeNote)
}

export function getNote(id: string): any | null {
  const row = getDb().prepare(`
    SELECT id, title, date, time, duration, time_range, personal_notes, transcript, summary, folder_id, coaching_metrics
    FROM notes WHERE id = ?
  `).get(id) as any
  return row ? deserializeNote(row) : null
}

export function addNote(note: any): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO notes (id, title, date, time, duration, time_range, personal_notes, transcript, summary, folder_id, coaching_metrics)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    note.coachingMetrics ? JSON.stringify(note.coachingMetrics) : null
  )
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
}

export function deleteNote(id: string): void {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export function updateNoteFolder(noteId: string, folderId: string | null): void {
  getDb().prepare("UPDATE notes SET folder_id = ?, updated_at = datetime('now') WHERE id = ?")
    .run(folderId, noteId)
}

// --- Folders CRUD ---

export function getAllFolders(): any[] {
  return getDb().prepare('SELECT * FROM folders ORDER BY created_at ASC').all() as any[]
}

export function addFolder(folder: any): void {
  getDb().prepare(`
    INSERT INTO folders (id, name, color, icon) VALUES (?, ?, ?, ?)
  `).run(folder.id, folder.name, folder.color || '#8B7355', folder.icon || 'folder')
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
}

export function deleteFolder(id: string): void {
  getDb().prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?').run(id)
  getDb().prepare('DELETE FROM folders WHERE id = ?').run(id)
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
    coachingMetrics: safeJsonParse(row.coaching_metrics, undefined, `note ${row.id} coachingMetrics`),
  }
}
