/**
 * Sync Change Replayer — Merges remote changes into the local SQLite database.
 *
 * Conflict resolution: Last-Writer-Wins (LWW) per entity using updated_at timestamps.
 * This is appropriate because Syag is a personal tool — two users rarely edit the
 * same note on two Macs simultaneously.
 *
 * Optimizations:
 * - Schema version cached at construction (never changes at runtime)
 * - seenIds flushed on dirty flag + debounce timer (not after every replay)
 */

import type Database from 'better-sqlite3'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SyncChangeRecord, ReplayResult } from './sync-types'

const SEEN_IDS_FILE = 'seen-change-ids.json'
const MAX_SEEN_IDS = 10_000 // Prune oldest entries beyond this
const SEEN_IDS_FLUSH_THRESHOLD = 100 // Flush after this many new IDs
const SEEN_IDS_FLUSH_INTERVAL_MS = 30_000 // Or flush after 30s if dirty

export class SyncChangeReplayer {
  private seenIds: Set<string>
  private seenIdsPath: string
  private seenIdsDirty = false
  private newIdsSinceFlush = 0
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private localSchemaVersion: number

  constructor(
    private containerPath: string,
    private localDeviceId: string,
    private db: Database.Database,
  ) {
    this.seenIdsPath = join(containerPath, '..', SEEN_IDS_FILE)
    this.seenIds = this.loadSeenIds()
    // Cache schema version — only changes during migrations, which happen before sync starts
    this.localSchemaVersion = (this.db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any)?.v ?? 0
    // Periodic flush timer for dirty seenIds
    this.flushTimer = setInterval(() => this.flushSeenIdsIfDirty(), SEEN_IDS_FLUSH_INTERVAL_MS)
  }

  replay(records: SyncChangeRecord[]): ReplayResult {
    const result: ReplayResult = { applied: 0, skipped: 0, conflicts: 0, errors: [] }

    const applyAll = this.db.transaction(() => {
      for (const record of records) {
        try {
          this.replayOne(record, result)
        } catch (err: any) {
          result.errors.push(`${record.table}/${record.entityId}: ${err.message}`)
        }
      }
    })

    applyAll()
    // Flush seenIds if we've accumulated enough new entries
    if (this.newIdsSinceFlush >= SEEN_IDS_FLUSH_THRESHOLD) {
      this.flushSeenIds()
    }

    if (result.applied > 0) {
      console.log(`[sync-replayer] Applied ${result.applied}, skipped ${result.skipped}, conflicts ${result.conflicts}`)
    }
    return result
  }

  /** Replay all pending changes from all remote devices */
  replayAllPending(): ReplayResult {
    // This is called during initial sync — read all JSONL files and replay
    if (!existsSync(this.containerPath)) {
      return { applied: 0, skipped: 0, conflicts: 0, errors: [] }
    }

    const { readdirSync } = require('fs')
    const files = readdirSync(this.containerPath)
      .filter((f: string) => f.startsWith('changes-') && f.endsWith('.jsonl'))
      .filter((f: string) => {
        const deviceId = f.replace('changes-', '').replace('.jsonl', '')
        return deviceId !== this.localDeviceId
      })

    const allRecords: SyncChangeRecord[] = []
    for (const file of files) {
      const content = readFileSync(join(this.containerPath, file), 'utf-8').trim()
      if (!content) continue
      for (const line of content.split('\n')) {
        if (!line.trim()) continue
        try {
          allRecords.push(JSON.parse(line))
        } catch { /* skip malformed lines */ }
      }
    }

    allRecords.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    return this.replay(allRecords)
  }

  /** Flush pending seenIds and stop the timer. Call on shutdown. */
  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.flushSeenIds()
  }

  private replayOne(record: SyncChangeRecord, result: ReplayResult): void {
    // Skip already-seen changes (dedup)
    if (this.seenIds.has(record.id)) {
      result.skipped++
      return
    }
    this.seenIds.add(record.id)
    this.seenIdsDirty = true
    this.newIdsSinceFlush++

    // Skip changes from our own device
    if (record.deviceId === this.localDeviceId) {
      result.skipped++
      return
    }

    // Skip records with newer schema version (forward compat)
    if (record.schemaVersion > this.localSchemaVersion) {
      result.skipped++
      return
    }

    switch (record.operation) {
      case 'INSERT':
        this.applyInsert(record, result)
        break
      case 'UPDATE':
        this.applyUpdate(record, result)
        break
      case 'DELETE':
        this.applyDelete(record, result)
        break
    }
  }

  private applyInsert(record: SyncChangeRecord, result: ReplayResult): void {
    if (!record.data) { result.skipped++; return }

    switch (record.table) {
      case 'notes':
        this.upsertNote(record, result)
        break
      case 'folders':
        this.upsertFolder(record, result)
        break
      case 'people':
        this.upsertPerson(record, result)
        break
      case 'commitments':
        this.upsertCommitment(record, result)
        break
      case 'topics':
        this.upsertTopic(record, result)
        break
      case 'note_people':
        this.upsertNotePeople(record, result)
        break
      case 'note_topics':
        this.upsertNoteTopics(record, result)
        break
      case 'settings':
        this.upsertSetting(record, result)
        break
      default:
        result.skipped++
    }
  }

  private applyUpdate(record: SyncChangeRecord, result: ReplayResult): void {
    // UPDATE uses the same upsert logic — LWW compares timestamps
    this.applyInsert(record, result)
  }

  private applyDelete(record: SyncChangeRecord, result: ReplayResult): void {
    switch (record.table) {
      case 'notes':
        this.db.prepare('DELETE FROM notes WHERE id = ?').run(record.entityId)
        break
      case 'folders':
        this.db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?').run(record.entityId)
        this.db.prepare('DELETE FROM folders WHERE id = ?').run(record.entityId)
        break
      case 'people':
        this.db.prepare('DELETE FROM people WHERE id = ?').run(record.entityId)
        break
      case 'commitments':
        this.db.prepare('DELETE FROM commitments WHERE id = ?').run(record.entityId)
        break
      case 'topics':
        this.db.prepare('DELETE FROM topics WHERE id = ?').run(record.entityId)
        break
      case 'note_people': {
        const [noteId, personId] = record.entityId.split('::')
        this.db.prepare('DELETE FROM note_people WHERE note_id = ? AND person_id = ?').run(noteId, personId)
        break
      }
      case 'note_topics': {
        const [noteId, topicId] = record.entityId.split('::')
        this.db.prepare('DELETE FROM note_topics WHERE note_id = ? AND topic_id = ?').run(noteId, topicId)
        break
      }
      case 'settings':
        this.db.prepare('DELETE FROM settings WHERE key = ?').run(record.entityId)
        break
    }
    result.applied++
  }

  // --- Upsert helpers with LWW ---

  private upsertNote(record: SyncChangeRecord, result: ReplayResult): void {
    const d = record.data!
    const existing = this.db.prepare('SELECT updated_at, sync_device_origin FROM notes WHERE id = ?').get(record.entityId) as any

    if (existing) {
      // LWW: only apply if remote is newer
      if (existing.updated_at && record.timestamp < existing.updated_at) {
        result.conflicts++
        result.skipped++
        return
      }
      // Tiebreaker: when timestamps are equal, higher device-id wins (deterministic)
      if (existing.updated_at && record.timestamp === existing.updated_at) {
        const existingDevice = existing.sync_device_origin || ''
        const remoteDevice = record.deviceId || ''
        if (remoteDevice <= existingDevice) {
          result.conflicts++
          result.skipped++
          return
        }
      }
    }

    this.db.prepare(`
      INSERT OR REPLACE INTO notes (id, title, date, time, duration, time_range, personal_notes, transcript, summary, folder_id, coaching_metrics, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.id, d.title, d.date, d.time, d.duration, d.time_range ?? null,
      d.personal_notes ?? '', d.transcript ?? '[]', d.summary ?? null,
      d.folder_id ?? null, d.coaching_metrics ?? null, record.timestamp,
    )
    result.applied++
  }

  private upsertFolder(record: SyncChangeRecord, result: ReplayResult): void {
    const d = record.data!
    this.db.prepare(`
      INSERT OR REPLACE INTO folders (id, name, color, icon)
      VALUES (?, ?, ?, ?)
    `).run(d.id, d.name, d.color ?? '#8B7355', d.icon ?? 'folder')
    result.applied++
  }

  private upsertPerson(record: SyncChangeRecord, result: ReplayResult): void {
    const d = record.data!
    this.db.prepare(`
      INSERT OR REPLACE INTO people (id, name, email, company, role, relationship, first_seen, last_seen, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(d.id, d.name, d.email ?? null, d.company ?? null, d.role ?? null,
      d.relationship ?? null, d.first_seen ?? null, d.last_seen ?? null, d.notes ?? null)
    result.applied++
  }

  private upsertCommitment(record: SyncChangeRecord, result: ReplayResult): void {
    const d = record.data!
    const existing = this.db.prepare('SELECT updated_at, sync_device_origin FROM commitments WHERE id = ?').get(record.entityId) as any
    if (existing && existing.updated_at) {
      if (record.timestamp < existing.updated_at) {
        result.conflicts++
        result.skipped++
        return
      }
      // Tiebreaker: when timestamps are equal, higher device-id wins (deterministic)
      if (record.timestamp === existing.updated_at) {
        const existingDevice = existing.sync_device_origin || ''
        const remoteDevice = record.deviceId || ''
        if (remoteDevice <= existingDevice) {
          result.conflicts++
          result.skipped++
          return
        }
      }
    }

    this.db.prepare(`
      INSERT OR REPLACE INTO commitments (id, note_id, text, owner, assignee_id, due_date, status, completed_at, jira_issue_key, jira_issue_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d.id, d.note_id ?? null, d.text, d.owner ?? 'you', d.assignee_id ?? null,
      d.due_date ?? null, d.status ?? 'open', d.completed_at ?? null,
      d.jira_issue_key ?? null, d.jira_issue_url ?? null, record.timestamp,
    )
    result.applied++
  }

  private upsertTopic(record: SyncChangeRecord, result: ReplayResult): void {
    const d = record.data!
    this.db.prepare(`
      INSERT OR REPLACE INTO topics (id, label, first_seen, last_seen)
      VALUES (?, ?, ?, ?)
    `).run(d.id, d.label, d.first_seen ?? null, d.last_seen ?? null)
    result.applied++
  }

  private upsertNotePeople(record: SyncChangeRecord, result: ReplayResult): void {
    const d = record.data!
    this.db.prepare(`
      INSERT OR IGNORE INTO note_people (note_id, person_id, role)
      VALUES (?, ?, ?)
    `).run(d.note_id, d.person_id, d.role ?? 'attendee')
    result.applied++
  }

  private upsertNoteTopics(record: SyncChangeRecord, result: ReplayResult): void {
    const d = record.data!
    this.db.prepare(`
      INSERT OR IGNORE INTO note_topics (note_id, topic_id)
      VALUES (?, ?)
    `).run(d.note_id, d.topic_id)
    result.applied++
  }

  private upsertSetting(record: SyncChangeRecord, result: ReplayResult): void {
    const d = record.data!
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(d.key, d.value)
    result.applied++
  }

  // --- Seen IDs persistence (batched) ---

  private loadSeenIds(): Set<string> {
    if (!existsSync(this.seenIdsPath)) return new Set()
    try {
      const arr = JSON.parse(readFileSync(this.seenIdsPath, 'utf-8'))
      return new Set(Array.isArray(arr) ? arr : [])
    } catch {
      return new Set()
    }
  }

  private flushSeenIdsIfDirty(): void {
    if (this.seenIdsDirty) this.flushSeenIds()
  }

  private flushSeenIds(): void {
    if (!this.seenIdsDirty) return
    // Prune if too large — keep most recent entries
    let arr = Array.from(this.seenIds)
    if (arr.length > MAX_SEEN_IDS) {
      arr = arr.slice(arr.length - MAX_SEEN_IDS)
      this.seenIds = new Set(arr)
    }
    try {
      writeFileSync(this.seenIdsPath, JSON.stringify(arr))
    } catch (err) {
      console.warn('[sync-replayer] Failed to save seen IDs:', err)
    }
    this.seenIdsDirty = false
    this.newIdsSinceFlush = 0
  }
}
