import Anthropic from '@anthropic-ai/sdk'
import { netFetch } from './net-request'

const COPART_BASE_URL = 'https://genie.copart.com/api'

// Optional mapping for display names → API model IDs; any unknown name is passed through as-is
const MODEL_MAP: Record<string, string> = {
  'Opus Plan': 'opusplan',
  'Claude Sonnet 4': 'anthropic/claude-sonnet-4-6',
  'Claude Haiku 4': 'anthropic/claude-haiku-4-5-20251001',
  'Claude Opus 4': 'anthropic/claude-opus-4-6',
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
