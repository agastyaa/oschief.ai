/**
 * R1a — iCloud DB-path safety gate.
 *
 * SQLite WAL mode can silently corrupt when the DB file lives in an
 * iCloud-synced folder (Finder/CloudKit rewrites files behind our back).
 *
 * On launch we resolve the userData path and refuse to open the DB if:
 *   1. Path is under ~/Library/Mobile Documents/ (iCloud Drive root), OR
 *   2. Path or any ancestor has the `com.apple.fileprovider.*` xattr set
 *      (managed-fleet case: iCloud Drive moved Application Support).
 *
 * When detected, the caller surfaces a modal: "move to safe path or quit".
 */

import { homedir } from 'os'
import { join, resolve } from 'path'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { ICloudSyncedDBPath } from '../errors'

const MOBILE_DOCUMENTS = join(homedir(), 'Library', 'Mobile Documents')
const ICLOUD_XATTRS = [
  'com.apple.fileprovider.fpfs#P',
  'com.apple.fileprovider.fpfs#N',
  'com.apple.clouddocs.security.uuid',
]

export interface ICloudCheckResult {
  safe: boolean
  reason?: 'mobile-documents' | 'xattr' | null
  path: string
  xattrFound?: string
}

/**
 * Pure path-string check — safe to unit-test without touching the filesystem.
 * Returns true if `p` resolves under ~/Library/Mobile Documents/.
 */
export function isMobileDocumentsPath(p: string, home: string = homedir()): boolean {
  const abs = resolve(p)
  const mobileDocs = resolve(join(home, 'Library', 'Mobile Documents'))
  return abs === mobileDocs || abs.startsWith(mobileDocs + '/')
}

/**
 * Read xattrs for a path. Returns the raw list (one per line).
 * Throws on missing path. Returns [] if no xattrs or command fails.
 */
export function listXattrs(
  path: string,
  runner: (cmd: string, args: string[]) => string = defaultRunner,
): string[] {
  try {
    const out = runner('xattr', [path])
    return out.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function defaultRunner(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

export function hasICloudXattr(xattrs: string[]): string | null {
  for (const x of xattrs) {
    if (ICLOUD_XATTRS.includes(x) || x.startsWith('com.apple.fileprovider.')) return x
  }
  return null
}

/**
 * Full check: mobile-documents detection + xattr probe.
 * Accepts a custom xattr runner for tests.
 */
export function checkDbPathSafety(
  dbPath: string,
  opts: {
    home?: string
    runner?: (cmd: string, args: string[]) => string
    existsFn?: (p: string) => boolean
  } = {},
): ICloudCheckResult {
  const home = opts.home ?? homedir()
  const runner = opts.runner ?? defaultRunner
  const existsFn = opts.existsFn ?? existsSync

  if (isMobileDocumentsPath(dbPath, home)) {
    return { safe: false, reason: 'mobile-documents', path: dbPath }
  }

  // Walk up to first existing ancestor (path may not exist yet on fresh install)
  let probe = dbPath
  while (probe && !existsFn(probe)) {
    const parent = resolve(probe, '..')
    if (parent === probe) break
    probe = parent
  }
  if (existsFn(probe)) {
    const xattrs = listXattrs(probe, runner)
    const hit = hasICloudXattr(xattrs)
    if (hit) return { safe: false, reason: 'xattr', path: dbPath, xattrFound: hit }
  }

  return { safe: true, reason: null, path: dbPath }
}

export function safeUserDataPath(home: string = homedir()): string {
  return join(home, 'Library', 'Application Support', 'OSChief')
}

/**
 * Throw a typed error when unsafe. Main-process bootstrap catches and shows modal.
 */
export function assertSafeDbPath(dbPath: string): void {
  const r = checkDbPathSafety(dbPath)
  if (!r.safe) {
    throw new ICloudSyncedDBPath(
      `userData path is iCloud-synced (${r.reason}): ${r.path}`,
      { reason: r.reason, xattr: r.xattrFound },
    )
  }
}
