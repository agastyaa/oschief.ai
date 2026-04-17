import { describe, it, expect } from 'vitest'
import { SLASH_PROMPT_ITEMS } from '../components/AskBar'

describe('Slash prompt items', () => {
  it('has all expected groups', () => {
    const groups = new Set(SLASH_PROMPT_ITEMS.map(item => item.group))
    expect(groups.has('live')).toBe(true)
    expect(groups.has('catch_up')).toBe(true)
    expect(groups.has('growth')).toBe(true)
    expect(groups.has('output')).toBe(true)
  })

  it('has output format prompts', () => {
    const outputItems = SLASH_PROMPT_ITEMS.filter(item => item.group === 'output')
    expect(outputItems.length).toBe(2)

    const labels = outputItems.map(item => item.label)
    expect(labels).toContain('Exec one-pager')
    expect(labels).toContain('Ticket breakdown')
  })

  it('every item has required fields', () => {
    for (const item of SLASH_PROMPT_ITEMS) {
      expect(item.label).toBeTruthy()
      expect(item.prompt).toBeTruthy()
      expect(item.description).toBeTruthy()
      expect(item.icon).toBeTruthy()
      expect(item.group).toBeTruthy()
    }
  })

  it('has no duplicate labels', () => {
    const labels = SLASH_PROMPT_ITEMS.map(item => item.label)
    const unique = new Set(labels)
    expect(unique.size).toBe(labels.length)
  })

  it('exec one-pager prompt asks for structured output', () => {
    const exec = SLASH_PROMPT_ITEMS.find(item => item.label === 'Exec one-pager')
    expect(exec).toBeDefined()
    expect(exec!.prompt).toContain('Key Decisions')
    expect(exec!.prompt).toContain('Risks')
    expect(exec!.prompt).toContain('Next Steps')
  })

  it('ticket breakdown prompt asks for actionable tickets', () => {
    const tickets = SLASH_PROMPT_ITEMS.find(item => item.label === 'Ticket breakdown')
    expect(tickets).toBeDefined()
    expect(tickets!.prompt).toContain('Title')
    expect(tickets!.prompt).toContain('Assignee')
    expect(tickets!.prompt).toContain('Priority')
  })

  // 'PRD update' was removed from output group; test deleted 2026-04-16 (v2.10)
})
