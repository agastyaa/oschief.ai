import { describe, it, expect, vi } from 'vitest'
import { runMigrations } from './migrations'

// v2.10 characterization test — locks the pre-refactor behavior of the
// migration runner. Uses a mock DB (not real SQLite) because the production
// better-sqlite3 binary is compiled against Electron's Node ABI, and we don't
// want tests to require a rebuild round-trip. The test still exercises the
// real control flow inside runMigrations: version tracking, ordering, the
// fallback statement-by-statement retry on transaction failure, and idempotency.

interface ExecCall { sql: string }
interface PrepareCall { sql: string; ran?: any[]; got?: any }

function makeMockDb(opts: {
  initialVersion?: number
  failTransaction?: (version: number) => boolean
  failStatement?: (sql: string) => Error | null
} = {}) {
  let currentVersion = opts.initialVersion ?? 0
  const execCalls: ExecCall[] = []
  const prepareCalls: PrepareCall[] = []
  const insertedVersions: number[] = []

  const db = {
    exec: vi.fn((sql: string) => {
      const err = opts.failStatement?.(sql)
      if (err) throw err
      execCalls.push({ sql })
    }),
    prepare: vi.fn((sql: string) => {
      const call: PrepareCall = { sql }
      prepareCalls.push(call)
      return {
        get: () => {
          if (/SELECT MAX\(version\)/i.test(sql)) {
            return { v: currentVersion }
          }
          return null
        },
        run: (...args: any[]) => {
          call.ran = args
          if (/INSERT (OR REPLACE )?INTO schema_version/i.test(sql) && args.length) {
            insertedVersions.push(args[0] as number)
            currentVersion = Math.max(currentVersion, args[0] as number)
          }
          return { changes: 1, lastInsertRowid: 0 }
        },
      }
    }),
    transaction: vi.fn((fn: () => void) => {
      return () => {
        // Extract which migration's transaction this is by running it and
        // checking the most-recent schema_version insert.
        const beforeLen = insertedVersions.length
        fn()
        const versionInserted = insertedVersions[insertedVersions.length - 1]
        if (
          versionInserted !== undefined &&
          opts.failTransaction?.(versionInserted)
        ) {
          // Simulate transaction rollback: remove the version we just inserted.
          insertedVersions.splice(beforeLen)
          currentVersion = beforeLen > 0 ? insertedVersions[beforeLen - 1]! : (opts.initialVersion ?? 0)
          throw new Error('simulated transaction failure')
        }
      }
    }),
  }

  return { db, execCalls, prepareCalls, insertedVersions, get currentVersion() { return currentVersion } }
}

describe('runMigrations — characterization', () => {
  it('from empty DB, applies all migrations in order and records each version', () => {
    const m = makeMockDb({ initialVersion: 0 })
    runMigrations(m.db as any)

    // The first exec should create schema_version table.
    expect(m.execCalls[0].sql).toMatch(/CREATE TABLE IF NOT EXISTS schema_version/)

    // All known versions should have been inserted, in ascending order.
    expect(m.insertedVersions.length).toBeGreaterThanOrEqual(17)
    const sorted = [...m.insertedVersions].sort((a, b) => a - b)
    expect(m.insertedVersions).toEqual(sorted)
    expect(m.insertedVersions[0]).toBe(1)
  })

  it('is idempotent — running twice only applies migrations once', () => {
    const m = makeMockDb({ initialVersion: 0 })
    runMigrations(m.db as any)
    const firstRunInserts = [...m.insertedVersions]

    runMigrations(m.db as any)

    // No new versions inserted on the second run.
    expect(m.insertedVersions).toEqual(firstRunInserts)
  })

  it('skips already-applied migrations (resume from partial state)', () => {
    const m = makeMockDb({ initialVersion: 10 })
    runMigrations(m.db as any)

    // Only versions > 10 should have been inserted.
    for (const v of m.insertedVersions) {
      expect(v).toBeGreaterThan(10)
    }
    // And at least one version was inserted (we know there are migrations >10).
    expect(m.insertedVersions.length).toBeGreaterThan(0)
  })

  it('falls back to per-statement retry when a transaction fails (duplicate column path)', () => {
    let failCount = 0
    const m = makeMockDb({
      initialVersion: 0,
      failTransaction: (version) => {
        // Fail version 2's transaction once; runMigrations should then retry
        // per-statement. The per-statement path allows "duplicate column"
        // style errors to be swallowed.
        if (version === 2 && failCount === 0) {
          failCount++
          return true
        }
        return false
      },
      failStatement: (sql) => {
        // When the retry path runs the same ALTER statement, let it report
        // "duplicate column" which runMigrations ignores.
        if (/ALTER TABLE notes ADD COLUMN time_range/i.test(sql) && failCount > 0) {
          return new Error('duplicate column name: time_range')
        }
        return null
      },
    })

    expect(() => runMigrations(m.db as any)).not.toThrow()

    // schema_version should still include version 2 after the fallback path
    // (INSERT OR REPLACE).
    expect(m.insertedVersions).toContain(2)
  })

  it('no-ops when already at the latest version', () => {
    // Pick a version far beyond any real migration — runMigrations should exit early.
    const m = makeMockDb({ initialVersion: 9999 })
    runMigrations(m.db as any)

    // schema_version table CREATE is the only exec expected.
    expect(m.execCalls.length).toBe(1)
    expect(m.execCalls[0].sql).toMatch(/CREATE TABLE IF NOT EXISTS schema_version/)
    expect(m.insertedVersions).toEqual([])
  })
})

describe('migration list integrity', () => {
  it('schema has monotonically increasing version numbers with no gaps', () => {
    // Indirectly verify by driving a mock DB starting from each version.
    // If any gap existed, the "from N to N+2" step would skip N+1.
    const m = makeMockDb({ initialVersion: 0 })
    runMigrations(m.db as any)
    const versions = [...m.insertedVersions]
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBe(versions[i - 1]! + 1)
    }
  })
})
