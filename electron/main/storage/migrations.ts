import type Database from 'better-sqlite3'

const MIGRATIONS: { version: number; up: string[] }[] = [
  {
    version: 1,
    up: [
      `CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        duration TEXT NOT NULL DEFAULT '',
        personal_notes TEXT NOT NULL DEFAULT '',
        transcript TEXT NOT NULL DEFAULT '[]',
        summary TEXT,
        folder_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#8B7355',
        icon TEXT NOT NULL DEFAULT 'folder',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      )`,
      `CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id)`,
      `CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC)`,
    ]
  },
  {
    version: 2,
    up: [
      `ALTER TABLE notes ADD COLUMN time_range TEXT`,
    ]
  },
]

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`)

  const currentVersion = (
    db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any
  )?.v ?? 0

  const pending = MIGRATIONS.filter(m => m.version > currentVersion)

  if (pending.length === 0) return

  const migrate = db.transaction(() => {
    for (const migration of pending) {
      for (const sql of migration.up) {
        db.exec(sql)
      }
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
    }
  })

  migrate()
}
