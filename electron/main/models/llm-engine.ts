import { getModelPath } from './manager'
import { routeLLM } from '../cloud/router'
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

function buildMeetingContext(overrides?: Partial<MeetingContext>): MeetingContext {
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  return {
    title: 'This meeting',
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
  customPrompt?: string
): Promise<MeetingSummary> {
  const transcriptText = transcript.map(t => `[${t.time}] ${t.speaker}: ${t.text}`).join('\n')

  const templateId = meetingTemplateId || detectMeetingTypeFromContent(transcriptText, personalNotes)
  const template = getTemplate(templateId)
  const context = buildMeetingContext()

  const templatePrompt = customPrompt ? `${template.prompt}\n\n${customPrompt}` : template.prompt
  const effectiveTemplate = { ...template, prompt: templatePrompt }
  const userInput = buildPrompt(effectiveTemplate, context, personalNotes, transcriptText)

  if (model.startsWith('local:')) {
    return summarizeWithLocal(userInput, model.replace('local:', ''), template)
  }

  const response = await routeLLM(
    [{ role: 'user', content: userInput }],
    model
  )

  const parsed = parseEnhancedNotes(response)
  const title = (response.match(/^\*\*(.+?)\*\*\s*[—\-]/m) || [])[1]?.trim() || 'Meeting Notes'
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

  return routeLLM(llmMessages, model, onChunk)
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
    const title = (response.match(/^\*\*(.+?)\*\*\s*[—\-]/m) || [])[1]?.trim() || 'Meeting Notes'
    return parsedToMeetingSummary(parsed, title, template.id)
  } catch (err: any) {
    if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      throw new Error('node-llama-cpp is not installed. Install it with: npm install node-llama-cpp')
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
    if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      throw new Error('node-llama-cpp is not installed. Install it with: npm install node-llama-cpp')
    }
    throw err
  }
}

