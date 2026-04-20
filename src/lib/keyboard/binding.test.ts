import { describe, it, expect } from 'vitest'
import { parseBinding, matches, formatBinding, normalizeKey, KeyLike } from './binding'

function ev(opts: Partial<KeyLike> & { key: string }): KeyLike {
  return { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...opts }
}

describe('parseBinding', () => {
  it('parses bare key', () => {
    expect(parseBinding('j')).toMatchObject({ key: 'j', mod: false, alt: false, shift: false, ctrl: false })
  })
  it('parses mod+k', () => {
    expect(parseBinding('mod+k')).toMatchObject({ key: 'k', mod: true })
    expect(parseBinding('cmd+k')).toMatchObject({ key: 'k', mod: true })
  })
  it('parses shift+/', () => {
    expect(parseBinding('shift+/')).toMatchObject({ key: '/', shift: true })
  })
  it('parses chord', () => {
    const p = parseBinding('g then n')!
    expect(p.key).toBe('g')
    expect(p.then).toBe('n')
  })
  it('case-insensitive', () => {
    expect(parseBinding('CMD+K')).toMatchObject({ mod: true, key: 'k' })
  })
  it('rejects malformed', () => {
    expect(parseBinding('')).toBe(null)
    expect(parseBinding('+')).toBe(null)
    expect(parseBinding('a+b+c+d+e')).toBe(null) // 3 bare keys
  })
})

describe('normalizeKey', () => {
  it.each([
    ['Esc', 'escape'],
    ['Return', 'enter'],
    ['Space', ' '],
    ['Del', 'delete'],
    ['A', 'a'],
  ])('%s → %s', (input, expected) => expect(normalizeKey(input)).toBe(expected))
})

describe('matches', () => {
  it('bare key matches with no modifiers', () => {
    expect(matches(ev({ key: 'j' }), parseBinding('j')!, { mac: true })).toBe(true)
  })
  it('bare key does NOT match with modifiers down', () => {
    expect(matches(ev({ key: 'j', metaKey: true }), parseBinding('j')!, { mac: true })).toBe(false)
  })
  it('mod on mac uses metaKey', () => {
    expect(matches(ev({ key: 'k', metaKey: true }), parseBinding('mod+k')!, { mac: true })).toBe(true)
    expect(matches(ev({ key: 'k', ctrlKey: true }), parseBinding('mod+k')!, { mac: true })).toBe(false)
  })
  it('mod on non-mac uses ctrlKey', () => {
    expect(matches(ev({ key: 'k', ctrlKey: true }), parseBinding('mod+k')!, { mac: false })).toBe(true)
    expect(matches(ev({ key: 'k', metaKey: true }), parseBinding('mod+k')!, { mac: false })).toBe(false)
  })
  it('shift+/ matches "?" key event (shift+/ produces ? on US kb)', () => {
    expect(matches(ev({ key: '/', shiftKey: true }), parseBinding('shift+/')!, { mac: true })).toBe(true)
  })
  it('skips when IME is composing', () => {
    expect(matches(ev({ key: 'j', isComposing: true }), parseBinding('j')!, { mac: true })).toBe(false)
  })
  it('chord second step only fires when prevKey matches first', () => {
    const b = parseBinding('g then n')!
    // First press — evKey is g, no prev
    expect(matches(ev({ key: 'g' }), b, { mac: true })).toBe(true)
    // Second press — prev is g, evKey is n
    expect(matches(ev({ key: 'n' }), b, { mac: true, prevKey: 'g' })).toBe(true)
    // Second press with wrong prev
    expect(matches(ev({ key: 'n' }), b, { mac: true, prevKey: 'x' })).toBe(false)
  })
  it('explicit ctrl matches only when ctrl is down', () => {
    expect(matches(ev({ key: 'c', ctrlKey: true }), parseBinding('ctrl+c')!, { mac: true })).toBe(true)
    expect(matches(ev({ key: 'c', metaKey: true }), parseBinding('ctrl+c')!, { mac: true })).toBe(false)
  })
})

describe('formatBinding', () => {
  it('formats mod on mac', () => {
    expect(formatBinding('mod+k', true)).toBe('⌘K')
  })
  it('formats mod on non-mac', () => {
    expect(formatBinding('mod+k', false)).toBe('CtrlK')
  })
  it('formats shift+/', () => {
    expect(formatBinding('shift+/', true)).toBe('⇧/')
  })
  it('formats chord', () => {
    expect(formatBinding('g then n', true)).toBe('G then N')
  })
  it('formats escape', () => {
    expect(formatBinding('escape', true)).toBe('Esc')
  })
})
