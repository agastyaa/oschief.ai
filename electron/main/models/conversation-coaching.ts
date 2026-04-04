/**
 * Transcript-grounded conversation coaching (Work Coach–style).
 * Uses compact KB excerpt + metrics + optional deterministic heuristics.
 */

import { routeLLM } from '../cloud/router'
import { getRoleKB, ROLES } from './coaching-kb'
import { searchKB, getChunkCount } from '../knowledge-base/kb-store'
import { searchTranscriptKB } from './transcript-kb'
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
const PODCAST_KB_MAX_CHARS = 2500
const PODCAST_KB_TOP_K = 5

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

function fetchPodcastKBContext(transcript: TranscriptLineInput[], roleLabel: string): string {
  try {
    const query = buildKBQuery(transcript, roleLabel)
    const results = searchTranscriptKB(query, PODCAST_KB_TOP_K)
    if (results.length === 0) return ''
    let out = ''
    for (const r of results) {
      const attribution = `**${r.guest}** (${r.episodeTitle}):`
      const snippet = r.text.slice(0, 500).trim()
      const block = `${attribution}\n${snippet}\n\n`
      if (out.length + block.length > PODCAST_KB_MAX_CHARS) break
      out += block
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
YOUR JOB: Say the thing they don't want to hear but need to. Generic praise ("good question ratio") is worthless. Every insight must reference a SPECIFIC moment from the transcript.

Priorities (in order):
1. **What they said** — content, promises, claims, and whether they matched the moment (too early/late, missed follow-up, jumped to solution).
2. **Questions vs tells** — discovery, clarity, stakeholder alignment; did they ask the right things before pitching or closing?
3. **Role playbook** — apply the role briefing you were given (e.g. sales discovery before demo, PM outcomes before solutions). Tie micro-insights to that playbook.

Rules:
- Return ONLY a single JSON object (no markdown fences).
- Every claim in microInsights must be grounded in the transcript: use evidenceQuote with exact or near-exact wording when possible.
- headline: Start with the SINGLE most important thing this person needs to change about how they run meetings. Not a compliment. Not a summary. A coaching observation. (e.g. "You demo before you discover", "Closed without confirming success metrics", "You answered your own questions before anyone could respond").
- narrative: 2-3 sentences on what they said/did in context of their role and why it mattered. Be concise and direct.
- microInsights: 3-5 objects. Each must include a CONCRETE ALTERNATIVE — not just "you talked too much" but "when Sarah raised the budget concern at 14:32, you responded with a 3-minute monologue. Try: acknowledge, ask one follow-up question, then propose next steps in under 60 seconds." Each "text" must be under 50 words, actionable, and reference a specific transcript moment. Include "framework", "evidenceQuote", "speaker", "time" when available.
- habitTags: snake_case tags tied to **substance** (e.g. agenda_gap, demo_before_discovery, low_questions, unclear_next_step, answered_own_question, no_check_for_understanding).
- keyMoments: 2-3 transcript moments that best illustrate the headline (what was said, when).
- Be ruthlessly honest. If the meeting was strong, find the one subtle thing they'd improve with more self-awareness. No filler praise.
- Do not invent quotes; only use phrases that appear in the transcript.`
}

const JSON_SHAPE = `{
  "headline": "string (the ONE thing to change — not a compliment)",
  "narrative": "string (2-3 sentences, direct)",
  "microInsights": [{ "text": "string (under 50 words, includes concrete alternative)", "framework": "string?", "evidenceQuote": "string? (exact transcript quote)", "speaker": "string?", "time": "string?" }],
  "habitTags": ["string (snake_case)"],
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

  const podcastKBContext = fetchPodcastKBContext(input.transcript, roleLabel)
  const podcastKBSection = podcastKBContext
    ? `\nInsights from expert practitioners (Lenny's Podcast — use to ground coaching in real frameworks):\n${podcastKBContext}\n`
    : ''

  const userMessage = `${kbBlock}
${userKBSection}${podcastKBSection}
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

const AGG_SYSTEM = `You are a coach synthesizing themes across multiple meetings for one professional. You have their meeting headlines, narratives, scores, and habit tags.

Your job: find the patterns they can't see themselves. Not a summary — a diagnosis.

Return ONLY valid JSON:
{
  "summaryHeadline": "string — the ONE pattern across these meetings (not a summary, a coaching observation)",
  "themesParagraph": "string — 2-4 sentences explaining the pattern with specific references to meetings",
  "improvementArc": "string — 'Over your last N meetings, [specific metric] improved from X to Y. Your biggest remaining gap is Z.'",
  "blindSpot": "string — one thing they consistently do that they probably don't realize, with evidence from multiple meetings",
  "bestMoment": "string — the single strongest moment from these meetings (specific quote or action + why it was good)",
  "focusNext": "string — one concrete, specific thing to do differently in their next meeting (not generic advice)",
  "recurringTags": ["tags that appear in 2+ meetings"]
}
Be ruthlessly specific. Reference actual meeting titles and patterns. No generic coaching advice.`

export async function aggregateCrossMeetingInsights(
  meetings: MeetingInsightSummary[],
  roleId: string,
  model?: string
): Promise<{
  summaryHeadline: string
  themesParagraph: string
  improvementArc: string
  blindSpot: string
  bestMoment: string
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
      improvementArc: typeof parsed.improvementArc === 'string' ? parsed.improvementArc : '',
      blindSpot: typeof parsed.blindSpot === 'string' ? parsed.blindSpot : '',
      bestMoment: typeof parsed.bestMoment === 'string' ? parsed.bestMoment : '',
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
