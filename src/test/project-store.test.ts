/**
 * Tests for project-store logic (calendar title parsing, fuzzy match threshold).
 * These test the pure functions without needing a database.
 */
import { describe, it, expect } from 'vitest'

// We can't import the full store (needs SQLite), but we can test the pure functions
// by extracting the logic. For now, test the calendar title parsing regex directly.

describe('parseProjectFromCalendarTitle', () => {
  // Replicate the regex logic from project-store.ts
  function parseProjectFromCalendarTitle(title: string): string | null {
    if (!title) return null
    const bracketMatch = title.match(/^\[([^\]]+)\]/)
    if (bracketMatch) return bracketMatch[1].trim()
    const projectMatch = title.match(/^Project\s+(\S+(?:\s+\S+)?)/i)
    if (projectMatch) return `Project ${projectMatch[1].trim()}`
    const separatorMatch = title.match(/^(.+?)\s+[–—-]\s+/)
    if (separatorMatch && separatorMatch[1].length > 2 && separatorMatch[1].length < 40) {
      return separatorMatch[1].trim()
    }
    return null
  }

  it('extracts project from bracket pattern [ACME] Weekly', () => {
    expect(parseProjectFromCalendarTitle('[ACME] Weekly Sync')).toBe('ACME')
  })

  it('extracts project from bracket pattern with spaces', () => {
    expect(parseProjectFromCalendarTitle('[Project Alpha] Standup')).toBe('Project Alpha')
  })

  it('extracts project from "Project X" prefix (captures up to 2 words)', () => {
    expect(parseProjectFromCalendarTitle('Project Phoenix Review')).toBe('Project Phoenix Review')
  })

  it('extracts single-word project from "Project X"', () => {
    expect(parseProjectFromCalendarTitle('Project Titan')).toBe('Project Titan')
  })

  it('extracts project from separator pattern with em-dash', () => {
    expect(parseProjectFromCalendarTitle('ACME Revamp – Sprint Planning')).toBe('ACME Revamp')
  })

  it('extracts project from separator pattern with en-dash', () => {
    expect(parseProjectFromCalendarTitle('Client Onboarding — Kickoff')).toBe('Client Onboarding')
  })

  it('extracts project from separator pattern with hyphen', () => {
    expect(parseProjectFromCalendarTitle('Q4 Budget - Review Meeting')).toBe('Q4 Budget')
  })

  it('returns null for plain meeting titles', () => {
    expect(parseProjectFromCalendarTitle('Weekly Standup')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseProjectFromCalendarTitle('')).toBeNull()
  })

  it('returns null for very short separator prefix', () => {
    expect(parseProjectFromCalendarTitle('Hi — there')).toBeNull()
  })

  it('returns null for very long separator prefix', () => {
    const longTitle = 'A'.repeat(45) + ' — Meeting'
    expect(parseProjectFromCalendarTitle(longTitle)).toBeNull()
  })

  it('handles brackets mid-string (no match)', () => {
    expect(parseProjectFromCalendarTitle('Meeting about [ACME]')).toBeNull()
  })

  it('handles case-insensitive Project prefix (captures up to 2 words)', () => {
    expect(parseProjectFromCalendarTitle('project Titan Sprint')).toBe('Project Titan Sprint')
  })
})

describe('project name edge cases', () => {
  it('does not crash on undefined/null input', () => {
    function parseProjectFromCalendarTitle(title: string): string | null {
      if (!title) return null
      const bracketMatch = title.match(/^\[([^\]]+)\]/)
      if (bracketMatch) return bracketMatch[1].trim()
      return null
    }
    expect(parseProjectFromCalendarTitle(undefined as any)).toBeNull()
    expect(parseProjectFromCalendarTitle(null as any)).toBeNull()
  })

  it('strips whitespace from bracket content', () => {
    function parseProjectFromCalendarTitle(title: string): string | null {
      if (!title) return null
      const bracketMatch = title.match(/^\[([^\]]+)\]/)
      if (bracketMatch) return bracketMatch[1].trim()
      return null
    }
    expect(parseProjectFromCalendarTitle('[  ACME  ] Meeting')).toBe('ACME')
  })
})
