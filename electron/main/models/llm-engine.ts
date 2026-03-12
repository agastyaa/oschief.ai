import { getModelPath } from './manager'
import { routeLLM } from '../cloud/router'
import { chatApple } from '../cloud/apple-llm'
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

const CHAT_SYSTEM_PROMPT = `You are Syag, an AI assistant that helps users understand and query their meeting notes. You have access to the user's notes and transcripts. Be concise, helpful, and reference specific meetings when relevant.

Notes may include time ranges (e.g. "7:00 PM – 7:34 PM") and dates. Use this to answer temporal questions like "what was discussed at 2:30 pm yesterday?".

Response format (standard AI assistant style, like ChatGPT, Claude, Granola):
- Use clear structure: short paragraphs or bullet lists. Use **bold** for emphasis when helpful.
- For lists use markdown: "- item" or "1. item". For multiple topics use "## Topic" headings.
- Code or identifiers: use \`inline code\`. Do not include timestamps (e.g. 0:21) in your answers.
- Keep responses scannable: headings, bullets, and short blocks. No long walls of text.`

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
  attendees?: string[]
): Promise<MeetingSummary> {
  const transcriptText = transcript.map(t => `[${t.time}] ${t.speaker}: ${t.text}`).join('\n')

  const templateId = meetingTemplateId || detectMeetingTypeFromContent(transcriptText, personalNotes)
  const template = getTemplate(templateId)
  const context = buildMeetingContext({
    ...(meetingTitle?.trim() ? { title: meetingTitle.trim() } : {}),
    ...(meetingDuration != null && meetingDuration !== '' ? { duration: meetingDuration } : {}),
    ...(attendees?.length ? { attendees } : {}),
  })

  const templatePrompt = customPrompt ? `${template.prompt}\n\n${customPrompt}` : template.prompt
  const effectiveTemplate = { ...template, prompt: templatePrompt }
  const userInput = buildPrompt(effectiveTemplate, context, personalNotes, transcriptText)

  if (model.startsWith('local:')) {
    return summarizeWithLocal(userInput, model.replace('local:', ''), template)
  }

  if (model.startsWith('apple:')) {
    return summarizeWithApple(userInput, template)
  }

  const response = await routeLLM(
    [{ role: 'user', content: userInput }],
    model
  )

  const parsed = parseEnhancedNotes(response)
  const title = extractTitleFromResponse(response)
  return parsedToMeetingSummary(parsed, title, template.id)
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export async function chat(
  messages: any[],
  context: any,
  model: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const systemMessage = context?.notes
    ? `${CHAT_SYSTEM_PROMPT}\n\nContext from user's notes:\n${context.notes}`
    : CHAT_SYSTEM_PROMPT

  const llmMessages = [
    { role: 'system', content: systemMessage },
    ...messages.map((m: any) => ({ role: m.role, content: m.text || m.content })),
  ]

  if (model.startsWith('local:')) {
    return chatWithLocal(llmMessages, model.replace('local:', ''), onChunk)
  }

  if (model.startsWith('apple:')) {
    return chatApple(llmMessages, model, onChunk)
  }

  return routeLLM(llmMessages, model, onChunk)
}

// ─── Apple (on-device) ───────────────────────────────────────────────────────

async function summarizeWithApple(
  userInput: string,
  template: MeetingTemplate
): Promise<MeetingSummary> {
  try {
    const response = await chatApple(
      [{ role: 'user', content: userInput }],
      'foundation'
    )
    const parsed = parseEnhancedNotes(response)
    const title = extractTitleFromResponse(response)
    return parsedToMeetingSummary(parsed, title, template.id)
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

async function summarizeWithLocal(
  userInput: string,
  modelId: string,
  template: MeetingTemplate
): Promise<MeetingSummary> {
  const modelPath = getModelPath(modelId)
  if (!modelPath) {
    throw new Error(`Model not downloaded: ${modelId}`)
  }

  try {
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp')

    const llama = await getLlama()
    const model = await llama.loadModel({ modelPath })
    const ctx = await model.createContext()
    const session = new LlamaChatSession({ contextSequence: ctx.getSequence() })

    const response = await session.prompt(userInput, {
      maxTokens: 2048,
      temperature: 0.3,
    })

    await model.dispose()

    const parsed = parseEnhancedNotes(response)
    const title = extractTitleFromResponse(response)
    return parsedToMeetingSummary(parsed, title, template.id)
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
    const ctx = await model.createContext()
    const session = new LlamaChatSession({ contextSequence: ctx.getSequence() })

    const systemContent = messages.find(m => m.role === 'system')?.content || ''
    const userMessages = messages.filter(m => m.role !== 'system')
    const lastMessage = userMessages[userMessages.length - 1]?.content || ''

    const prompt = systemContent
      ? `${systemContent}\n\nUser: ${lastMessage}`
      : lastMessage

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

