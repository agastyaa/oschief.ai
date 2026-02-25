import Anthropic from '@anthropic-ai/sdk'
import { netFetch } from './net-request'

const COPART_BASE_URL = 'https://genie.copart.com/api'

export type CopartModel = { id: string }

/** Fetch available models from Copart Genie API (OpenAI-compatible /v1/models). */
export async function listCopartModels(apiKey: string): Promise<CopartModel[]> {
  const url = `${COPART_BASE_URL.replace(/\/$/, '')}/v1/models`
  const { statusCode, data } = await netFetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (statusCode === 401) throw new Error('Invalid Copart Genie API key.')
  if (statusCode >= 400) throw new Error(`Copart Genie models error (${statusCode})`)
  try {
    const json = JSON.parse(data)
    const items = json?.data ?? []
    if (!Array.isArray(items)) return []
    return items
      .filter((m: any) => m?.id && typeof m.id === 'string')
      .map((m: any) => ({ id: String(m.id).trim() }))
  } catch {
    return []
  }
}

/** Returns true if model ID is STT-only (whisper). */
export function isCopartSttModel(id: string): boolean {
  return /whisper/i.test(id)
}

// Optional mapping for display names → API model IDs; any unknown name is passed through as-is
const MODEL_MAP: Record<string, string> = {
  // OpenAI
  'GPT-4.1': 'openai/gpt-4.1',
  'GPT-4o': 'openai/gpt-4o',
  'GPT-4o mini': 'openai/gpt-4o-mini',
  'GPT-5': 'openai/gpt-5',
  'GPT-5 mini': 'openai/gpt-5-mini',
  // Google Gemini
  'Gemini 2.0 Flash': 'google/gemini-2.0-flash',
  'Gemini 2.5 Flash': 'google/gemini-2.5-flash',
  'Gemini 2.5 Pro': 'google/gemini-2.5-pro',
  'Gemini 3 Flash Preview': 'google/gemini-3-flash-preview',
  'Gemini 3 Pro Preview': 'google/gemini-3-pro-preview',
  // Claude
  'Claude Haiku 4': 'anthropic/claude-haiku-4-5-20251001',
  'Claude Opus 4': 'anthropic/claude-opus-4-6',
  'Claude Sonnet 4': 'anthropic/claude-sonnet-4-6',
  'Opus Plan': 'opusplan',
  // STT
  'Whisper Large V3': 'whisper-large-v3',
  'Whisper Large V3 Turbo': 'whisper-large-v3-turbo',
}

export async function chatCopart(
  messages: { role: string; content: string }[],
  modelName: string,
  apiKey: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const client = new Anthropic({
    authToken: apiKey,
    baseURL: COPART_BASE_URL,
  })
  // Pass through any model name; only normalize known display names
  const model = (MODEL_MAP[modelName] ?? modelName).trim() || 'opusplan'

  const systemMessage = messages.find(m => m.role === 'system')
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  if (onChunk) {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: chatMessages,
    })

    let fullResponse = ''
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text
        fullResponse += text
        onChunk({ text, done: false })
      }
    }
    onChunk({ text: '', done: true })
    return fullResponse
  }

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemMessage?.content,
    messages: chatMessages,
  })

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

/** STT via same Copart Genie API key; uses OpenAI-compatible /v1/audio/transcriptions if available. */
export async function sttCopart(wavBuffer: Buffer, modelName: string, apiKey: string): Promise<string> {
  const boundary = `----FormBoundary${Date.now()}`
  const parts: Buffer[] = []
  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  ))
  parts.push(wavBuffer)
  const model = (MODEL_MAP[modelName] ?? modelName).trim() || 'whisper-1'
  parts.push(Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `${model}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `en\r\n` +
    `--${boundary}--\r\n`
  ))
  const body = Buffer.concat(parts)
  const url = `${COPART_BASE_URL.replace(/\/$/, '')}/v1/audio/transcriptions`
  const { statusCode, data } = await netFetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })
  if (statusCode === 401) throw new Error('Invalid Copart Genie API key. Check Settings > AI Models.')
  if (statusCode >= 400) throw new Error(`Copart Genie STT error (${statusCode}): ${data.slice(0, 200)}`)
  try {
    const json = JSON.parse(data)
    return (json.text ?? json.transcript ?? '').trim()
  } catch {
    return data.trim()
  }
}
