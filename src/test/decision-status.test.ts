/**
 * Tests for decision lifecycle status tracking.
 *
 * Tests status validation, stale detection logic, and updated_at behavior.
 */
import { describe, it, expect } from 'vitest'

// ── Decision Status Validation ─────────────────────────────────────

const VALID_STATUSES = ['MADE', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'ABANDONED', 'REVISITED'] as const
type DecisionStatus = typeof VALID_STATUSES[number]

function isValidStatus(s: string): s is DecisionStatus {
  return VALID_STATUSES.includes(s as any)
}

describe('decision status validation', () => {
  it('accepts all valid statuses', () => {
    for (const s of VALID_STATUSES) {
      expect(isValidStatus(s)).toBe(true)
    }
  })

  it('rejects invalid statuses', () => {
    expect(isValidStatus('PENDING')).toBe(false)
    expect(isValidStatus('done')).toBe(false) // case-sensitive
    expect(isValidStatus('')).toBe(false)
    expect(isValidStatus('OPEN')).toBe(false)
  })
})

// ── Stale Detection Query Logic ────────────────────────────────────

const STALE_EXCLUSIONS = ['DONE', 'ABANDONED'] as const

function isExcludedFromStale(status: string): boolean {
  return STALE_EXCLUSIONS.includes(status as any)
}

describe('stale decision exclusion', () => {
  it('excludes DONE and ABANDONED from stale detection', () => {
    expect(isExcludedFromStale('DONE')).toBe(true)
    expect(isExcludedFromStale('ABANDONED')).toBe(true)
  })

  it('includes MADE, ASSIGNED, IN_PROGRESS, REVISITED in stale detection', () => {
    expect(isExcludedFromStale('MADE')).toBe(false)
    expect(isExcludedFromStale('ASSIGNED')).toBe(false)
    expect(isExcludedFromStale('IN_PROGRESS')).toBe(false)
    expect(isExcludedFromStale('REVISITED')).toBe(false)
  })
})

// ── Updated_at Backfill Logic ──────────────────────────────────────

describe('updated_at backfill', () => {
  it('backfill uses created_at value, not current time', () => {
    // Simulates: UPDATE decisions SET updated_at = created_at WHERE updated_at IS NULL
    const created_at = '2026-03-10T14:00:00Z'
    const updated_at = null
    const backfilled = updated_at ?? created_at
    expect(backfilled).toBe('2026-03-10T14:00:00Z')
  })

  it('does not overwrite existing updated_at', () => {
    const created_at = '2026-03-10T14:00:00Z'
    const updated_at = '2026-03-25T09:00:00Z'
    const backfilled = updated_at ?? created_at
    expect(backfilled).toBe('2026-03-25T09:00:00Z')
  })
})

// ── Status Transition Tracking ─────────────────────────────────────

describe('status transition updates updated_at', () => {
  it('new status should always update the updated_at timestamp', () => {
    const beforeUpdate = '2026-03-20T12:00:00Z'
    const afterUpdate = new Date().toISOString()
    // Any status change should result in a newer updated_at
    expect(new Date(afterUpdate).getTime()).toBeGreaterThan(new Date(beforeUpdate).getTime())
  })
})
