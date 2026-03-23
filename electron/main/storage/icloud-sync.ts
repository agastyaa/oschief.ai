/**
 * iCloud Drive Sync — Core Orchestration
 *
 * Manages enable/disable, device identity, iCloud container path detection,
 * and coordinates the change logger, watcher, replayer, and snapshot manager.
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { hostname } from 'os'
import { execSync } from 'child_process'
import { getSetting, setSetting, getDb } from './database'
import { createBackup } from './sync-backup'
import { SyncChangeLogger } from './sync-change-logger'
import { SyncChangeWatcher } from './sync-change-watcher'
import { SyncChangeReplayer } from './sync-change-replayer'
import { createSnapshot, restoreFromLatestSnapshot } from './sync-snapshot'
import type { SyncStatus, SyncManifest, SyncDeviceEntry } from './sync-types'

const ICLOUD_CONTAINER_ID = 'iCloud~com~syag~notes'
const SYNC_DIR_NAME = 'syag-sync'
const MANIFEST_FILE = 'manifest.json'
const CURRENT_SCHEMA_VERSION = 7

let changeLogger: SyncChangeLogger | null = null
let changeWatcher: SyncChangeWatcher | null = null
let replayer: SyncChangeReplayer | null = null
let syncState: SyncStatus['state'] = 'disabled'
let lastSyncAt: string | null = null
let lastError: string | undefined

// Manifest cache — avoids re-reading the file on every getSyncStatus() call
let cachedManifest: SyncManifest | null = null
let cachedManifestAt = 0
const MANIFEST_CACHE_TTL_MS = 60_000

// --- Public API ---

export function isSyncEnabled(): boolean {
  return getSetting('icloud-sync-enabled') === 'true'
}

export function getICloudContainerPath(): string | null {
  const mobileDocsDir = join(app.getPath('home'), 'Library', 'Mobile Documents')

  // Mobile Documents must exist (iCloud Drive enabled in System Settings)
  if (!existsSync(mobileDocsDir)) {
    return null
  }

  // Without iCloud entitlements, macOS won't auto-create the container dir.
  // We create it ourselves — iCloud Drive syncs any subdirectory of Mobile Documents.
  const containerDir = join(mobileDocsDir, ICLOUD_CONTAINER_ID, 'Documents', SYNC_DIR_NAME)
  return containerDir
}

export function isICloudAvailable(): boolean {
  const mobileDocsDir = join(app.getPath('home'), 'Library', 'Mobile Documents')
  return existsSync(mobileDocsDir)
}

export function getDeviceId(): string {
  let deviceId = getSetting('sync-device-id')
  if (deviceId) return deviceId

  // Generate deterministic device ID from hostname + hardware serial
  let serial = 'unknown'
  try {
    serial = execSync('ioreg -rd1 -c IOPlatformExpertDevice | awk \'/IOPlatformSerialNumber/ {print $3}\'', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim().replace(/"/g, '')
  } catch {
    // Fallback: use hostname only
  }

  const raw = `${hostname()}-${serial}`
  deviceId = createHash('sha256').update(raw).digest('hex').substring(0, 16)
  setSetting('sync-device-id', deviceId)
  return deviceId
}

export function getDeviceName(): string {
  try {
    return execSync('scutil --get ComputerName', { encoding: 'utf-8', timeout: 3000 }).trim()
  } catch {
    return hostname()
  }
}

export async function enableSync(): Promise<{ ok: boolean; error?: string }> {
  try {
    const containerPath = getICloudContainerPath()
    if (!containerPath) {
      return { ok: false, error: 'iCloud Drive is not available. Sign in to iCloud in System Settings.' }
    }

    // Create the sync directory in iCloud container
    mkdirSync(containerPath, { recursive: true })

    // Auto-backup before enabling sync
    const dbPath = getDbPath()
    createBackup(dbPath)

    const deviceId = getDeviceId()
    const deviceName = getDeviceName()

    // Check if this is a new sync setup or joining existing
    const manifestPath = join(containerPath, MANIFEST_FILE)
    const hasExistingData = existsSync(manifestPath)

    if (hasExistingData) {
      // Joining existing sync — restore from latest snapshot + replay changes
      const manifest = readManifest(containerPath)
      if (manifest && manifest.schemaVersion > CURRENT_SCHEMA_VERSION) {
        return { ok: false, error: 'A newer version of Syag created this sync. Please update the app.' }
      }

      // Check if local DB is empty (fresh install)
      const noteCount = getDb().prepare('SELECT COUNT(*) as c FROM notes').get() as any
      if (noteCount.c === 0) {
        // Fresh device — restore from snapshot
        await restoreFromLatestSnapshot(containerPath, dbPath)
      }
      // Replay any changes from other devices
      initReplayer(containerPath)
      replayer!.replayAllPending()

      // Register this device in manifest
      registerDevice(containerPath, deviceId, deviceName, manifest)
    } else {
      // First device — create manifest and snapshot
      const manifest: SyncManifest = {
        protocolVersion: 1,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        devices: [{
          deviceId,
          deviceName,
          platform: 'macos',
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      invalidateManifestCache()

      // Create initial snapshot for other devices to bootstrap from
      createSnapshot(dbPath, containerPath, deviceId)
    }

    // Start the sync engine
    initChangeLogger(containerPath)
    initReplayer(containerPath)
    initChangeWatcher(containerPath)

    setSetting('icloud-sync-enabled', 'true')
    syncState = 'synced'
    lastSyncAt = new Date().toISOString()

    console.log('[icloud-sync] Sync enabled successfully')
    return { ok: true }
  } catch (err: any) {
    console.error('[icloud-sync] Failed to enable sync:', err)
    lastError = err.message
    syncState = 'error'
    return { ok: false, error: err.message }
  }
}

export function disableSync(): void {
  stopSync()
  setSetting('icloud-sync-enabled', 'false')
  syncState = 'disabled'
  console.log('[icloud-sync] Sync disabled — data remains in iCloud for other devices')
}

export function startSync(): void {
  if (!isSyncEnabled()) return

  const containerPath = getICloudContainerPath()
  if (!containerPath || !existsSync(containerPath)) {
    syncState = 'offline'
    return
  }

  try {
    initChangeLogger(containerPath)
    initReplayer(containerPath)
    initChangeWatcher(containerPath)
    syncState = 'synced'
    lastSyncAt = new Date().toISOString()

    // Update last seen in manifest
    const deviceId = getDeviceId()
    const manifest = readManifest(containerPath)
    if (manifest) {
      const device = manifest.devices.find(d => d.deviceId === deviceId)
      if (device) {
        device.lastSeen = new Date().toISOString()
        manifest.updatedAt = new Date().toISOString()
        writeFileSync(join(containerPath, MANIFEST_FILE), JSON.stringify(manifest, null, 2))
        invalidateManifestCache()
      }
    }
  } catch (err: any) {
    console.error('[icloud-sync] Failed to start sync:', err)
    syncState = 'error'
    lastError = err.message
  }
}

export function stopSync(): void {
  changeWatcher?.stop()
  changeWatcher = null
  changeLogger?.stop()
  changeLogger = null
  replayer?.stop()
  replayer = null
}

export async function forceSyncNow(): Promise<void> {
  const containerPath = getICloudContainerPath()
  if (!containerPath || !replayer) return

  syncState = 'syncing'
  try {
    replayer.replayAllPending()
    lastSyncAt = new Date().toISOString()
    syncState = 'synced'
  } catch (err: any) {
    syncState = 'error'
    lastError = err.message
  }
}

export function getSyncStatus(): SyncStatus {
  const containerPath = getICloudContainerPath()
  let deviceCount = 0

  if (containerPath && existsSync(join(containerPath, MANIFEST_FILE))) {
    const manifest = readManifestCached(containerPath)
    deviceCount = manifest?.devices.length ?? 0
  }

  return {
    enabled: isSyncEnabled(),
    icloudAvailable: isICloudAvailable(),
    lastSyncAt,
    deviceCount,
    pendingChanges: changeLogger?.getPendingCount() ?? 0,
    state: syncState,
    error: lastError,
  }
}

export function getChangeLogger(): SyncChangeLogger | null {
  return changeLogger
}

export function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'data', 'syag.db')
}

// --- Internal helpers ---

function initChangeLogger(containerPath: string): void {
  if (changeLogger) return
  changeLogger = new SyncChangeLogger(containerPath, getDeviceId(), CURRENT_SCHEMA_VERSION)
}

function initReplayer(containerPath: string): void {
  if (replayer) return
  replayer = new SyncChangeReplayer(containerPath, getDeviceId(), getDb())
}

function initChangeWatcher(containerPath: string): void {
  if (changeWatcher) return
  changeWatcher = new SyncChangeWatcher(containerPath, getDeviceId(), (records) => {
    if (!replayer) return
    syncState = 'syncing'
    try {
      const result = replayer.replay(records)
      lastSyncAt = new Date().toISOString()
      syncState = 'synced'
      if (result.applied > 0) {
        // Notify renderer that data changed
        notifyDataChanged(result.applied)
      }
    } catch (err: any) {
      syncState = 'error'
      lastError = err.message
    }
  })
  changeWatcher.start()
}

function readManifest(containerPath: string): SyncManifest | null {
  const manifestPath = join(containerPath, MANIFEST_FILE)
  if (!existsSync(manifestPath)) return null
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch {
    return null
  }
}

/** Cached manifest read — returns in-memory copy if <60s old */
function readManifestCached(containerPath: string): SyncManifest | null {
  const now = Date.now()
  if (cachedManifest && (now - cachedManifestAt) < MANIFEST_CACHE_TTL_MS) {
    return cachedManifest
  }
  cachedManifest = readManifest(containerPath)
  cachedManifestAt = now
  return cachedManifest
}

function invalidateManifestCache(): void {
  cachedManifest = null
  cachedManifestAt = 0
}

function registerDevice(
  containerPath: string,
  deviceId: string,
  deviceName: string,
  existingManifest: SyncManifest | null,
): void {
  const manifest = existingManifest ?? {
    protocolVersion: 1 as const,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    devices: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const existing = manifest.devices.find(d => d.deviceId === deviceId)
  if (existing) {
    existing.lastSeen = new Date().toISOString()
    existing.deviceName = deviceName
  } else {
    manifest.devices.push({
      deviceId,
      deviceName,
      platform: 'macos',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    })
  }

  manifest.updatedAt = new Date().toISOString()
  writeFileSync(join(containerPath, MANIFEST_FILE), JSON.stringify(manifest, null, 2))
  invalidateManifestCache()
}

function notifyDataChanged(count: number): void {
  // Send to all renderer windows
  const { BrowserWindow } = require('electron')
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('sync:data-changed', { count })
    }
  }
}
