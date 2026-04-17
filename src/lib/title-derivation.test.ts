import { describe, it, expect } from 'vitest'
import {
  isGenericTitle,
  deriveTitleFromText,
  deriveTitleFromTranscript,
  generateDateTitle,
  deriveTitleFromCalendar,
} from './title-derivation'

describe('isGenericTitle', () => {
  it('returns true for known generic titles', () => {
    expect(isGenericTitle('Meeting Notes')).toBe(true)
    expect(isGenericTitle('this meeting')).toBe(true)
    expect(isGenericTitle('Untitled')).toBe(true)
    expect(isGenericTitle('untitled meeting')).toBe(true)
    expect(isGenericTitle('New Note')).toBe(true)
  })

  it('returns true for empty or whitespace-only titles', () => {
    expect(isGenericTitle('')).toBe(true)
    expect(isGenericTitle('   ')).toBe(true)
  })

  it('returns true for auto-generated date-based titles', () => {
    expect(isGenericTitle('Meeting — Apr 15, 10:30 AM')).toBe(true)
    expect(isGenericTitle('Meeting - Jan 3, 9:00 AM')).toBe(true)
  })

  it('returns false for real titles', () => {
    expect(isGenericTitle('Kickoff with design team')).toBe(false)
    expect(isGenericTitle('Q2 planning sync')).toBe(false)
    expect(isGenericTitle('1:1 with Alice')).toBe(false)
  })
})

describe('deriveTitleFromText', () => {
  it('returns null for text shorter than minLen', () => {
    expect(deriveTitleFromText('hi')).toBeNull()
    expect(deriveTitleFromText('')).toBeNull()
    expect(deriveTitleFromText(null as any)).toBeNull()
  })

  it('returns first clause within length bounds', () => {
    const result = deriveTitleFromText('Discussing the quarterly roadmap today, lots to cover')
    expect(result).toBe('Discussing the quarterly roadmap today')
  })

  it('truncates at word boundary when first clause is too long', () => {
    const longClause =
      'we were just walking through a really long rambling monologue with no sentence breaks anywhere in sight continuing forever'
    const result = deriveTitleFromText(longClause, { maxLen: 60 })
    expect(result).toBeTruthy()
    expect(result!.length).toBeLessThanOrEqual(60)
    // Every word in the result is a real word from the input (no mid-word cut)
    for (const w of result!.split(/\s+/)) {
      expect(longClause).toContain(w)
    }
  })

  it('splits on multiple boundary chars (. ! ? ; , newline)', () => {
    expect(deriveTitleFromText('First bit; second bit')).toBe('First bit')
    expect(deriveTitleFromText('Hello there! Second sentence.')).toBe('Hello there')
    expect(deriveTitleFromText('Line one\nline two')).toBe('Line one')
  })

  it('respects custom minLen/maxLen', () => {
    expect(deriveTitleFromText('short.', { minLen: 20 })).toBeNull()
    expect(deriveTitleFromText('just enough here', { minLen: 5, maxLen: 20 })).toBe('just enough here')
  })
})

describe('deriveTitleFromTranscript', () => {
  it('returns null for empty transcript', () => {
    expect(deriveTitleFromTranscript([])).toBeNull()
    expect(deriveTitleFromTranscript(null as any)).toBeNull()
  })

  it('returns null when total content is under 150 chars', () => {
    const t = [{ speaker: 'You', time: '0:00', text: 'Just a short bit' }]
    expect(deriveTitleFromTranscript(t)).toBeNull()
  })

  it('prefers opening text from first speaker', () => {
    const t = [
      { speaker: 'You', time: '0:00', text: 'Today we are planning the Q2 product roadmap and budget allocations.' },
      { speaker: 'Others', time: '0:15', text: 'Sounds good to me, let us go through each section.' },
      { speaker: 'You', time: '0:30', text: 'Great, let me share my screen and walk through it.' },
      { speaker: 'Others', time: '0:45', text: 'Go for it whenever you are ready and we will follow along.' },
    ]
    const result = deriveTitleFromTranscript(t)
    expect(result).toBeTruthy()
    expect(result!.toLowerCase()).toMatch(/q2|product|roadmap/)
  })
})

describe('generateDateTitle', () => {
  it('returns a Meeting — date, time formatted string', () => {
    const title = generateDateTitle()
    expect(title).toMatch(/^Meeting — /)
    expect(title.length).toBeGreaterThan('Meeting — '.length)
  })

  it('fallback title itself is considered generic', () => {
    expect(isGenericTitle(generateDateTitle())).toBe(true)
  })
})

describe('deriveTitleFromCalendar', () => {
  const now = Date.parse('2026-04-16T10:00:00Z')
  const events = [
    { title: 'Weekly 1:1 with Alice', start: now, end: now + 30 * 60 * 1000 },
    { title: 'Untitled', start: now + 60 * 60 * 1000, end: now + 90 * 60 * 1000 },
  ]

  it('returns matching event title when meeting start overlaps', () => {
    expect(deriveTitleFromCalendar(events, now + 5 * 60 * 1000)).toBe('Weekly 1:1 with Alice')
  })

  it('matches within 5-minute window before start', () => {
    expect(deriveTitleFromCalendar(events, now - 3 * 60 * 1000)).toBe('Weekly 1:1 with Alice')
  })

  it('returns null for non-overlapping time', () => {
    expect(deriveTitleFromCalendar(events, now + 24 * 60 * 60 * 1000)).toBeNull()
  })

  it('skips events with generic titles even when time overlaps', () => {
    expect(deriveTitleFromCalendar(events, now + 75 * 60 * 1000)).toBeNull()
  })

  it('returns null for empty calendar events', () => {
    expect(deriveTitleFromCalendar([], now)).toBeNull()
  })
})
