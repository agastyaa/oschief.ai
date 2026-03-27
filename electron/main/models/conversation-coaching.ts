/**
 * Transcript-grounded conversation coaching (Work Coach–style).
 * Uses compact KB excerpt + metrics + optional deterministic heuristics.
 */

import { routeLLM } from '../cloud/router'
import { getRoleKB, ROLES } from './coaching-kb'
import { searchKB, getChunkCount } from '../knowledge-base/kb-store'
import { resolveSelectedAIModel } from './model-resolver'

export type TranscriptLineInput = { speaker: string; time: string; text: string }

export type HeuristicsInput = {
  yourTurns: number
  yourTurnsWithQuestion: number
  questionRatioYou: number
  longestYouMonologueWords: number
  longestYouMonologueLines: number
  totalYouWords: number
  suggestedHabitTags: string[]
}

export type ConversationMicroInsight = {
  text: string
  framework?: string
  evidenceQuote?: string
  speaker?: string
  time?: string
}

export type ConversationKeyMoment = {
  title: string
  quote: string
  speaker: string
  time: string
}

export type ConversationInsightsResult = {
  headline: string
  narrative: string
  microInsights: ConversationMicroInsight[]
  habitTags: string[]
  keyMoments: ConversationKeyMoment[]
  generatedAt: string
  model?: string
}

export type ConversationAnalysisErrorCode =
  | 'no_model'
  | 'no_transcript'
  | 'llm_error'
  | 'invalid_json'
  | 'invalid_response'

export type ConversationAnalysisResponse =
  | { ok: true; data: ConversationInsightsResult }
  | { ok: false; error: ConversationAnalysisErrorCode; message: string }

const MAX_TRANSCRIPT_CHARS = 26000
const KB_MEETING_MAX = 2200
const KB_METRICS_FOCUS_MAX = 900
const USER_KB_MAX_CHARS = 3000
const USER_KB_TOP_K = 5

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n[…truncated…]`
}

function buildKBQuery(transcript: TranscriptLineInput[], roleLabel: string): string {
  const sample = transcript.slice(0, 20).map((l) => l.text).join(' ')
  return `${roleLabel} meeting best practices ${sample.slice(0, 300)}`
}

function fetchUserKBContext(transcript: TranscriptLineInput[], roleLabel: string): string {
  try {
    if (getChunkCount() === 0) return ''
    const query = buildKBQuery(transcript, roleLabel)
    const results = searchKB(query, USER_KB_TOP_K)
    if (results.length === 0) return ''
    let out = ''
    for (const r of results) {
      const chunk = `[${r.chunk.file_name}] ${r.chunk.content}\n`
      if (out.length + chunk.length > USER_KB_MAX_CHARS) break
      out += chunk
    }
    return out.trim()
  } catch {
    return ''
  }
}

function formatTranscript(lines: TranscriptLineInput[], userName?: string): string {
  let out = ''
  for (const l of lines) {
    // Replace generic "You"/"Me" labels with actual user name when available
    const speaker = userName && (l.speaker === 'You' || l.speaker === 'Me')
      ? userName
      : l.speaker
    const line = `[${l.time}] ${speaker}: ${l.text}\n`
    if (out.length + line.length > MAX_TRANSCRIPT_CHARS) {
      out += '\n[… transcript truncated for analysis …]\n'
      break
    }
    out += line
  }
  return out
}

function buildSystemPrompt(userName?: string): string {
  const identity = userName
    ? `\nIMPORTANT: The person being coached is "${userName}". In the transcript, any speaker labeled "${userName}", "You", or "Me" is this person. Always refer to them as "${userName}" — never confuse them with other participants mentioned in the meeting.\n`
    : ''

  return `You are a world-class coach for how someone RUNS meetings in their professional role — not a speech therapist. You read real transcripts plus role-specific guidance and judge substance, timing, and judgment.
${identity}
Priorities (in order):
1. **What they said** — content, promises, claims, and whether they matched the moment (too early/late, missed follow-up, jumped to solution).
2. **Questions vs tells** — discovery, clarity, stakeholder alignment; did they ask the right things before pitching or closing?
3. **Role playbook** — apply the role briefing you were given (e.g. sales discovery before demo, PM outcomes before solutions). Tie micro-insights to that playbook.

Rules:
- Return ONLY a single JSON object (no markdown fences).
- Every claim in microInsights must be grounded in the transcript: use evidenceQuote with exact or near-exact wording when possible.
- headline: one sharp pattern about **content or meeting arc** (e.g. "You demo before you discover", "Closed without confirming success metrics").
- narrative: 2-3 sentences on what they said/did in context of their role and why it mattered. Be concise.
- microInsights: 2-3 objects. Each "text" must be 1-2 sentences max (under 40 words), actionable and specific. Optional "framework", "evidenceQuote", "speaker", "time".
- habitTags: snake_case tags tied to **substance** (e.g. agenda_gap, demo_before_discovery, low_questions, unclear_next_step).
- keyMoments: 2-3 transcript moments that best illustrate the headline (what was said, when).
- Be direct. No empty praise. If the meeting was strong, name one nuanced improvement.
- Do not invent quotes; only use phrases that appear in the transcript.`
}

const JSON_SHAPE = `{
  "headline": "string",
  "narrative": "string",
  "microInsights": [{ "text": "string", "framework": "string?", "evidenceQuote": "string?", "speaker": "string?", "time": "string?" }],
  "habitTags": ["string"],
  "keyMoments": [{ "title": "string", "quote": "string", "speaker": "string", "time": "string" }]
}`

export async function analyzeConversationQuality(input: {
  transcript: TranscriptLineInput[]
  metrics: Record<string, unknown>
  heuristics?: HeuristicsInput | null
  roleId: string
  model?: string
  userName?: string
}): Promise<ConversationAnalysisResponse> {
  const aiModel = resolveSelectedAIModel(input.model)
  if (!aiModel) {
    return {
      ok: false,
      error: 'no_model',
      message: 'No AI model selected. Choose one in Settings > AI Models.',
    }
  }
  if (!input.transcript?.length) {
    return {
      ok: false,
      error: 'no_transcript',
      message: 'No transcript found for this meeting.',
    }
  }

  const kb = getRoleKB(input.roleId)
  const role = ROLES.find((r) => r.id === input.roleId)
  const roleLabel = role?.label ?? input.roleId

  let kbBlock = `Role: ${roleLabel}\n`
  if (kb) {
    kbBlock += `Meeting coaching focus:\n${truncate(kb.meetingCoaching, KB_MEETING_MAX)}\n\nMetrics emphasis:\n${truncate(kb.metricsFocus, KB_METRICS_FOCUS_MAX)}`
  } else if (input.roleId === 'custom') {
    kbBlock += 'Adapt coaching to the user’s custom role; use general executive communication frameworks.'
  }

  const transcriptBlock = formatTranscript(input.transcript, input.userName)
  const metricsStr = JSON.stringify(input.metrics)
  const heuristicsStr = input.heuristics
    ? JSON.stringify(input.heuristics)
    : 'null'

  const userKBContext = fetchUserKBContext(input.transcript, roleLabel)
  const userKBSection = userKBContext
    ? `\nReference material from your knowledge base (use these best practices to ground your coaching):\n${userKBContext}\n`
    : ''

  const userMessage = `${kbBlock}
${userKBSection}
Deterministic heuristics (trust these as facts; incorporate into habitTags and narrative when relevant):
${heuristicsStr}

Meeting metrics (numeric):
${metricsStr}

Transcript:
${transcriptBlock}

Produce ${JSON_SHAPE}`

  try {
    const response = await routeLLM(
      [
        { role: 'system', content: buildSystemPrompt(input.userName) },
        { role: 'user', content: userMessage },
      ],
      aiModel
    )

    const cleaned = response.replace(/```json?\n?/gi, '').replace(/```/g, '').trim()
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      return {
        ok: false,
        error: 'invalid_json',
        message: 'Model returned invalid JSON for conversation analysis.',
      }
    }
    if (typeof parsed.headline !== 'string' || typeof parsed.narrative !== 'string') {
      return {
        ok: false,
        error: 'invalid_response',
        message: 'Model response was missing required analysis fields.',
      }
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

    return {
      ok: true,
      data: {
        headline: parsed.headline,
        narrative: parsed.narrative,
        microInsights,
        habitTags,
        keyMoments,
        generatedAt: new Date().toISOString(),
        model: aiModel,
      },
    }
  } catch (err) {
    console.error('[conversation-coaching] LLM failed:', err)
    return {
      ok: false,
      error: 'llm_error',
      message: err instanceof Error ? err.message : 'Conversation analysis failed.',
    }
  }
}

// ─── Cross-meeting aggregation ─────────────────────────────────────────────

export type MeetingInsightSummary = {
  title: string
  date: string
  headline: string
  narrative: string
  habitTags: string[]
  overallScore?: number
}

const AGG_SYSTEM = `You are a coach synthesizing themes across multiple meetings for one professional.

Return ONLY valid JSON:
{
  "summaryHeadline": "string — one line theme",
  "themesParagraph": "string — 2-4 sentences, what patterns you see across meetings",
  "focusNext": "string — one concrete focus for their next week",
  "recurringTags": ["tag from their data you believe recurs"]
}
Be specific. Reference patterns, not generic advice.`

export async function aggregateCrossMeetingInsights(
  meetings: MeetingInsightSummary[],
  roleId: string,
  model?: string
): Promise<{
  summaryHeadline: string
  themesParagraph: string
  focusNext: string
  recurringTags: string[]
} | null> {
  const aiModel = resolveSelectedAIModel(model)
  if (!aiModel || meetings.length === 0) return null

  const role = ROLES.find((r) => r.id === roleId)
  const roleLabel = role?.label ?? roleId

  const lines = meetings
    .map(
      (m, i) =>
        `Meeting ${i + 1}: "${m.title}" (${m.date}) score=${m.overallScore ?? 'n/a'}\n  Headline: ${m.headline}\n  Narrative: ${m.narrative.slice(0, 500)}${m.narrative.length > 500 ? '…' : ''}\n  Tags: ${(m.habitTags || []).join(', ')}`
    )
    .join('\n\n')

  const user = `Role: ${roleLabel}\n\nRecent meetings:\n${lines}\n\nSynthesize cross-meeting insights.`

  try {
    const response = await routeLLM(
      [{ role: 'system', content: AGG_SYSTEM }, { role: 'user', content: user }],
      aiModel
    )
    const cleaned = response.replace(/```json?\n?/gi, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (typeof parsed.summaryHeadline !== 'string' || typeof parsed.themesParagraph !== 'string') return null
    return {
      summaryHeadline: parsed.summaryHeadline,
      themesParagraph: parsed.themesParagraph,
      focusNext: typeof parsed.focusNext === 'string' ? parsed.focusNext : '',
      recurringTags: Array.isArray(parsed.recurringTags)
        ? (parsed.recurringTags as string[]).filter((t) => typeof t === 'string').slice(0, 8)
        : [],
    }
  } catch (e) {
    console.error('[conversation-coaching] aggregate failed:', e)
    return null
  }
}
