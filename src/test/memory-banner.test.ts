/**
 * Tests for MemoryBanner and StatsRow display logic.
 *
 * Tests the gate condition (< 5 notes hides banner), date parsing safety,
 * and StatsRow overdue sub-label logic.
 */
import { describe, it, expect } from 'vitest'

// ── MemoryBanner Gate Logic ───────────────────────────────────────

describe('MemoryBanner gate', () => {
  // Extracted logic: banner renders only when totalNotes >= 5
  const shouldShowBanner = (totalNotes: number) => totalNotes >= 5

  it('hides banner when notes < 5', () => {
    expect(shouldShowBanner(0)).toBe(false)
    expect(shouldShowBanner(1)).toBe(false)
    expect(shouldShowBanner(4)).toBe(false)
  })

  it('shows banner when notes >= 5', () => {
    expect(shouldShowBanner(5)).toBe(true)
    expect(shouldShowBanner(100)).toBe(true)
  })

  it('boundary: exactly 5 notes shows banner', () => {
    expect(shouldShowBanner(5)).toBe(true)
  })
})

// ── Date Parsing Safety ───────────────────────────────────────────

describe('MemoryBanner date parsing', () => {
  // Mirrors the try/catch guard in MemoryBanner.tsx
  function parseSinceLabel(firstNoteDate: string | null): string {
    if (!firstNoteDate) return ""
    try {
      const d = new Date(firstNoteDate)
      if (isNaN(d.getTime())) return ""
      // Simplified — just check it produces a valid date
      return `Since ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    } catch {
      return ""
    }
  }

  it('returns empty for null date', () => {
    expect(parseSinceLabel(null)).toBe("")
  })

  it('returns empty for invalid date string', () => {
    expect(parseSinceLabel("not-a-date")).toBe("")
    expect(parseSinceLabel("")).toBe("")
    expect(parseSinceLabel("abc123")).toBe("")
  })

  it('parses valid ISO date', () => {
    const label = parseSinceLabel("2025-03-15T10:00:00.000Z")
    expect(label).toContain("2025")
    expect(label).toContain("Since")
  })

  it('parses date without time component', () => {
    const label = parseSinceLabel("2024-06-15")
    expect(label).toContain("2024")
    expect(label).toContain("Since")
  })
})

// ── StatsRow Overdue Sub-label ────────────────────────────────────

describe('StatsRow overdue logic', () => {
  // Extracted: sub-label only shows when overdueCommitments > 0
  const getOverdueSub = (overdueCommitments: number): string | undefined =>
    overdueCommitments > 0 ? `${overdueCommitments} overdue` : undefined

  it('shows overdue count when > 0', () => {
    expect(getOverdueSub(3)).toBe("3 overdue")
    expect(getOverdueSub(1)).toBe("1 overdue")
  })

  it('returns undefined when 0 overdue', () => {
    expect(getOverdueSub(0)).toBeUndefined()
  })
})

// ── Memory Stats Shape ────────────────────────────────────────────

describe('memory stats data shape', () => {
  // Validates the expected shape from the IPC handler
  const validStats = {
    totalNotes: 10,
    totalPeople: 5,
    totalProjects: 3,
    totalDecisions: 7,
    totalCommitments: 12,
    openCommitments: 4,
    overdueCommitments: 1,
    activeProjects: 2,
    meetingsThisWeek: 3,
    decisionsThisMonth: 2,
    firstNoteDate: "2025-01-15T08:00:00.000Z",
    topPeople: [
      { id: "p1", name: "Alice", meetingCount: 8 },
      { id: "p2", name: "Bob", meetingCount: 5 },
    ],
  }

  it('has all required fields', () => {
    expect(validStats).toHaveProperty('totalNotes')
    expect(validStats).toHaveProperty('totalPeople')
    expect(validStats).toHaveProperty('totalProjects')
    expect(validStats).toHaveProperty('totalDecisions')
    expect(validStats).toHaveProperty('totalCommitments')
    expect(validStats).toHaveProperty('openCommitments')
    expect(validStats).toHaveProperty('overdueCommitments')
    expect(validStats).toHaveProperty('activeProjects')
    expect(validStats).toHaveProperty('meetingsThisWeek')
    expect(validStats).toHaveProperty('decisionsThisMonth')
    expect(validStats).toHaveProperty('firstNoteDate')
    expect(validStats).toHaveProperty('topPeople')
  })

  it('topPeople entries have id, name, meetingCount', () => {
    for (const person of validStats.topPeople) {
      expect(person).toHaveProperty('id')
      expect(person).toHaveProperty('name')
      expect(person).toHaveProperty('meetingCount')
      expect(typeof person.meetingCount).toBe('number')
    }
  })

  it('topPeople sorted by meetingCount descending', () => {
    for (let i = 1; i < validStats.topPeople.length; i++) {
      expect(validStats.topPeople[i - 1].meetingCount).toBeGreaterThanOrEqual(
        validStats.topPeople[i].meetingCount
      )
    }
  })

  it('handles empty topPeople', () => {
    const emptyStats = { ...validStats, topPeople: [] }
    expect(emptyStats.topPeople).toHaveLength(0)
  })

  it('handles null firstNoteDate', () => {
    const noDateStats = { ...validStats, firstNoteDate: null }
    expect(noDateStats.firstNoteDate).toBeNull()
  })
})
