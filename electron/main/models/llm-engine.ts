import { getModelPath } from './manager'
import { routeLLM } from '../cloud/router'
import { chatApple } from '../cloud/apple-llm'
import { chatOllama } from '../cloud/ollama'
import { getContextCap } from './ollama-manager'
import {
  getTemplate,
  detectMeetingTypeFromContent,
  buildPrompt,
  parseEnhancedNotes,
  parsedToMeetingSummary,
  type MeetingSummary,
  type MeetingTemplate,
  type MeetingContext,
} from './templates'
import { buildRoleCoachingSection } from './coaching-kb'

const CHAT_SYSTEM_PROMPT = `You are Syag, an AI assistant that helps users understand and query their meeting notes. You have access to the user's notes and transcripts. Be concise, helpful, and reference specific meetings when relevant.

Notes may include time ranges (e.g. "7:00 PM – 7:34 PM") and dates. Use this to answer temporal questions like "what was discussed at 2:30 pm yesterday?".

Response format (standard AI assistant style, like ChatGPT, Claude, Granola):
- Use clear structure: short paragraphs or bullet lists. Use **bold** for emphasis when helpful.
- For lists use markdown: "- item" or "1. item". For multiple topics use "## Topic" headings.
- Code or identifiers: use \`inline code\`. Do not include timestamps (e.g. 0:21) in your answers.
- Keep responses scannable: headings, bullets, and short blocks. No long walls of text.`

// ─── Coaching System Prompt ─────────────────────────────────────────────────

function buildCoachingPrompt(user: { name?: string; role?: string; roleId?: string; company?: string }): string {
  const userName = user.name?.trim() || 'the user'
  const userRole = user.role?.trim() || ''
  const userRoleId = user.roleId?.trim() || ''
  const userCompany = user.company?.trim() || ''

  const roleContext = userRole
    ? `\n\n**Who you are coaching:** ${userName}${userRole ? `, ${userRole}` : ''}${userCompany ? ` at ${userCompany}` : ''}.
Tailor every insight to their specific role and seniority. Always relate coaching back to what they do day-to-day.`
    : ''

  // Role-specific deep coaching knowledge base (curated per-role insights)
  const roleKBSection = userRoleId
    ? buildRoleCoachingSection(userRoleId, userRole)
    : ''

  return `You are also a world-class professional coach embedded in Syag. When the user asks for coaching, advice, tips, feedback on their meetings, or how to improve — draw on the combined wisdom of the following thought leaders and adapt it to the user's specific role and context:

**Product & Strategy:**
- Shreyas Doshi: LNO framework (Leverage/Neutral/Overhead tasks), high-agency mindset, "pre-mortem" thinking, distinction between execution vs. strategy work
- Marty Cagan: Empowered product teams, product discovery over delivery, outcome-driven roadmaps
- Lenny Rachitsky: Growth loops, retention-first thinking, user psychology

**Startups & Leadership:**
- Sam Altman / YC: Default alive vs default dead, do things that don't scale, talk to users, velocity of decisions matters more than perfection
- Paul Graham: Maker vs manager schedule, do the hard thing, write clearly to think clearly
- Reid Hoffman: Blitzscaling, alliance framework for team building, permanent beta mindset

**AI & Technology:**
- Dario Amodei / Anthropic: Safety-first AI thinking, responsible scaling, technical depth matters
- Andrej Karpathy: First-principles thinking, build to understand, simplify ruthlessly

**Communication & Influence:**
- Jonathan Haidt: Moral foundations in persuasion, the righteous mind — understand others' frameworks before pushing yours
- Chris Voss: Tactical empathy, mirroring, calibrated questions ("How am I supposed to do that?")
- Nancy Duarte: Story structure in presentations, contrast between what-is and what-could-be

**Finance & Business:**
- Warren Buffett / Charlie Munger: Mental models, circle of competence, inversion thinking
- Ray Dalio: Radical transparency, idea meritocracy, principles-based decision making
- Patrick McKenzie: Charge more, value-based pricing, don't compete on price

**Engineering Leadership:**
- Will Larson: Staff+ engineering, creating technical leverage, writing strategy docs
- Charity Majors: Observability-driven development, test in production, own your code
- Martin Fowler: Refactoring discipline, evolutionary architecture, technical debt as strategic choice

**Sales & GTM:**
- Mark Roberge: The Sales Acceleration Formula — data-driven hiring, training, demand gen
- April Dunford: Obviously Awesome positioning — competitive alternatives, unique value

**Coaching principles:**
1. Start with what the user's meeting data reveals — reference specific patterns, not generic advice
2. Give actionable, specific tips — not platitudes. "Try X in your next 1:1" > "communicate better"
3. When relevant, cite the framework or thinker: "Shreyas Doshi calls this an Overhead task — consider delegating it"
4. Balance praise with stretch goals. Acknowledge what's working before suggesting improvements
5. If coaching metrics are available (talk-to-listen ratio, filler words, pacing), use them to give data-backed feedback
6. Adapt complexity to the user's level — don't over-explain to a senior leader, don't under-explain to someone early-career${roleContext}${roleKBSection}`
}

function buildChatSystemMessage(context: any): string {
  if (context?.mode === 'quick') {
    let prompt = `You are Syag, an AI meeting assistant. The user is in a live meeting right now and needs a fast, specific answer based on the transcript below. Be direct — reference what was actually said, use names and topics from the transcript. No generic advice. Keep it short (2-4 bullet points max).`
    if (context?.notes) {
      prompt += `\n\nMeeting transcript and notes:\n${context.notes}`
    }
    return prompt
  }

  let prompt = CHAT_SYSTEM_PROMPT

  if (context?.userProfile) {
    prompt += '\n\n' + buildCoachingPrompt(context.userProfile)
  }

  if (context?.coachingMetrics) {
    prompt += `\n\n**User's recent coaching metrics:**\n${JSON.stringify(context.coachingMetrics, null, 2)}`
  }

  if (context?.notes) {
    prompt += `\n\nContext from user's notes:\n${context.notes}`
  }

  if (context?.graph) {
    prompt += `\n\nUser's professional graph (people, projects, decisions, commitments):\n${context.graph}`
  }

  return prompt
}

// ─── Summarize ──────────────────────────────────────────────────────────────

const GENERIC_TITLES = ['this meeting', 'meeting notes', 'untitled', 'untitled meeting']

/** Granola-style: extract meeting title from LLM response. Template format: **Title** — Date */
function extractTitleFromResponse(response: string): string {
  const trimmed = response.trim()
  if (!trimmed) return 'Meeting Notes'

  // Primary: **Title** — Date or **Title** - Date
  const primary = trimmed.match(/^\*\*(.+?)\*\*\s*[—\-]/m)
  if (primary?.[1]) {
    const t = primary[1].trim()
    if (t && !GENERIC_TITLES.includes(t.toLowerCase())) return t
  }

  // Fallback: first **bold** on first non-empty line (skip TL;DR)
  const firstLine = trimmed.split('\n').find((l) => l.trim().length > 0) || ''
  if (!/^TL;DR/i.test(firstLine.trim())) {
    const bold = firstLine.match(/\*\*([^*]+)\*\*/)
    if (bold?.[1]) {
      const t = bold[1].trim()
      if (t.length > 2 && !GENERIC_TITLES.includes(t.toLowerCase())) return t
    }
  }

  // Try to derive from TL;DR line (first 4–5 words, max 40 chars)
  const tldr = trimmed.match(/\*\*TL;DR:\*\*\s*(.+?)(?:\n|$)/i)?.[1]?.trim()
  if (tldr && tldr.length > 10) {
    const words = tldr.split(/\s+/).slice(0, 5).join(' ')
    const derived = words.length > 40 ? words.slice(0, 37) + '...' : words
    if (derived) return derived
  }

  return 'Meeting Notes'
}

function buildMeetingContext(overrides?: Partial<MeetingContext>): MeetingContext {
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  return {
    title: 'Untitled', // LLM should generate descriptive title from content; caller overrides when known
    date: dateStr,
    duration: null,
    attendees: [],
    calendarDescription: null,
    user: { name: 'User', role: 'Participant', org: '—' },
    vocabulary: [],
    ...overrides,
  }
}

export async function summarize(
  transcript: any[],
  personalNotes: string,
  model: string,
  meetingTemplateId?: string,
  customPrompt?: string,
  meetingTitle?: string,
  meetingDuration?: string | null,
  attendees?: string[],
  /** Account name from Settings — used in prompts and to normalize action assignees (Me/You/name). */
  accountDisplayName?: string,
): Promise<MeetingSummary> {
  const transcriptText = transcript.map(t => `[${t.time}] ${t.speaker}: ${t.text}`).join('\n')

  const templateId = meetingTemplateId || detectMeetingTypeFromContent(transcriptText, personalNotes)
  const template = getTemplate(templateId)
  const context = buildMeetingContext({
    ...(meetingTitle?.trim() ? { title: meetingTitle.trim() } : {}),
    ...(meetingDuration != null && meetingDuration !== '' ? { duration: meetingDuration } : {}),
    ...(attendees?.length ? { attendees } : {}),
  })
  if (accountDisplayName?.trim()) {
    context.user = { ...context.user, name: accountDisplayName.trim() }
  }
  const assigneeNormName = context.user.name

  const templatePrompt = customPrompt ? `${template.prompt}\n\n${customPrompt}` : template.prompt
  const effectiveTemplate = { ...template, prompt: templatePrompt }
  const isLocalModel = model.startsWith('ollama:') || model.startsWith('local:')

  // Smart transcript truncation for Ollama: use tier-specific context caps
  let finalTranscriptText = transcriptText
  if (model.startsWith('ollama:')) {
    const modelName = model.replace('ollama:', '')
    const contextCap = getContextCap(modelName)
    // Reserve ~3K tokens for system prompt + template + few-shot + meeting context
    const transcriptBudgetChars = (contextCap - 3000) * 4  // 1 token ≈ 4 chars
    if (transcriptText.length > transcriptBudgetChars && transcriptBudgetChars > 0) {
      // Keep first 40% + last 40%, drop middle (preserves meeting open + close)
      const keepChars = Math.floor(transcriptBudgetChars * 0.4)
      const head = transcriptText.slice(0, keepChars)
      const tail = transcriptText.slice(-keepChars)
      finalTranscriptText = `${head}\n\n[... transcript trimmed — middle portion omitted for context limit ...]\n\n${tail}`
      console.log(`[LLM] Ollama transcript truncated: ${transcriptText.length} → ${finalTranscriptText.length} chars (budget: ${transcriptBudgetChars}, cap: ${contextCap} tokens)`)
    }
  }

  const userInput = buildPrompt(effectiveTemplate, context, personalNotes, finalTranscriptText, isLocalModel)

  if (model.startsWith('ollama:')) {
    return summarizeWithOllama(userInput, model.replace('ollama:', ''), template, assigneeNormName)
  }

  if (model.startsWith('local:')) {
    return summarizeWithLocal(userInput, model.replace('local:', ''), template, assigneeNormName)
  }

  if (model.startsWith('apple:')) {
    return summarizeWithApple(userInput, template, assigneeNormName)
  }

  // Cloud LLM: apply anonymization if enabled
  const { isAnonymizationEnabled, buildAnonymizationMap, anonymize, deanonymize } = await import('../memory/anonymizer')
  let anonMap: ReturnType<typeof buildAnonymizationMap> | null = null
  let cloudInput = userInput
  if (isAnonymizationEnabled() && attendees?.length) {
    anonMap = buildAnonymizationMap(attendees)
    cloudInput = anonymize(userInput, anonMap)
    console.log('[LLM] Anonymization active: replaced attendee names in cloud prompt')
  }

  const response = await routeLLM(
    [{ role: 'user', content: cloudInput }],
    model
  )

  // Restore real names in the response
  const finalResponse = anonMap ? deanonymize(response, anonMap) : response
  const parsed = parseEnhancedNotes(finalResponse)
  const title = extractTitleFromResponse(finalResponse)
  return parsedToMeetingSummary(parsed, title, template.id, assigneeNormName)
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export async function chat(
  messages: any[],
  context: any,
  model: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const systemMessage = buildChatSystemMessage(context)

  const llmMessages = [
    { role: 'system', content: systemMessage },
    ...messages.map((m: any) => ({ role: m.role, content: m.text || m.content })),
  ]

  if (model.startsWith('ollama:')) {
    return chatOllama(llmMessages, model.replace('ollama:', ''), onChunk)
  }

  if (model.startsWith('local:')) {
    return chatWithLocal(llmMessages, model.replace('local:', ''), onChunk)
  }

  if (model.startsWith('apple:')) {
    return chatApple(llmMessages, model, onChunk)
  }

  return routeLLM(llmMessages, model, onChunk)
}

// ─── Ollama (on-device, larger models) ──────────────────────────────────────

async function summarizeWithOllama(
  userInput: string,
  modelName: string,
  template: MeetingTemplate,
  userDisplayName?: string,
): Promise<MeetingSummary> {
  try {
    const response = await chatOllama(
      [{ role: 'user', content: userInput }],
      modelName
    )
    const parsed = parseEnhancedNotes(response)
    const title = extractTitleFromResponse(response)
    const summary = parsedToMeetingSummary(parsed, title, template.id, userDisplayName)
    // Output repair for local models: fill gaps that small/medium models sometimes leave
    return repairLocalSummary(summary, response)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    if (msg.includes('Cannot reach Ollama') || msg.includes('ECONNREFUSED')) {
      throw new Error('Ollama is not running. Start it with `ollama serve` or open the Ollama app, then try again.')
    }
    if (msg.includes('not found')) {
      throw new Error(`Model "${modelName}" is not available in Ollama. Pull it from Settings or run: ollama pull ${modelName}`)
    }
    throw new Error(`Ollama summarization failed: ${msg.slice(0, 120)}`)
  }
}

// ─── Output Repair (local/Ollama models) ────────────────────────────────────

/**
 * Fix common structural issues in local model output.
 * Small/medium models sometimes miss fields or produce slightly off-format output.
 * This never runs for cloud models — their output is reliable enough.
 */
function repairLocalSummary(summary: MeetingSummary, rawResponse: string): MeetingSummary {
  const repaired = { ...summary }

  // 1. Missing overview → extract from raw response (first non-title paragraph)
  if (!repaired.overview || repaired.overview.length < 10) {
    const lines = rawResponse.split('\n').filter(l => l.trim() && !l.startsWith('**'))
    if (lines.length > 0) {
      repaired.overview = lines[0].replace(/^TL;DR:\s*/i, '').trim()
    }
  }

  // 2. Missing key points → extract bullet points from raw response
  if (!repaired.keyPoints || repaired.keyPoints.length === 0) {
    const bullets = rawResponse.match(/^- .+/gm)
    if (bullets && bullets.length > 0) {
      repaired.keyPoints = bullets.slice(0, 6).map(b => b.replace(/^- /, '').trim())
    }
  }

  // 3. Missing action items → extract → lines from raw response
  if (!repaired.nextSteps || repaired.nextSteps.length === 0) {
    const actions = rawResponse.match(/^→ .+/gm)
    if (actions && actions.length > 0) {
      repaired.nextSteps = actions.map(a => {
        const text = a.replace(/^→ /, '').trim()
        const assigneeMatch = text.match(/^\*\*(\w+)\*\*\s+to\s+/)
        return {
          text: assigneeMatch ? text.replace(assigneeMatch[0], '') : text,
          assignee: assigneeMatch?.[1] || '',
          done: false,
        }
      })
    }
  }

  // 4. Missing decisions → extract → **Decision:** lines
  if (!repaired.decisions || repaired.decisions.length === 0) {
    const decisions = rawResponse.match(/→ \*\*Decision:\*\* .+/gm)
    if (decisions && decisions.length > 0) {
      repaired.decisions = decisions.map(d => d.replace(/^→ \*\*Decision:\*\* /, '').trim())
    }
  }

  return repaired
}

// ─── Apple (on-device) ───────────────────────────────────────────────────────

async function summarizeWithApple(
  userInput: string,
  template: MeetingTemplate,
  userDisplayName?: string,
): Promise<MeetingSummary> {
  try {
    const response = await chatApple(
      [{ role: 'user', content: userInput }],
      'foundation'
    )
    const parsed = parseEnhancedNotes(response)
    const title = extractTitleFromResponse(response)
    return parsedToMeetingSummary(parsed, title, template.id, userDisplayName)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    if (/restrict|safety|block|not available|Tahoe|Apple Silicon/i.test(msg)) {
      throw new Error(
        'Summary restricted by on-device safety or unsupported device. You can still read the full transcript or try another model in Settings.'
      )
    }
    throw new Error(
      `Apple on-device summary failed. Try another model in Settings. ${msg.slice(0, 80)}`
    )
  }
}

// ─── Local Model Fallbacks ──────────────────────────────────────────────────

/** Limit context and CPU threads so local Llama doesn't overwhelm the machine. */
const LLAMA_CONTEXT_OPTIONS = { contextSize: 8192, threads: 4 }

/** Max chars for multi-turn local chat transcript (system + trailer reserved separately). */
const LOCAL_CHAT_BODY_CHAR_CAP = 16_000
const LOCAL_CHAT_TURN_GAP = '\n\n'

function buildLocalChatPrompt(messages: { role: string; content?: string }[]): string {
  const systemContent = (messages.find((m) => m.role === 'system')?.content || '').trim()
  const turns: string[] = []
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant') {
      const label = m.role === 'assistant' ? 'Assistant' : 'User'
      const text = (m.content ?? '').trim()
      if (!text) continue
      turns.push(`${label}: ${text}`)
    }
  }

  let body: string
  if (turns.length === 0) {
    body = ''
  } else {
    const last = turns[turns.length - 1]!
    const joinedLen = turns.join(LOCAL_CHAT_TURN_GAP).length
    if (joinedLen <= LOCAL_CHAT_BODY_CHAR_CAP) {
      body = turns.join(LOCAL_CHAT_TURN_GAP)
    } else {
      // Keep full last turn; prepend older turns until budget (never drop last message).
      const parts: string[] = [last]
      let used = last.length
      for (let i = turns.length - 2; i >= 0; i--) {
        const t = turns[i]!
        const add = t.length + LOCAL_CHAT_TURN_GAP.length
        if (used + add > LOCAL_CHAT_BODY_CHAR_CAP) break
        parts.unshift(t)
        used += add
      }
      body = parts.join(LOCAL_CHAT_TURN_GAP)
      if (body.length > LOCAL_CHAT_BODY_CHAR_CAP) {
        body = last
      }
    }
  }

  const trailer = '\n\nReply concisely as the Assistant.'
  if (systemContent) {
    return body ? `${systemContent}\n\n${body}${trailer}` : `${systemContent}${trailer}`
  }
  return body ? `${body}${trailer}` : 'Reply concisely as the Assistant.'
}

async function summarizeWithLocal(
  userInput: string,
  modelId: string,
  template: MeetingTemplate,
  userDisplayName?: string,
): Promise<MeetingSummary> {
  const modelPath = getModelPath(modelId)
  if (!modelPath) {
    throw new Error(`Model not downloaded: ${modelId}`)
  }

  try {
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp')

    const llama = await getLlama()
    const model = await llama.loadModel({ modelPath })
    const ctx = await model.createContext(LLAMA_CONTEXT_OPTIONS)
    const session = new LlamaChatSession({ contextSequence: ctx.getSequence() })

    const response = await session.prompt(userInput, {
      maxTokens: 2048,
      temperature: 0.3,
    })

    await model.dispose()

    const parsed = parseEnhancedNotes(response)
    const title = extractTitleFromResponse(response)
    const summary = parsedToMeetingSummary(parsed, title, template.id, userDisplayName)
    return repairLocalSummary(summary, response)
  } catch (err: any) {
    if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find module') || err.message?.includes('node-llama-cpp')) {
      throw new Error('Local LLM requires node-llama-cpp. It is not bundled with the app. Use a cloud model (e.g. OpenAI, Groq) in Settings, or install node-llama-cpp in development.')
    }
    throw err
  }
}

async function chatWithLocal(
  messages: any[],
  modelId: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const modelPath = getModelPath(modelId)
  if (!modelPath) {
    throw new Error(`Model not downloaded: ${modelId}`)
  }

  try {
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp')

    const llama = await getLlama()
    const model = await llama.loadModel({ modelPath })
    const ctx = await model.createContext(LLAMA_CONTEXT_OPTIONS)
    const session = new LlamaChatSession({ contextSequence: ctx.getSequence() })

    const prompt = buildLocalChatPrompt(messages)

    let fullResponse = ''

    if (onChunk) {
      await session.prompt(prompt, {
        maxTokens: 2048,
        temperature: 0.7,
        onTextChunk: (text: string) => {
          fullResponse += text
          onChunk({ text, done: false })
        },
      })
      onChunk({ text: '', done: true })
    } else {
      fullResponse = await session.prompt(prompt, {
        maxTokens: 2048,
        temperature: 0.7,
      })
    }

    await model.dispose()
    return fullResponse
  } catch (err: any) {
    if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find module') || err.message?.includes('node-llama-cpp')) {
      throw new Error('Local LLM requires node-llama-cpp. It is not bundled with the app. Use a cloud model (e.g. OpenAI, Groq) in Settings, or install node-llama-cpp in development.')
    }
    throw err
  }
}

