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
  {
    version: 3,
    up: [
      `ALTER TABLE notes ADD COLUMN coaching_metrics TEXT`,
    ]
  },
  {
    version: 4,
    up: [
      `CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        company TEXT,
        role TEXT,
        relationship TEXT,
        first_seen TEXT,
        last_seen TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS note_people (
        note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
        person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'attendee',
        PRIMARY KEY (note_id, person_id)
      )`,
      `CREATE TABLE IF NOT EXISTS commitments (
        id TEXT PRIMARY KEY,
        note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
        text TEXT NOT NULL,
        owner TEXT NOT NULL DEFAULT 'you',
        assignee_id TEXT REFERENCES people(id) ON DELETE SET NULL,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        completed_at TEXT,
        jira_issue_key TEXT,
        jira_issue_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL UNIQUE,
        first_seen TEXT,
        last_seen TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS note_topics (
        note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
        topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
        PRIMARY KEY (note_id, topic_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_note_people_person ON note_people(person_id)`,
      `CREATE INDEX IF NOT EXISTS idx_commitments_assignee ON commitments(assignee_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status, due_date)`,
      `CREATE INDEX IF NOT EXISTS idx_topics_label ON topics(label)`,
    ]
  },
  {
    version: 5,
    up: [
      `CREATE TABLE IF NOT EXISTS kb_chunks (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        checksum TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_kb_chunks_file ON kb_chunks(file_path)`,
      `CREATE INDEX IF NOT EXISTS idx_kb_chunks_checksum ON kb_chunks(checksum)`,
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
