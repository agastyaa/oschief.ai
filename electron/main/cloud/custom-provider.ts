import OpenAI from 'openai'
import { netFetch } from './net-request'

export type CustomProviderConfig = {
  id: string
  name: string
  icon: string
  baseURL: string
  models: string[]
}

/**
 * Chat completion via any OpenAI-compatible endpoint.
 */
export async function chatCustomProvider(
  messages: { role: string; content: string }[],
  modelName: string,
  apiKey: string,
  baseURL: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL })

  if (onChunk) {
    const stream = await client.chat.completions.create({
      model: modelName,
      messages: messages as any,
      stream: true,
    })

    let fullResponse = ''
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || ''
      if (text) {
        fullResponse += text
        onChunk({ text, done: false })
      }
    }
    onChunk({ text: '', done: true })
    return fullResponse
  }

  const response = await client.chat.completions.create({
    model: modelName,
    messages: messages as any,
  })

  return response.choices[0]?.message?.content || ''
}

/**
 * Test connection to a custom provider by sending a minimal completion.
 */
export async function testCustomProvider(
  apiKey: string,
  baseURL: string,
  model?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = new OpenAI({ apiKey, baseURL })
    await client.chat.completions.create({
      model: model || 'test',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

/**
 * Try to auto-discover models from the provider via GET /models.
 */
export async function fetchCustomProviderModels(
  apiKey: string,
  baseURL: string
): Promise<string[]> {
  // Ensure baseURL ends with /v1 or similar, try GET /models
  const url = baseURL.replace(/\/+$/, '') + '/models'
  const { statusCode, data } = await netFetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (statusCode >= 400) return []

  try {
    const parsed = JSON.parse(data)
    const models = (parsed.data || parsed.models || [])
    return models.map((m: any) => m.id || m.name || m).filter(Boolean)
  } catch {
    return []
  }
}
