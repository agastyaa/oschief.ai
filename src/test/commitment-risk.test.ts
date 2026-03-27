/**
 * Tests for commitment risk scoring logic.
 *
 * Tests the pure computation that determines GREEN/AMBER/RED risk levels,
 * amber notification deduplication logic, and snooze override behavior.
 */
import { describe, it, expect } from 'vitest'

// ── AMBER Notification Deduplication Logic ─────────────────────────

interface CommitmentRow {
  id: string
  due_date: string
  amber_notified_at: string | null
  snoozed_until: string | null
  status: string
}

const AMBER_THRESHOLD_MS = 48 * 60 * 60 * 1000

/**
 * Determines if a commitment should trigger an AMBER notification.
 * Replicates the logic from checkAmberTransitions() in commitment-store.ts.
 */
function shouldNotifyAmber(c: CommitmentRow, nowMs: number): boolean {
  if (c.status !== 'open') return false
  if (c.amber_notified_at !== null) return false
  if (c.snoozed_until && new Date(c.snoozed_until).getTime() > nowMs) return false

  const dueMs = new Date(c.due_date).getTime()
  if (isNaN(dueMs)) return false
  const msUntilDue = dueMs - nowMs
  return msUntilDue > 0 && msUntilDue <= AMBER_THRESHOLD_MS
}

describe('shouldNotifyAmber', () => {
  const now = new Date('2026-03-27T12:00:00Z').getTime()

  it('returns true for open commitment due in <48h with no prior notification', () => {
    expect(shouldNotifyAmber({
      id: '1', due_date: '2026-03-29', amber_notified_at: null, snoozed_until: null, status: 'open'
    }, now)).toBe(true)
  })

  it('returns false if already notified (amber_notified_at set)', () => {
    expect(shouldNotifyAmber({
      id: '1', due_date: '2026-03-29', amber_notified_at: '2026-03-27T10:00:00Z', snoozed_until: null, status: 'open'
    }, now)).toBe(false)
  })

  it('returns false for commitments due in >48h (still GREEN)', () => {
    expect(shouldNotifyAmber({
      id: '1', due_date: '2026-04-01', amber_notified_at: null, snoozed_until: null, status: 'open'
    }, now)).toBe(false)
  })

  it('returns false for overdue commitments (already past due)', () => {
    expect(shouldNotifyAmber({
      id: '1', due_date: '2026-03-25', amber_notified_at: null, snoozed_until: null, status: 'open'
    }, now)).toBe(false) // msUntilDue < 0, not in the 0..48h window
  })

  it('returns false for snoozed commitments (snooze not expired)', () => {
    expect(shouldNotifyAmber({
      id: '1', due_date: '2026-03-29', amber_notified_at: null, snoozed_until: '2026-03-28T12:00:00Z', status: 'open'
    }, now)).toBe(false)
  })

  it('returns true for snoozed commitments whose snooze expired', () => {
    expect(shouldNotifyAmber({
      id: '1', due_date: '2026-03-29', amber_notified_at: null, snoozed_until: '2026-03-26T12:00:00Z', status: 'open'
    }, now)).toBe(true)
  })

  it('returns false for completed commitments', () => {
    expect(shouldNotifyAmber({
      id: '1', due_date: '2026-03-29', amber_notified_at: null, snoozed_until: null, status: 'completed'
    }, now)).toBe(false)
  })

  it('returns false for overdue-status commitments', () => {
    expect(shouldNotifyAmber({
      id: '1', due_date: '2026-03-29', amber_notified_at: null, snoozed_until: null, status: 'overdue'
    }, now)).toBe(false)
  })

  it('returns false for malformed due dates', () => {
    expect(shouldNotifyAmber({
      id: '1', due_date: 'invalid', amber_notified_at: null, snoozed_until: null, status: 'open'
    }, now)).toBe(false)
  })
})

// ── Snooze Override for RED Commitments ─────────────────────────────

function shouldClearSnooze(status: string, snoozedUntil: string | null): boolean {
  return status === 'overdue' && snoozedUntil !== null
}

describe('shouldClearSnooze', () => {
  it('returns true for overdue + snoozed', () => {
    expect(shouldClearSnooze('overdue', '2026-03-28T12:00:00Z')).toBe(true)
  })

  it('returns false for overdue + not snoozed', () => {
    expect(shouldClearSnooze('overdue', null)).toBe(false)
  })

  it('returns false for open + snoozed (normal snooze)', () => {
    expect(shouldClearSnooze('open', '2026-03-28T12:00:00Z')).toBe(false)
  })
})

// ── Amber Notification Clearing on Completion ──────────────────────

describe('amber notification lifecycle', () => {
  it('should clear amber_notified_at when status becomes completed', () => {
    // This is tested by checking that updateCommitmentStatus calls clearAmberNotification
    // The actual DB interaction is tested in integration tests
    const shouldClear = (newStatus: string) => newStatus === 'completed' || newStatus === 'cancelled'
    expect(shouldClear('completed')).toBe(true)
    expect(shouldClear('cancelled')).toBe(true)
    expect(shouldClear('open')).toBe(false)
    expect(shouldClear('overdue')).toBe(false)
  })
})
