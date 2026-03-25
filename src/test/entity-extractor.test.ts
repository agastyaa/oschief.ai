/**
 * Tests for entity extractor's JSON parsing and field extraction.
 * Verifies that the parser handles malformed LLM responses gracefully.
 */
import { describe, it, expect } from 'vitest'

// Replicate parseExtractionResponse from entity-extractor.ts
function parseExtractionResponse(response: string): {
  people: any[]; commitments: any[]; topics: string[];
  project?: string; decisions?: any[]
} {
  let jsonStr = response.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      people: Array.isArray(parsed.people) ? parsed.people.filter((p: any) => p?.name) : [],
      commitments: Array.isArray(parsed.commitments) ? parsed.commitments.filter((c: any) => c?.text) : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.filter((t: any) => typeof t === 'string' && t.trim()) : [],
      project: typeof parsed.project === 'string' && parsed.project.trim() ? parsed.project.trim() : undefined,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((d: any) => d?.text) : [],
    }
  } catch {
    return { people: [], commitments: [], topics: [], decisions: [] }
  }
}

describe('parseExtractionResponse', () => {
  it('parses valid JSON response', () => {
    const response = JSON.stringify({
      people: [{ name: 'Jane Doe', email: 'jane@acme.com' }],
      commitments: [{ text: 'Send report', owner: 'you' }],
      topics: ['Budget'],
      project: 'ACME',
      decisions: [{ text: 'Approved budget', context: 'Q4 planning' }],
    })
    const result = parseExtractionResponse(response)
    expect(result.people).toHaveLength(1)
    expect(result.people[0].name).toBe('Jane Doe')
    expect(result.commitments).toHaveLength(1)
    expect(result.topics).toEqual(['Budget'])
    expect(result.project).toBe('ACME')
    expect(result.decisions).toHaveLength(1)
  })

  it('extracts JSON from markdown code block', () => {
    const response = '```json\n{"people":[],"commitments":[],"topics":["AI"],"project":null,"decisions":[]}\n```'
    const result = parseExtractionResponse(response)
    expect(result.topics).toEqual(['AI'])
    expect(result.project).toBeUndefined()
  })

  it('handles response with extra text around JSON', () => {
    const response = 'Here is the extraction:\n{"people":[{"name":"Bob"}],"commitments":[],"topics":[],"decisions":[]}\nDone!'
    const result = parseExtractionResponse(response)
    expect(result.people).toHaveLength(1)
    expect(result.people[0].name).toBe('Bob')
  })

  it('returns empty arrays for completely invalid JSON', () => {
    const result = parseExtractionResponse('This is not JSON at all')
    expect(result.people).toEqual([])
    expect(result.commitments).toEqual([])
    expect(result.topics).toEqual([])
    expect(result.decisions).toEqual([])
  })

  it('filters out people without names', () => {
    const response = JSON.stringify({
      people: [{ name: 'Jane' }, { email: 'no-name@x.com' }, { name: '' }],
      commitments: [], topics: [], decisions: [],
    })
    const result = parseExtractionResponse(response)
    expect(result.people).toHaveLength(1)
  })

  it('filters out commitments without text', () => {
    const response = JSON.stringify({
      people: [], topics: [], decisions: [],
      commitments: [{ text: 'Valid' }, { owner: 'you' }, { text: '' }],
    })
    const result = parseExtractionResponse(response)
    expect(result.commitments).toHaveLength(1)
  })

  it('filters empty topics', () => {
    const response = JSON.stringify({
      people: [], commitments: [], decisions: [],
      topics: ['Valid', '', '  ', 'Also Valid'],
    })
    const result = parseExtractionResponse(response)
    expect(result.topics).toEqual(['Valid', 'Also Valid'])
  })

  it('handles null project as undefined', () => {
    const response = JSON.stringify({
      people: [], commitments: [], topics: [], decisions: [],
      project: null,
    })
    const result = parseExtractionResponse(response)
    expect(result.project).toBeUndefined()
  })

  it('handles empty string project as undefined', () => {
    const response = JSON.stringify({
      people: [], commitments: [], topics: [], decisions: [],
      project: '  ',
    })
    const result = parseExtractionResponse(response)
    expect(result.project).toBeUndefined()
  })

  it('handles missing decisions field gracefully', () => {
    const response = JSON.stringify({
      people: [], commitments: [], topics: [],
    })
    const result = parseExtractionResponse(response)
    expect(result.decisions).toEqual([])
  })

  it('handles LLM refusal response', () => {
    const response = "I'm sorry, I cannot extract entities from this content."
    const result = parseExtractionResponse(response)
    expect(result.people).toEqual([])
  })

  it('trims whitespace from project name', () => {
    const response = JSON.stringify({
      people: [], commitments: [], topics: [], decisions: [],
      project: '  ACME Revamp  ',
    })
    const result = parseExtractionResponse(response)
    expect(result.project).toBe('ACME Revamp')
  })
})
