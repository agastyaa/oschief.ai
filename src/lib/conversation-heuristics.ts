/**
 * Deterministic signals for conversation coaching (transparent chips + LLM grounding).
 * Pure functions — safe to run in renderer; same inputs passed to main for analysis.
 */
import { countWords } from './transcript-utils'

import type { TranscriptLine } from "./coaching-analytics";

export type ConversationHeuristics = {
  yourTurns: number
  yourTurnsWithQuestion: number
  questionRatioYou: number
  longestYouMonologueWords: number
  longestYouMonologueLines: number
  totalYouWords: number
  /** Simple tags derived from rules (LLM may add more) */
  suggestedHabitTags: string[]
}

const SALES_DISCOVERY = /\b(pain|priority|budget|timeline|decision|stakeholder|goal|challenge|problem|need|current process)\b/i
const SALES_DEMO = /\b(let me show|demo|screen.?share|walk you through|as you can see|click here)\b/i

/**
 * Heuristics from transcript. meetingDurationSec optional for density hints.
 */
export function computeConversationHeuristics(
  transcript: TranscriptLine[],
  meetingDurationSec: number,
  roleId?: string
): ConversationHeuristics {
  const yourLines = transcript.filter((l) => l.speaker === "You")
  const yourTurns = yourLines.length
  const yourTurnsWithQuestion = yourLines.filter((l) => /\?\s*$/.test(l.text.trim()) || l.text.includes("?")).length
  const questionRatioYou = yourTurns > 0 ? Math.round((yourTurnsWithQuestion / yourTurns) * 100) / 100 : 0

  let longestRunWords = 0
  let longestRunLines = 0
  let runWords = 0
  let runLines = 0
  for (const line of transcript) {
    if (line.speaker === "You") {
      runWords += countWords(line.text)
      runLines += 1
    } else {
      if (runWords > longestRunWords) {
        longestRunWords = runWords
        longestRunLines = runLines
      }
      runWords = 0
      runLines = 0
    }
  }
  if (runWords > longestRunWords) {
    longestRunWords = runWords
    longestRunLines = runLines
  }

  const totalYouWords = yourLines.reduce((s, l) => s + countWords(l.text), 0)

  const suggestedHabitTags: string[] = []
  if (questionRatioYou < 0.15 && yourTurns >= 5) suggestedHabitTags.push("low_questions")
  if (longestRunWords >= 120) suggestedHabitTags.push("long_monologue")
  if (roleId === "sales") {
    let demoScore = 0
    let discoveryScore = 0
    for (const l of yourLines) {
      if (SALES_DEMO.test(l.text)) demoScore++
      if (SALES_DISCOVERY.test(l.text)) discoveryScore++
    }
    if (demoScore > 0 && discoveryScore < demoScore) suggestedHabitTags.push("demo_before_discovery_risk")
  }

  return {
    yourTurns,
    yourTurnsWithQuestion,
    questionRatioYou,
    longestYouMonologueWords: longestRunWords,
    longestYouMonologueLines: longestRunLines,
    totalYouWords,
    suggestedHabitTags,
  }
}

/** Find first transcript line whose text contains the quote snippet (for scroll-to). */
export function findTranscriptLineIndexForQuote(
  transcript: TranscriptLine[],
  quote: string
): number | undefined {
  const q = quote.trim().slice(0, 200)
  if (q.length < 8) return undefined
  const lower = q.toLowerCase()
  const idx = transcript.findIndex((l) => l.text.toLowerCase().includes(lower))
  if (idx >= 0) return idx
  // Prefix match on first 40 chars
  const short = lower.slice(0, 40)
  if (short.length < 8) return undefined
  return transcript.findIndex((l) => l.text.toLowerCase().includes(short))
}
