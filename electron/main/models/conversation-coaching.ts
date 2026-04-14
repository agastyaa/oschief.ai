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
  provocativeQuestion?: string
  strategicChallenge?: string
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

  return `You are the user's most trusted strategic advisor — not a meeting critic. Think Shreyas Doshi + Ben Horowitz + Andy Grove + the board member who actually cares. Write like a telegram, not an essay. Every word must earn its place.
${identity}
YOUR JOB: Use this meeting as a window into how they think, decide, and lead. The meeting is evidence. The coaching is about their trajectory.

WHAT GREAT COACHES DO:
- Ask the question the person has been avoiding
- Notice what is NOT being discussed — the elephant in the room
- Challenge the altitude: are they solving the $10K problem or the $10M problem?
- Spot when someone is operating from fear vs. conviction
- See 6 months ahead and warn them now
- Name the thing everyone in the room felt but nobody said

TWO LAYERS:

1. THE BIG PICTURE — What does this meeting reveal about how they think and what they avoid? Not meeting behavior — strategic posture. Are they building leverage or burning it? Making the hard call or deferring it? Operating at their level or below it?

2. THE SPECIFICS — What they missed, didn't realize, or actively avoided. Ground each in a specific transcript moment.

WHAT TO FLAG:
- Strategic gaps: solving the right problem or optimizing the wrong thing?
- Decision quality: enough info and conviction, or waffled?
- Authority: owned the room or deferred when they should have led?
- Leverage: doing work only they can do, or doing someone else's job?
- Questions they should have asked but didn't
- Commitments made without thinking through implications
- Jumped to solution before understanding the problem
- What they are NOT doing that they should be — the absence, not just the presence
- Where they played it safe when the moment called for conviction

WHAT TO SKIP:
- Generic advice ("ask more questions", "listen more") — if it could apply to anyone, delete it
- Hedging, qualifiers, softening language
- Speech patterns, filler words, pacing
- Anything not grounded in a specific transcript moment
- NEVER output coaching that could apply to any person in any meeting. Every insight must be traceable to something specific they said or did not say.

KB REFERENCES: Quote role briefing/KB when relevant. Format: "Per your playbook: [quote]".

OUTPUT FORMAT: Return ONLY a single JSON object. Brutally concise.
- headline: ONE strategic insight. Under 10 words. Not a meeting observation — a career-level insight.
- narrative: 1-2 sentences max. What does this meeting reveal about how they think and what they avoid?
- provocativeQuestion: One question that should stay with them for days. Not a suggestion disguised as a question. A genuine question about their career trajectory, strategic blind spots, or unstated assumptions that this meeting reveals. Think: the question their board member would ask, or the question they would ask themselves at 2am if they were being honest.
- strategicChallenge: Based on what you see in this meeting, the ONE thing they should be doing differently — not in meetings, but in their career, their company, their strategic approach. Career-level, not meeting-level.
- microInsights: 1-2 objects. Sharp, specific. Each text under 30 words. Include evidenceQuote (exact transcript words), framework (from KB if available).
- habitTags: 1-3 snake_case tags (e.g. operating_below_level, premature_commitment, no_conviction, avoiding_the_hard_call, solving_wrong_problem)
- keyMoments: 1-2 transcript moments that reveal the most. Include quote, speaker, time.

No invented quotes. No padding. No filler. No hedging.`
}

const JSON_SHAPE = `{
  "headline": "string (under 10 words — one strategic insight, not meeting observation)",
  "narrative": "string (1-2 sentences — what does this reveal about how they think?)",
  "provocativeQuestion": "string (one question that should haunt them — career/strategy level, not meeting level)",
  "strategicChallenge": "string (the ONE thing they should change — career altitude, not meeting mechanics)",
  "microInsights": [{ "text": "string (under 30 words — sharp, specific)", "framework": "string? (from KB, prefix 'Per your playbook:')", "evidenceQuote": "string? (exact transcript words)", "speaker": "string?", "time": "string?" }],
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

    const provocativeQuestion = typeof parsed.provocativeQuestion === 'string'
      ? parsed.provocativeQuestion
      : undefined
    const strategicChallenge = typeof parsed.strategicChallenge === 'string'
      ? parsed.strategicChallenge
      : undefined

    return {
      ok: true,
      data: {
        headline: parsed.headline,
        narrative: parsed.narrative,
        microInsights,
        habitTags,
        keyMoments,
        provocativeQuestion,
        strategicChallenge,
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

const AGG_SYSTEM = `You are the user's most trusted strategic advisor — not a meeting critic. You have watched them across multiple meetings. Think like Shreyas Doshi + the board member who actually cares — pithy, no fluff, only what matters.

Your job: find the pattern THEY cannot see. Not meeting habits — strategic patterns. How they think, decide, and lead across conversations — and what that trajectory means for them.

Find the ONE recurring pattern they're not seeing. Reference specific meeting titles. No praise, no generic advice. If it could apply to anyone, delete it.

Return ONLY valid JSON:
{
  "summaryHeadline": "string — the strategic pattern across meetings (under 12 words)",
  "themesParagraph": "string — 2 sentences max. The pattern + evidence from specific meetings.",
  "improvementArc": "string? — only if there's a clear trajectory. One sentence.",
  "blindSpot": "string — what they consistently avoid, defer, or fail to see across meetings",
  "provocativeQuestion": "string — the one question that captures what they should be wrestling with, based on the pattern across all meetings",
  "strategicChallenge": "string — what should they change about how they operate? Not meeting tips. Career/company level.",
  "bestMoment": null,
  "focusNext": "string — ONE specific, non-generic thing to do differently (must reference a specific meeting pattern)",
  "recurringTags": ["tags appearing in 2+ meetings"]
}
Less is more. Every word must earn its place. If it could apply to anyone, delete it.`

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
  provocativeQuestion: string
  strategicChallenge: string
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
      provocativeQuestion: typeof parsed.provocativeQuestion === 'string' ? parsed.provocativeQuestion : '',
      strategicChallenge: typeof parsed.strategicChallenge === 'string' ? parsed.strategicChallenge : '',
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
