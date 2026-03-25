/**
 * Tests for meeting series detection logic.
 * Verifies that recurring meetings are correctly grouped by normalized title.
 */
import { describe, it, expect } from 'vitest'

// Replicate the normalization logic from MeetingSeriesPage.tsx
function normalizeTitle(title: string): string {
  return title
    .replace(/\d{4}[-/]\d{2}[-/]\d{2}/g, '')  // dates
    .replace(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g, '')
    .replace(/#\d+/g, '')                       // "#42"
    .replace(/\bweek\s*\d+/gi, '')              // "Week 12"
    .replace(/\bsprint\s*\d+/gi, '')            // "Sprint 5"
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

describe('normalizeTitle', () => {
  it('strips dates from titles', () => {
    expect(normalizeTitle('Weekly Sync 2026-03-24')).toBe('weekly sync')
  })

  it('strips US-format dates', () => {
    expect(normalizeTitle('Check-in 3/24/2026')).toBe('check-in')
  })

  it('strips issue numbers', () => {
    expect(normalizeTitle('Bug Triage #42')).toBe('bug triage')
  })

  it('strips "Week N" patterns', () => {
    expect(normalizeTitle('Standup Week 12')).toBe('standup')
  })

  it('strips "Sprint N" patterns', () => {
    expect(normalizeTitle('Sprint 5 Retro')).toBe('retro')
  })

  it('normalizes whitespace', () => {
    expect(normalizeTitle('  Weekly   Sync  ')).toBe('weekly sync')
  })

  it('lowercases for comparison', () => {
    expect(normalizeTitle('WEEKLY SYNC')).toBe('weekly sync')
  })

  it('handles empty string', () => {
    expect(normalizeTitle('')).toBe('')
  })

  it('preserves meaningful content', () => {
    expect(normalizeTitle('1:1 with Jane')).toBe('1:1 with jane')
  })
})

describe('series grouping logic', () => {
  it('groups meetings with same normalized title', () => {
    const meetings = [
      { title: 'Weekly Sync 2026-03-24', date: '2026-03-24' },
      { title: 'Weekly Sync 2026-03-17', date: '2026-03-17' },
      { title: 'Weekly Sync 2026-03-10', date: '2026-03-10' },
      { title: '1:1 with Jane', date: '2026-03-20' },
    ]

    const groups: Record<string, typeof meetings> = {}
    for (const m of meetings) {
      const key = normalizeTitle(m.title)
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }

    expect(Object.keys(groups)).toHaveLength(2)
    expect(groups['weekly sync']).toHaveLength(3)
    expect(groups['1:1 with jane']).toHaveLength(1)
  })

  it('only creates series for 2+ meetings', () => {
    const meetings = [
      { title: 'Weekly Sync', date: '2026-03-24' },
      { title: 'Weekly Sync', date: '2026-03-17' },
      { title: 'One-off Meeting', date: '2026-03-20' },
    ]

    const groups: Record<string, typeof meetings> = {}
    for (const m of meetings) {
      const key = normalizeTitle(m.title)
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }

    const series = Object.entries(groups).filter(([, v]) => v.length >= 2)
    expect(series).toHaveLength(1)
    expect(series[0][0]).toBe('weekly sync')
  })
})
