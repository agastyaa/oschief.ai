/**
 * Tests for routine catch-up logic and weekday guard.
 *
 * Tests the pure decision logic for when catch-up should fire
 * and when the weekday guard should skip execution.
 */
import { describe, it, expect } from 'vitest'

// ── Morning Brief Catch-up Logic ───────────────────────────────────

function shouldCatchUpMorningBrief(
  hour: number,
  hasSuccessfulRunToday: boolean
): boolean {
  if (hour >= 10) return false
  if (hasSuccessfulRunToday) return false
  return true
}

describe('morning brief catch-up', () => {
  it('fires at 8am with no run today', () => {
    expect(shouldCatchUpMorningBrief(8, false)).toBe(true)
  })

  it('fires at 9:30am with no run today', () => {
    expect(shouldCatchUpMorningBrief(9, false)).toBe(true)
  })

  it('does NOT fire at 10am (past cutoff)', () => {
    expect(shouldCatchUpMorningBrief(10, false)).toBe(false)
  })

  it('does NOT fire at 11am', () => {
    expect(shouldCatchUpMorningBrief(11, false)).toBe(false)
  })

  it('does NOT fire if already ran today', () => {
    expect(shouldCatchUpMorningBrief(8, true)).toBe(false)
  })

  it('does NOT fire at 3pm even with no run', () => {
    expect(shouldCatchUpMorningBrief(15, false)).toBe(false)
  })
})

// ── End-of-Day Catch-up Logic ──────────────────────────────────────

function shouldCatchUpEndOfDay(
  hour: number,
  minute: number,
  hasSuccessfulRunToday: boolean,
  isWeekday: boolean
): boolean {
  if (hour < 17 || (hour === 17 && minute < 30)) return false
  if (hasSuccessfulRunToday) return false
  if (!isWeekday) return false
  return true
}

describe('end-of-day catch-up', () => {
  it('fires at 6pm on weekday with no run', () => {
    expect(shouldCatchUpEndOfDay(18, 0, false, true)).toBe(true)
  })

  it('fires at 5:31pm on weekday with no run', () => {
    expect(shouldCatchUpEndOfDay(17, 31, false, true)).toBe(true)
  })

  it('does NOT fire at 5:29pm (before cutoff)', () => {
    expect(shouldCatchUpEndOfDay(17, 29, false, true)).toBe(false)
  })

  it('does NOT fire at 3pm', () => {
    expect(shouldCatchUpEndOfDay(15, 0, false, true)).toBe(false)
  })

  it('does NOT fire if already ran today', () => {
    expect(shouldCatchUpEndOfDay(18, 0, true, true)).toBe(false)
  })

  it('does NOT fire on weekend', () => {
    expect(shouldCatchUpEndOfDay(18, 0, false, false)).toBe(false)
  })

  it('fires at 11pm on weekday with no run', () => {
    expect(shouldCatchUpEndOfDay(23, 0, false, true)).toBe(true)
  })
})

// ── Weekday Guard ──────────────────────────────────────────────────

function isWeekday(dayOfWeek: number): boolean {
  return dayOfWeek >= 1 && dayOfWeek <= 5
}

describe('weekday guard', () => {
  it('Monday (1) is a weekday', () => expect(isWeekday(1)).toBe(true))
  it('Friday (5) is a weekday', () => expect(isWeekday(5)).toBe(true))
  it('Saturday (6) is NOT a weekday', () => expect(isWeekday(6)).toBe(false))
  it('Sunday (0) is NOT a weekday', () => expect(isWeekday(0)).toBe(false))
  it('Wednesday (3) is a weekday', () => expect(isWeekday(3)).toBe(true))
})
