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
  {
    version: 6,
    up: [
      `CREATE TABLE IF NOT EXISTS local_calendar_blocks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        start_iso TEXT NOT NULL,
        end_iso TEXT NOT NULL,
        note_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_local_blocks_start ON local_calendar_blocks(start_iso)`,
    ]
  },
  {
    version: 7,
    up: [
      `ALTER TABLE notes ADD COLUMN sync_device_origin TEXT`,
      `ALTER TABLE notes ADD COLUMN sync_change_id TEXT`,
      `ALTER TABLE folders ADD COLUMN sync_device_origin TEXT`,
      `ALTER TABLE folders ADD COLUMN sync_change_id TEXT`,
      `ALTER TABLE people ADD COLUMN sync_device_origin TEXT`,
      `ALTER TABLE people ADD COLUMN sync_change_id TEXT`,
      `ALTER TABLE commitments ADD COLUMN sync_device_origin TEXT`,
      `ALTER TABLE commitments ADD COLUMN sync_change_id TEXT`,
      `ALTER TABLE topics ADD COLUMN sync_device_origin TEXT`,
      `ALTER TABLE topics ADD COLUMN sync_change_id TEXT`,
    ]
  },
  {
    version: 8,
    up: [
      // Projects table — tracks work streams across meetings
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'suggested',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_device_origin TEXT,
        sync_change_id TEXT
      )`,
      // Junction: notes ↔ projects
      `CREATE TABLE IF NOT EXISTS note_projects (
        note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        PRIMARY KEY (note_id, project_id)
      )`,
      // Decisions — structured, relational (canonical over summary.decisions)
      `CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        text TEXT NOT NULL,
        context TEXT,
        date TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        sync_device_origin TEXT,
        sync_change_id TEXT
      )`,
      // Junction: decisions ↔ people
      `CREATE TABLE IF NOT EXISTS decision_people (
        decision_id TEXT REFERENCES decisions(id) ON DELETE CASCADE,
        person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
        PRIMARY KEY (decision_id, person_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_note_projects_project ON note_projects(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_decisions_note ON decisions(note_id)`,
    ]
  },
  {
    version: 9,
    up: [
      // Calendar event-note linking — enables "all meetings for this event series"
      `ALTER TABLE notes ADD COLUMN calendar_event_id TEXT`,
      `ALTER TABLE notes ADD COLUMN calendar_event_title TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_notes_calendar_event ON notes(calendar_event_id)`,
    ]
  },
  {
    version: 10,
    up: [
      // Routines — scheduled prompts that run against the meeting graph
      `CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        schedule_type TEXT NOT NULL DEFAULT 'daily',
        schedule_hour INTEGER NOT NULL DEFAULT 9,
        schedule_minute INTEGER NOT NULL DEFAULT 0,
        schedule_day INTEGER,
        delivery TEXT NOT NULL DEFAULT 'both',
        enabled INTEGER NOT NULL DEFAULT 1,
        builtin_type TEXT,
        data_query TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Routine execution history
      `CREATE TABLE IF NOT EXISTS routine_runs (
        id TEXT PRIMARY KEY,
        routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
        output TEXT NOT NULL,
        context_snapshot TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        error_message TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        duration_ms INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_routine_runs_routine ON routine_runs(routine_id, started_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_routines_enabled ON routines(enabled)`,
    ]
  },
  {
    version: 11,
    up: [
      // Direct commitment→project link + snooze support
      `ALTER TABLE commitments ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`,
      `ALTER TABLE commitments ADD COLUMN snoozed_until TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_commitments_project ON commitments(project_id)`,
    ]
  },
  {
    version: 12,
    up: [
      // Proactive Intelligence Layer — decision lifecycle + commitment risk + weekday routines
      `ALTER TABLE decisions ADD COLUMN status TEXT DEFAULT 'MADE'`,
      `ALTER TABLE decisions ADD COLUMN updated_at TEXT`,
      `UPDATE decisions SET updated_at = created_at WHERE updated_at IS NULL`,
      `ALTER TABLE commitments ADD COLUMN amber_notified_at TEXT`,
      `ALTER TABLE routines ADD COLUMN weekdays_only INTEGER DEFAULT 0`,
    ]
  },
  {
    version: 13,
    up: [
      // Pipeline quality telemetry — device-local, excluded from sync
      `CREATE TABLE IF NOT EXISTS pipeline_quality_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT,
        gate_name TEXT NOT NULL,
        outcome TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        grounding_score REAL,
        duration_ms INTEGER,
        model TEXT,
        timestamp TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_pql_note ON pipeline_quality_log(note_id)`,
      `CREATE INDEX IF NOT EXISTS idx_pql_timestamp ON pipeline_quality_log(timestamp)`,
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
