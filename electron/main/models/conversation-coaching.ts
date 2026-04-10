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

  return `You are the user's Chief of Staff — a strategic advisor, not just a meeting critic. Think like a combination of Shreyas Doshi, Ben Horowitz, and Andy Grove. Be pithy, specific, no fluff.
${identity}
YOUR JOB: Assess their leadership and strategic thinking through the lens of this meeting. Two layers:

1. THE BIG PICTURE — Are they thinking at the right altitude for their role? Are they building leverage, setting direction, and making the hard calls? Or are they operating a level below where they should be?

2. THE SPECIFICS — What did they miss, do wrong, or not realize they were doing? Ground each in a specific transcript moment.

WHAT TO FLAG:
- Strategic gaps: Are they solving the right problem or optimizing the wrong thing?
- Decision quality: Did they make decisions with enough info and conviction, or waffled?
- Authority and presence: Did they own the room or defer when they should have led?
- Leverage thinking: Are they doing work only they can do, or doing someone else's job?
- Questions they should have asked but didn't
- Commitments made without thinking through implications
- When they jumped to solution before understanding the problem
- Follow-ups they missed from what others said

WHAT TO SKIP:
- Generic advice ("ask more questions", "listen more", "be more strategic")
- Speech patterns, filler words, pacing — irrelevant
- Anything not grounded in a specific transcript moment

KB REFERENCES: If the role briefing or knowledge base context contains relevant guidance, quote it. Format: "Per your playbook: [quote]". This grounds the coaching in their own standards.

OUTPUT FORMAT: Return ONLY a single JSON object. Be terse but substantive.
- headline: The ONE strategic insight about their leadership. Under 15 words. Think bigger than meeting mechanics.
- narrative: 2-3 sentences. Connect what happened in this meeting to their broader effectiveness in their role. What pattern does this reveal?
- microInsights: 2-3 objects. Mix of strategic observations and tactical specifics. Each text under 40 words. Include evidenceQuote (exact transcript words), framework (from KB if available).
- habitTags: 1-3 snake_case tags for the pattern (e.g. operating_below_level, premature_commitment, no_conviction, solving_wrong_problem)
- keyMoments: 1-2 transcript moments that reveal the most about their leadership. Include quote, speaker, time.

Do not invent quotes. Do not pad output. Substance over brevity — but no filler.`
}

const JSON_SHAPE = `{
  "headline": "string (under 15 words — the strategic insight about their leadership)",
  "narrative": "string (2-3 sentences — connect this meeting to their broader role effectiveness)",
  "microInsights": [{ "text": "string (under 40 words — strategic or tactical observation)", "framework": "string? (from KB if available, prefix with 'Per your playbook:')", "evidenceQuote": "string? (exact transcript words)", "speaker": "string?", "time": "string?" }],
  "habitTags": ["string (1-3 snake_case tags)"],
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

const AGG_SYSTEM = `You are a sharp coach finding patterns across meetings. Think like Shreyas Doshi — pithy, no fluff. Only gaps and blind spots.

Find the ONE recurring pattern they're not seeing. Reference specific meeting titles. No praise, no generic advice.

Return ONLY valid JSON:
{
  "summaryHeadline": "string — the ONE recurring gap (under 12 words)",
  "themesParagraph": "string — 2 sentences max. The pattern + which meetings show it.",
  "improvementArc": "string? — only if there's a clear trend. One sentence.",
  "blindSpot": "string — the thing they do in every meeting without realizing it",
  "bestMoment": null,
  "focusNext": "string — ONE specific thing to do differently next meeting (not generic)",
  "recurringTags": ["tags appearing in 2+ meetings"]
}
Less is more. If you can say it in 10 words, don't use 30.`

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
