/**
 * Live Suggestions
 *
 * During recording, takes recent transcript lines, searches the KB
 * for relevant chunks, and asks the LLM for 1-3 talking points.
 */

import { searchKB, getChunkCount } from './kb-store'
import { routeLLM } from '../cloud/router'
import { resolveSelectedAIModel } from '../models/model-resolver'

export interface Suggestion {
  text: string
  source: string
}

const SYSTEM_PROMPT = `You are a meeting copilot. The user is in a live meeting. Based on the recent conversation and relevant excerpts from the user's knowledge base, suggest 1-3 brief, specific talking points the user might want to bring up right now.

Rules:
- Each suggestion should be 1-2 sentences max.
- Be specific and actionable — reference concrete data, names, or facts from the KB excerpts.
- If nothing in the KB is relevant to the current conversation, return an empty JSON array.
- Return ONLY a JSON array of objects with "text" and "source" keys. "source" is the file name the suggestion came from.
- No markdown, no explanation, just the JSON array.`

function extractKeyTerms(transcript: string): string {
  const words = transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)

  // Frequency-based: pick top terms that aren't ultra-common
  const freq = new Map<string, number>()
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1)

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w)
    .join(' ')
}

export async function getLiveSuggestions(
  recentTranscript: string,
  model?: string
): Promise<Suggestion[]> {
  if (getChunkCount() === 0) return []

  const aiModel = resolveSelectedAIModel(model)
  if (!aiModel) return []

  const keyTerms = extractKeyTerms(recentTranscript)
  if (!keyTerms.trim()) return []

  const results = searchKB(keyTerms, 5)
  if (results.length === 0) return []

  const kbContext = results
    .map(r => `[${r.chunk.fileName}]\n${r.chunk.content}`)
    .join('\n\n---\n\n')

  const userMessage = `RECENT CONVERSATION (last ~60s):
${recentTranscript}

RELEVANT KNOWLEDGE BASE EXCERPTS:
${kbContext}

Suggest 1-3 talking points based on the above. Return a JSON array.`

  try {
    const response = await routeLLM(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      aiModel
    )

    const parsed = JSON.parse(response.replace(/```json?\n?/g, '').replace(/```/g, '').trim())
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((s: any) => s.text && typeof s.text === 'string')
      .slice(0, 3)
      .map((s: any) => ({ text: s.text, source: s.source || '' }))
  } catch (err) {
    console.error('[live-suggestions] LLM call failed:', err)
    return []
  }
}
