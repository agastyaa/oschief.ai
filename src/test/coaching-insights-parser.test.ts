/**
 * Tests for the coaching insights response parser.
 *
 * Verifies that the new v2.8 fields (provocativeQuestion, strategicChallenge)
 * are correctly parsed from LLM responses, and that missing/malformed fields
 * are handled gracefully (backward compatibility).
 */
import { describe, it, expect } from 'vitest'

// Replicate the parsing logic from conversation-coaching.ts (lines ~290-320)
// so we can test it without importing Electron main process code.

interface ConversationMicroInsight {
  text: string
  framework?: string
  evidenceQuote?: string
  speaker?: string
  time?: string
}

interface ConversationKeyMoment {
  title: string
  quote: string
  speaker: string
  time: string
}

interface ConversationInsightsResult {
  headline: string
  narrative: string
  microInsights: ConversationMicroInsight[]
  habitTags: string[]
  keyMoments: ConversationKeyMoment[]
  generatedAt: string
  model?: string
  provocativeQuestion?: string
  strategicChallenge?: string
}

function parseConversationResponse(raw: string): ConversationInsightsResult | null {
  const cleaned = raw.replace(/```json?\n?/gi, '').replace(/```/g, '').trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    return null
  }
  if (typeof parsed.headline !== 'string' || typeof parsed.narrative !== 'string') {
    return null
  }

  const microInsights = Array.isArray(parsed.microInsights)
    ? (parsed.microInsights as ConversationMicroInsight[])
        .filter((m) => m && typeof m.text === 'string')
        .slice(0, 3)
    : []

  const habitTags = Array.isArray(parsed.habitTags)
    ? (parsed.habitTags as string[]).filter((t) => typeof t === 'string').slice(0, 12)
    : []

  const keyMoments = Array.isArray(parsed.keyMoments)
    ? (parsed.keyMoments as ConversationKeyMoment[])
        .filter((k) => k && typeof k.title === 'string' && typeof k.quote === 'string')
        .slice(0, 5)
    : []

  const provocativeQuestion = typeof parsed.provocativeQuestion === 'string'
    ? parsed.provocativeQuestion
    : undefined
  const strategicChallenge = typeof parsed.strategicChallenge === 'string'
    ? parsed.strategicChallenge
    : undefined

  return {
    headline: parsed.headline,
    narrative: parsed.narrative,
    microInsights,
    habitTags,
    keyMoments,
    provocativeQuestion,
    strategicChallenge,
    generatedAt: new Date().toISOString(),
  }
}

// ── Parser Tests ─────────────────────────────────────────────────

describe('Coaching insights response parser', () => {
  it('parses v2.8 response with provocativeQuestion and strategicChallenge', () => {
    const response = JSON.stringify({
      headline: "You're solving the wrong problem",
      narrative: "This meeting reveals you're optimizing delivery when the real issue is discovery.",
      provocativeQuestion: "If your biggest competitor hired your team tomorrow, what would they build first?",
      strategicChallenge: "Stop running sprint planning and spend that hour talking to the 3 customers who churned last month.",
      microInsights: [{ text: "You jumped to timelines before asking why this matters.", evidenceQuote: "Let's figure out the sprint plan", time: "3:42" }],
      habitTags: ["premature_commitment", "solving_wrong_problem"],
      keyMoments: [{ title: "Skipped the why", quote: "Let's figure out the sprint plan", speaker: "You", time: "3:42" }],
    })

    const result = parseConversationResponse(response)
    expect(result).not.toBeNull()
    expect(result!.provocativeQuestion).toBe("If your biggest competitor hired your team tomorrow, what would they build first?")
    expect(result!.strategicChallenge).toBe("Stop running sprint planning and spend that hour talking to the 3 customers who churned last month.")
  })

  it('handles missing provocativeQuestion and strategicChallenge (backward compat)', () => {
    const response = JSON.stringify({
      headline: "Good listening ratio",
      narrative: "You asked more than you talked.",
      microInsights: [],
      habitTags: ["good_questions"],
      keyMoments: [],
    })

    const result = parseConversationResponse(response)
    expect(result).not.toBeNull()
    expect(result!.provocativeQuestion).toBeUndefined()
    expect(result!.strategicChallenge).toBeUndefined()
  })

  it('handles non-string provocativeQuestion (e.g. number, null)', () => {
    const response = JSON.stringify({
      headline: "Test",
      narrative: "Test narrative",
      provocativeQuestion: 42,
      strategicChallenge: null,
      microInsights: [],
      habitTags: [],
      keyMoments: [],
    })

    const result = parseConversationResponse(response)
    expect(result).not.toBeNull()
    expect(result!.provocativeQuestion).toBeUndefined()
    expect(result!.strategicChallenge).toBeUndefined()
  })

  it('strips markdown code fences from response', () => {
    const response = '```json\n{"headline":"Test","narrative":"Narrative","provocativeQuestion":"Why?","microInsights":[],"habitTags":[],"keyMoments":[]}\n```'

    const result = parseConversationResponse(response)
    expect(result).not.toBeNull()
    expect(result!.headline).toBe("Test")
    expect(result!.provocativeQuestion).toBe("Why?")
  })

  it('returns null for invalid JSON', () => {
    expect(parseConversationResponse('not json at all')).toBeNull()
  })

  it('returns null when headline is missing', () => {
    const response = JSON.stringify({
      narrative: "Missing headline",
      microInsights: [],
      habitTags: [],
      keyMoments: [],
    })
    expect(parseConversationResponse(response)).toBeNull()
  })

  it('caps microInsights at 3, habitTags at 12, keyMoments at 5', () => {
    const response = JSON.stringify({
      headline: "Test",
      narrative: "Test",
      microInsights: Array.from({ length: 10 }, (_, i) => ({ text: `insight ${i}` })),
      habitTags: Array.from({ length: 20 }, (_, i) => `tag_${i}`),
      keyMoments: Array.from({ length: 10 }, (_, i) => ({ title: `moment ${i}`, quote: `q${i}`, speaker: "You", time: `${i}:00` })),
    })

    const result = parseConversationResponse(response)
    expect(result).not.toBeNull()
    expect(result!.microInsights).toHaveLength(3)
    expect(result!.habitTags).toHaveLength(12)
    expect(result!.keyMoments).toHaveLength(5)
  })
})

// ── Duration Parsing Tests ───────────────────────────────────────

describe('Duration parsing (from useRunCoachingAnalysis)', () => {
  function parseDuration(duration: string): number {
    const parts = (duration || "0:00").split(":").map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  it('parses MM:SS format', () => {
    expect(parseDuration("3:45")).toBe(225)
    expect(parseDuration("0:30")).toBe(30)
    expect(parseDuration("59:59")).toBe(3599)
  })

  it('parses HH:MM:SS format', () => {
    expect(parseDuration("1:30:00")).toBe(5400)
    expect(parseDuration("0:05:30")).toBe(330)
  })

  it('handles empty/missing duration', () => {
    expect(parseDuration("")).toBe(0)
    expect(parseDuration("0:00")).toBe(0)
  })
})
