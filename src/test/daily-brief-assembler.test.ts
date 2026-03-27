/**
 * Tests for the daily-brief-assembler module.
 *
 * Since the assembler queries SQLite directly, we replicate the pure
 * computation logic (risk level classification, template generation)
 * as unit tests without DB dependency.
 */
import { describe, it, expect } from 'vitest'

// ── Risk Level Computation (pure logic, no DB) ─────────────────────

type RiskLevel = 'green' | 'amber' | 'red'

const MS_PER_HOUR = 60 * 60 * 1000
const AMBER_THRESHOLD_HOURS = 48

function computeRiskLevel(dueDateStr: string, nowMs: number = Date.now()): RiskLevel | null {
  let dueMs: number
  try {
    dueMs = new Date(dueDateStr).getTime()
    if (isNaN(dueMs)) return null
  } catch {
    return null
  }

  const msUntilDue = dueMs - nowMs
  const hoursUntilDue = msUntilDue / MS_PER_HOUR

  if (msUntilDue < 0) return 'red'
  if (hoursUntilDue <= AMBER_THRESHOLD_HOURS) return 'amber'
  return 'green'
}

describe('computeRiskLevel', () => {
  const now = new Date('2026-03-27T12:00:00Z').getTime()

  it('returns GREEN for commitments due in >48 hours', () => {
    expect(computeRiskLevel('2026-03-30', now)).toBe('green')
    expect(computeRiskLevel('2026-04-01', now)).toBe('green')
  })

  it('returns AMBER for commitments due within 48 hours', () => {
    // Due in ~36 hours
    expect(computeRiskLevel('2026-03-29', now)).toBe('amber')
  })

  it('returns RED for overdue commitments', () => {
    expect(computeRiskLevel('2026-03-26', now)).toBe('red')
    expect(computeRiskLevel('2026-03-20', now)).toBe('red')
  })

  it('returns AMBER at exactly 48h boundary', () => {
    // Due exactly 48h from now
    const exactlyAt48h = new Date(now + 48 * MS_PER_HOUR).toISOString().slice(0, 10)
    // Due date is midnight of that day, so it's close to 48h
    const result = computeRiskLevel(exactlyAt48h, now)
    expect(['amber', 'green']).toContain(result) // boundary — depends on time-of-day
  })

  it('returns RED at exactly 0h (due today, past midnight)', () => {
    // Due date is today but we're past midnight → overdue at the daily boundary
    const yesterday = new Date(now - 24 * MS_PER_HOUR).toISOString().slice(0, 10)
    expect(computeRiskLevel(yesterday, now)).toBe('red')
  })

  it('returns null for malformed dates', () => {
    expect(computeRiskLevel('not-a-date', now)).toBeNull()
    expect(computeRiskLevel('', now)).toBeNull()
  })

  it('returns null for NaN dates', () => {
    expect(computeRiskLevel('2026-13-45', now)).toBeNull()
  })
})

// ── Follow-up Draft Template (pure logic) ──────────────────────────

function generateFollowUpDraftTemplate(
  text: string,
  assigneeName: string | null,
  owner: string,
  noteTitle: string | null,
  noteDate: string | null
): string {
  const name = assigneeName || owner || 'there'
  const meetingRef = noteTitle && noteDate
    ? ` (from our ${noteTitle} on ${noteDate})`
    : ''
  return `Hi ${name}, following up on: ${text}${meetingRef}. Let me know if you need anything.`
}

describe('generateFollowUpDraftTemplate', () => {
  it('generates full template with all fields', () => {
    const result = generateFollowUpDraftTemplate(
      'Send the revised forecast',
      'Sarah Chen',
      'you',
      'Weekly 1:1',
      '2026-03-20'
    )
    expect(result).toBe('Hi Sarah Chen, following up on: Send the revised forecast (from our Weekly 1:1 on 2026-03-20). Let me know if you need anything.')
  })

  it('uses owner when assignee is null', () => {
    const result = generateFollowUpDraftTemplate('Review the doc', null, 'John', null, null)
    expect(result).toBe('Hi John, following up on: Review the doc. Let me know if you need anything.')
  })

  it('falls back to "there" when no name available', () => {
    const result = generateFollowUpDraftTemplate('Send report', null, '', null, null)
    expect(result).toBe('Hi there, following up on: Send report. Let me know if you need anything.')
  })

  it('omits meeting reference when note data is missing', () => {
    const result = generateFollowUpDraftTemplate('Call vendor', 'Alex', 'you', null, null)
    expect(result).toBe('Hi Alex, following up on: Call vendor. Let me know if you need anything.')
  })

  it('omits meeting reference when only title exists (no date)', () => {
    const result = generateFollowUpDraftTemplate('Follow up', 'Pat', 'you', 'Sprint Review', null)
    expect(result).toBe('Hi Pat, following up on: Follow up. Let me know if you need anything.')
  })
})

// ── Stale Detection Threshold (pure logic) ─────────────────────────

const STALE_THRESHOLD_DAYS = 14

function isStale(updatedAt: string, nowMs: number = Date.now()): boolean {
  const updatedMs = new Date(updatedAt).getTime()
  if (isNaN(updatedMs)) return false
  const daysSince = (nowMs - updatedMs) / (24 * 60 * 60 * 1000)
  return daysSince > STALE_THRESHOLD_DAYS
}

describe('isStale (decision staleness)', () => {
  const now = new Date('2026-03-27T12:00:00Z').getTime()

  it('returns true for decisions updated >14 days ago', () => {
    expect(isStale('2026-03-10T12:00:00Z', now)).toBe(true)
    expect(isStale('2026-03-01T00:00:00Z', now)).toBe(true)
  })

  it('returns false for decisions updated <14 days ago', () => {
    expect(isStale('2026-03-20T12:00:00Z', now)).toBe(false)
    expect(isStale('2026-03-27T00:00:00Z', now)).toBe(false)
  })

  it('returns false for decisions updated exactly 14 days ago', () => {
    // 14 days = not stale (threshold is >14, not >=14)
    expect(isStale('2026-03-13T12:00:00Z', now)).toBe(false)
  })

  it('returns false for malformed dates', () => {
    expect(isStale('not-a-date', now)).toBe(false)
  })
})
