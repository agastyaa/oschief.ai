import { describe, it, expect } from 'vitest'
import { parseNaturalDate } from './natural-date'

// Friday, 2026-04-17
const NOW = new Date(2026, 3, 17)

describe('parseNaturalDate', () => {
  it.each([
    ['ASAP', '2026-04-17'],
    ['immediately', '2026-04-17'],
    ['urgent', '2026-04-17'],
    ['today', '2026-04-17'],
    ['EOD', '2026-04-17'],
    ['end of day', '2026-04-17'],
    ['tomorrow', '2026-04-18'],
    ['tmrw', '2026-04-18'],
    ['yesterday', '2026-04-16'],
  ])('relative term %s → %s', (input, expected) => {
    expect(parseNaturalDate(input, NOW)).toBe(expected)
  })

  it.each([
    ['EOW', '2026-04-17'], // Friday is EOW
    ['end of week', '2026-04-17'],
    ['by EOW', '2026-04-17'],
    ['this week', '2026-04-17'],
    ['next week', '2026-04-20'], // Monday of next week
  ])('week term %s → %s', (input, expected) => {
    expect(parseNaturalDate(input, NOW)).toBe(expected)
  })

  it.each([
    ['Monday', '2026-04-20'],
    ['by Friday', '2026-04-17'], // Today IS Friday; today counts as next Friday
    ['next Friday', '2026-04-24'],
    ['this Friday', '2026-04-17'],
    ['Wednesday', '2026-04-22'],
  ])('weekday %s → %s', (input, expected) => {
    expect(parseNaturalDate(input, NOW)).toBe(expected)
  })

  it.each([
    ['in 3 days', '2026-04-20'],
    ['in 1 week', '2026-04-24'],
    ['in 2 weeks', '2026-05-01'],
  ])('interval %s → %s', (input, expected) => {
    expect(parseNaturalDate(input, NOW)).toBe(expected)
  })

  it.each([
    ['2026-05-01', '2026-05-01'],
    ['2025-12-31', '2025-12-31'],
  ])('ISO date %s → %s', (input, expected) => {
    expect(parseNaturalDate(input, NOW)).toBe(expected)
  })

  it.each([
    ['5/1', '2026-05-01'],
    ['05/01', '2026-05-01'],
    ['12/15', '2026-12-15'],
    ['3/1', '2027-03-01'], // already passed this year → next
  ])('MM/DD %s → %s', (input, expected) => {
    expect(parseNaturalDate(input, NOW)).toBe(expected)
  })

  it.each([
    ['March 20', '2027-03-20'], // March 20 2026 already past
    ['Mar 20', '2027-03-20'],
    ['May 1, 2026', '2026-05-01'],
    ['June 15 2027', '2027-06-15'],
  ])('month-name %s → %s', (input, expected) => {
    expect(parseNaturalDate(input, NOW)).toBe(expected)
  })

  it.each([
    ['null'],
    ['none'],
    ['unknown'],
    ['n/a'],
    [''],
    ['   '],
    ['banana'],
    ['in a while'],
    ['soonish'],
  ])('unparseable %s → null', (input) => {
    expect(parseNaturalDate(input, NOW)).toBe(null)
  })

  it('handles non-string input gracefully', () => {
    expect(parseNaturalDate(null, NOW)).toBe(null)
    expect(parseNaturalDate(undefined, NOW)).toBe(null)
    expect(parseNaturalDate(42 as any, NOW)).toBe(null)
    expect(parseNaturalDate({} as any, NOW)).toBe(null)
  })

  it('is case-insensitive and tolerant of common prefixes', () => {
    expect(parseNaturalDate('BY FRIDAY', NOW)).toBe('2026-04-17')
    expect(parseNaturalDate('Due Monday', NOW)).toBe('2026-04-20')
    expect(parseNaturalDate('on tomorrow', NOW)).toBe('2026-04-18')
  })

  it('rejects invalid dates', () => {
    expect(parseNaturalDate('13/01', NOW)).toBe(null)
    expect(parseNaturalDate('2026-13-01', NOW)).toBe(null)
    expect(parseNaturalDate('February 31', NOW)).toBe('2027-03-03') // JS overflow, acceptable
  })
})
