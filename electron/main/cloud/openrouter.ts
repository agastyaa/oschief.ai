import OpenAI from 'openai'
import { netFetch } from './net-request'
import { getSetting, setSetting } from '../storage/database'

export type OpenRouterModel = {
  id: string
  name: string
  pricing?: { prompt: string; completion: string }
  context_length?: number
}

// ─── In-memory model cache ──────────────────────────────────────────────────
let _modelCache: OpenRouterModel[] | null = null
let _modelCacheTime = 0
const MODEL_CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

export function invalidateOpenRouterModelCache(): void {
  _modelCache = null
  _modelCacheTime = 0
}

/**
 * Fetch available models from OpenRouter. Uses a 15-min in-memory cache
 * and persists to DB so models load instantly on restart.
 */
export async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  if (_modelCache && Date.now() - _modelCacheTime < MODEL_CACHE_TTL_MS) {
    return _modelCache
  }

  const { statusCode, data } = await netFetch('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (statusCode === 401) throw new Error('Invalid OpenRouter API key. Check your key at openrouter.ai/keys.')
  if (statusCode >= 400) throw new Error(`OpenRouter models fetch failed (${statusCode}): ${data.slice(0, 200)}`)

  const parsed = JSON.parse(data)
  const models: OpenRouterModel[] = (parsed.data || []).map((m: any) => ({
    id: m.id,
    name: m.name || m.id,
    pricing: m.pricing ? { prompt: m.pricing.prompt, completion: m.pricing.completion } : undefined,
    context_length: m.context_length,
  }))

  _modelCache = models
  _modelCacheTime = Date.now()

  // Persist to DB for instant load on restart
  try { setSetting('openrouter-models-cache', JSON.stringify(models)) } catch {}

  return models
}

/**
 * Load cached models from DB (for instant startup before API call).
 */
export function loadCachedOpenRouterModels(): OpenRouterModel[] {
  if (_modelCache) return _modelCache
  try {
    const cached = getSetting('openrouter-models-cache')
    if (cached) {
      const models = JSON.parse(cached) as OpenRouterModel[]
      _modelCache = models
      _modelCacheTime = Date.now() - MODEL_CACHE_TTL_MS + 60_000 // expire in 1 min to trigger refresh
      return models
    }
  } catch {}
  return []
}

/**
 * Test an OpenRouter API key by fetching the models endpoint.
 */
export async function testOpenRouterKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await fetchOpenRouterModels(apiKey)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

/**
 * Chat completion via OpenRouter. OpenAI-compatible API.
 */
export async function chatOpenRouter(
  messages: { role: string; content: string }[],
  modelName: string,
  apiKey: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://oschief.app',
      'X-Title': 'OSChief',
    },
  })

  // modelName is the full OpenRouter model ID (e.g. "anthropic/claude-sonnet-4")
  const model = modelName

  if (onChunk) {
    const stream = await client.chat.completions.create({
      model,
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
    model,
    messages: messages as any,
  })

  return response.choices[0]?.message?.content || ''
}
