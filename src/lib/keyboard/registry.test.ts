import { describe, it, expect, beforeEach } from 'vitest'
import {
  SHORTCUT_DEFS,
  getShortcutDef,
  getBinding,
  setOverride,
  resetOverride,
  resetAllOverrides,
  findConflicts,
  byGroup,
  loadOverrides,
} from './registry'
import { parseBinding } from './binding'

beforeEach(() => {
  window.localStorage.clear()
})

describe('SHORTCUT_DEFS', () => {
  it('every entry has a valid default binding', () => {
    for (const d of SHORTCUT_DEFS) {
      expect(parseBinding(d.defaultBinding), `invalid binding for ${d.id}: ${d.defaultBinding}`).not.toBe(null)
    }
  })
  it('every id is unique', () => {
    const ids = SHORTCUT_DEFS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('no conflicts in defaults (registry is clean)', () => {
    expect(findConflicts({})).toEqual([])
  })
})

describe('getBinding / setOverride / resetOverride', () => {
  it('returns default when no override', () => {
    expect(getBinding('help.open')).toBe('shift+/')
  })
  it('returns override when set', () => {
    setOverride('help.open', 'mod+?')
    expect(getBinding('help.open')).toBe('mod+?')
  })
  it('deletes override entry when set back to default', () => {
    setOverride('help.open', 'mod+?')
    setOverride('help.open', 'shift+/')
    expect(loadOverrides().help).toBeUndefined()
    expect(getBinding('help.open')).toBe('shift+/')
  })
  it('resetOverride clears single entry', () => {
    setOverride('help.open', 'mod+?')
    resetOverride('help.open')
    expect(getBinding('help.open')).toBe('shift+/')
  })
  it('resetAllOverrides clears everything', () => {
    setOverride('help.open', 'mod+?')
    setOverride('app.search', 'mod+p')
    resetAllOverrides()
    expect(loadOverrides()).toEqual({})
  })
})

describe('findConflicts', () => {
  it('detects two global entries with same binding', () => {
    // force a conflict via override
    setOverride('app.search', 'mod+\\') // same as app.toggle-sidebar default
    const conflicts = findConflicts()
    expect(conflicts).toContainEqual(expect.objectContaining({ binding: 'mod+\\' }))
  })
})

describe('byGroup', () => {
  it('returns groups with items', () => {
    const groups = byGroup()
    expect(groups.length).toBeGreaterThan(0)
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0)
    }
  })
})

describe('getShortcutDef', () => {
  it('returns def by id', () => {
    expect(getShortcutDef('help.open')?.scope).toBe('global')
  })
  it('returns undefined for unknown', () => {
    expect(getShortcutDef('bogus')).toBeUndefined()
  })
})
