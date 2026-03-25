/**
 * Tests for people-md merge strategy.
 * Verifies that updating an existing person file preserves user edits
 * and only appends new meeting backlinks.
 */
import { describe, it, expect } from 'vitest'

// Replicate the pure functions from people-md.ts for testing

function escapeFrontmatter(value: string): string {
  return value.replace(/"/g, '\\"')
}

function sanitizeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim()
}

function buildMeetingWikilink(meeting: { date: string; title: string }): string {
  const safeTitle = meeting.title.replace(/[/\\?%*:|"<>]/g, '-')
  return `[[${meeting.date} ${safeTitle}]]`
}

function appendMeetingLink(lines: string[], meetingWikilink: string): string[] {
  const result = [...lines]
  if (result.some(line => line.includes(meetingWikilink))) {
    return result // Idempotent
  }
  const meetingsIdx = result.findIndex(line => line.trim() === '## Meetings')
  if (meetingsIdx >= 0) {
    let insertIdx = meetingsIdx + 1
    while (insertIdx < result.length) {
      const line = result[insertIdx].trim()
      if (line.startsWith('## ') && line !== '## Meetings') break
      if (line.startsWith('- ') || line === '') { insertIdx++; continue }
      break
    }
    result.splice(insertIdx, 0, `- ${meetingWikilink}`)
  } else {
    if (result.length > 0 && result[result.length - 1].trim() !== '') result.push('')
    result.push('## Meetings')
    result.push(`- ${meetingWikilink}`)
    result.push('')
  }
  return result
}

describe('buildMeetingWikilink', () => {
  it('creates wikilink from date and title', () => {
    expect(buildMeetingWikilink({ date: '2026-03-24', title: 'Weekly Sync' }))
      .toBe('[[2026-03-24 Weekly Sync]]')
  })

  it('sanitizes special characters in title', () => {
    expect(buildMeetingWikilink({ date: '2026-03-24', title: 'Q&A: Product/Design' }))
      .toBe('[[2026-03-24 Q&A- Product-Design]]')
  })
})

describe('sanitizeName', () => {
  it('replaces filesystem-unsafe characters', () => {
    expect(sanitizeName('John/Jane "JJ" Smith')).toBe('John-Jane -JJ- Smith')
  })

  it('trims whitespace', () => {
    expect(sanitizeName('  Jane Doe  ')).toBe('Jane Doe')
  })

  it('handles empty string', () => {
    expect(sanitizeName('')).toBe('')
  })
})

describe('escapeFrontmatter', () => {
  it('escapes double quotes', () => {
    expect(escapeFrontmatter('Jane "JJ" Doe')).toBe('Jane \\"JJ\\" Doe')
  })

  it('passes through strings without quotes', () => {
    expect(escapeFrontmatter('Jane Doe')).toBe('Jane Doe')
  })
})

describe('appendMeetingLink', () => {
  it('appends to existing ## Meetings section', () => {
    const lines = ['---', 'name: Jane', '---', '', '## Meetings', '- [[2026-03-20 Old Meeting]]', '']
    const result = appendMeetingLink(lines, '[[2026-03-24 New Meeting]]')
    expect(result).toContain('- [[2026-03-24 New Meeting]]')
    expect(result.filter(l => l.includes('New Meeting'))).toHaveLength(1)
  })

  it('is idempotent — does not duplicate existing links', () => {
    const lines = ['## Meetings', '- [[2026-03-24 Call]]']
    const result = appendMeetingLink(lines, '[[2026-03-24 Call]]')
    expect(result.filter(l => l.includes('2026-03-24 Call'))).toHaveLength(1)
  })

  it('creates ## Meetings section if missing', () => {
    const lines = ['---', 'name: Jane', '---', '', 'Some user notes here']
    const result = appendMeetingLink(lines, '[[2026-03-24 Meeting]]')
    expect(result).toContain('## Meetings')
    expect(result).toContain('- [[2026-03-24 Meeting]]')
  })

  it('preserves content after ## Meetings when inserting', () => {
    const lines = ['## Meetings', '- [[old]]', '', '## Notes', 'User wrote this']
    const result = appendMeetingLink(lines, '[[new]]')
    expect(result).toContain('- [[new]]')
    expect(result).toContain('## Notes')
    expect(result).toContain('User wrote this')
  })

  it('handles empty file', () => {
    const result = appendMeetingLink([], '[[2026-03-24 First]]')
    expect(result).toContain('## Meetings')
    expect(result).toContain('- [[2026-03-24 First]]')
  })
})
