/**
 * Sync Snapshot Manager — Full DB backup/restore for bootstrapping new devices.
 *
 * Uses better-sqlite3's .backup() API to create consistent point-in-time copies.
 * Snapshots are written in DELETE journal mode (not WAL) to avoid sidecar sync issues.
 */

import Database from 'better-sqlite3'
import { existsSync, readdirSync, unlinkSync, copyFileSync, statSync } from 'fs'
import { join } from 'path'
import { getDb } from './database'

const SNAPSHOT_PREFIX = 'snapshot-'
const MAX_SNAPSHOTS_PER_DEVICE = 2

export async function createSnapshot(dbPath: string, containerPath: string, deviceId: string): Promise<void> {
  const snapshotName = `${SNAPSHOT_PREFIX}${deviceId}.db`
  const snapshotPath = join(containerPath, snapshotName)

  // Use better-sqlite3's backup API for a consistent copy (with single retry on failure)
  const sourceDb = getDb()
  const attemptBackup = async () => {
    await sourceDb.backup(snapshotPath)
    // Validate backup file size > 0
    const size = statSync(snapshotPath).size
    if (size <= 0) throw new Error('Backup file is empty (0 bytes)')
  }

  try {
    await attemptBackup()
  } catch (firstErr: any) {
    console.warn('[sync-snapshot] Backup failed, retrying once:', firstErr.message)
    try {
      await attemptBackup()
    } catch (retryErr: any) {
      console.error('[sync-snapshot] Backup failed after retry:', retryErr)
      return
    }
  }

  // Convert the snapshot to DELETE journal mode (not WAL)
  // This ensures no -wal/-shm sidecar files in iCloud
  try {
    const snap = new Database(snapshotPath)
    snap.pragma('journal_mode = DELETE')
    snap.close()
  } catch (err) {
    console.warn('[sync-snapshot] Failed to convert journal mode:', err)
  }

  console.log(`[sync-snapshot] Created snapshot: ${snapshotName}`)
}

export async function restoreFromLatestSnapshot(
  containerPath: string,
  localDbPath: string,
): Promise<boolean> {
  const snapshots = readdirSync(containerPath)
    .filter(f => f.startsWith(SNAPSHOT_PREFIX) && f.endsWith('.db'))

  if (snapshots.length === 0) {
    console.log('[sync-snapshot] No snapshots found to restore from')
    return false
  }

  // Pick the most recent snapshot (by file modification time)
  let newestPath = ''
  let newestMtime = 0
  for (const snap of snapshots) {
    const fullPath = join(containerPath, snap)
    try {
      const { statSync } = require('fs')
      const stat = statSync(fullPath)
      if (stat.mtimeMs > newestMtime) {
        newestMtime = stat.mtimeMs
        newestPath = fullPath
      }
    } catch { /* skip unreadable files */ }
  }

  if (!newestPath) return false

  // Verify the snapshot is a valid SQLite database
  try {
    const testDb = new Database(newestPath, { readonly: true })
    testDb.prepare('SELECT COUNT(*) FROM notes').get()
    testDb.close()
  } catch (err) {
    console.error('[sync-snapshot] Snapshot validation failed:', err)
    return false
  }

  // Copy snapshot to local DB path
  copyFileSync(newestPath, localDbPath)

  // Remove any stale WAL/SHM files (snapshot is in DELETE mode)
  const walPath = localDbPath + '-wal'
  const shmPath = localDbPath + '-shm'
  if (existsSync(walPath)) unlinkSync(walPath)
  if (existsSync(shmPath)) unlinkSync(shmPath)

  console.log(`[sync-snapshot] Restored from: ${newestPath}`)
  return true
}
