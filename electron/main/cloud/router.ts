import { getSetting, setSetting } from '../storage/database'
import { sttOpenAI } from './openai'
import { sttDeepgram } from './deepgram'
import { chatOllama } from './ollama'
import { sttAssemblyAI } from './assemblyai'
import { sttGroq } from './groq'
import { sttMicrosoft } from './microsoft-stt'
import { chatOpenRouter } from './openrouter'
import { chatCustomProvider, type CustomProviderConfig } from './custom-provider'

export type OptionalProviderMeta = {
  name: string
  icon: string
  supportsStt?: boolean
  models?: string[]
  sttModels?: string[]
}

export type OptionalProviderHandlers = {
  chat: (messages: { role: string; content: string }[], modelName: string, apiKey: string, onChunk?: (chunk: { text: string; done: boolean }) => void) => Promise<string>
  stt?: (wavBuffer: Buffer, modelName: string, apiKey: string) => Promise<string>
  listModels?: (apiKey: string) => Promise<{ models: { id: string }[]; sttModels: { id: string }[] }>
  test?: () => Promise<{ ok: boolean; error?: string }>
  meta: OptionalProviderMeta
}

const optionalProviders = new Map<string, OptionalProviderHandlers>()

// ─── Keychain cache — avoid re-reading + decrypting on every cloud call ──────
let _keychainCache: Record<string, string> | null = null
let _keychainCacheTime = 0
const KEYCHAIN_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/** Clear the in-memory keychain cache. Call after keychain writes. */
export function invalidateKeychainCache(): void {
  _keychainCache = null
  _keychainCacheTime = 0
}

export function registerOptionalProvider(providerId: string, handlers: OptionalProviderHandlers): void {
  optionalProviders.set(providerId, handlers)
}

export function unregisterOptionalProvider(providerId: string): void {
  optionalProviders.delete(providerId)
}

export function getOptionalProviderIds(): string[] {
  return Array.from(optionalProviders.keys())
}

export function getOptionalProviders(): { id: string; name: string; icon: string; supportsStt?: boolean; models?: string[]; sttModels?: string[] }[] {
  return Array.from(optionalProviders.entries()).map(([id, h]) => ({
    id,
    name: h.meta?.name ?? id,
    icon: h.meta?.icon ?? '🔶',
    supportsStt: h.meta?.supportsStt,
    models: h.meta?.models,
    sttModels: h.meta?.sttModels,
  }))
}

export function getOptionalProviderHandlers(providerId: string): OptionalProviderHandlers | undefined {
  return optionalProviders.get(providerId)
}

export function getApiKey(providerId: string): string {
  // Return from cache if still fresh
  if (_keychainCache && (Date.now() - _keychainCacheTime < KEYCHAIN_CACHE_TTL_MS)) {
    const cached = _keychainCache[providerId]
    if (cached && typeof cached === 'string' && cached.trim()) {
      return cached.trim()
    }
    // Key not in cache — fall through to throw a helpful error
    if (_keychainCache && !cached) {
      throw new Error(`No API key for ${providerId}. Connect ${providerId} in Settings > AI Models and enter your API key.`)
    }
  }

  const { safeStorage } = require('electron')
  const { readFileSync, existsSync } = require('fs')
  const { join } = require('path')
  const { app } = require('electron')

  const keychainPath = join(app.getPath('userData'), 'secure', 'keychain.enc')
  if (!existsSync(keychainPath)) {
    throw new Error(`No API key for ${providerId}. Connect ${providerId} in Settings > AI Models and enter your API key.`)
  }

  try {
    const encrypted = readFileSync(keychainPath)
    const decrypted = safeStorage.decryptString(encrypted)
    const keys = JSON.parse(decrypted)

    // Populate cache
    _keychainCache = keys
    _keychainCacheTime = Date.now()

    const key = keys[providerId]
    if (!key || typeof key !== 'string' || !key.trim()) {
      throw new Error(`No API key for ${providerId}. Connect ${providerId} in Settings > AI Models and enter your API key.`)
    }
    return key.trim()
  } catch (err: any) {
    if (err.message?.includes('No API key') || err.message?.includes('Connect ')) throw err
    throw new Error(`API key for ${providerId} could not be read. Re-enter your key in Settings > AI Models.`)
  }
}

// ─── Custom provider registry (UI-created, persisted in DB) ─────────────────
const customProviderConfigs = new Map<string, CustomProviderConfig>()

/**
 * Load UI-created custom providers from DB and register them as optional providers.
 * Called at app startup.
 */
export function loadCustomProviders(): void {
  try {
    const raw = getSetting('custom-providers')
    if (!raw) return
    const configs: CustomProviderConfig[] = JSON.parse(raw)
    for (const config of configs) {
      customProviderConfigs.set(config.id, config)
      registerOptionalProvider(config.id, {
        chat: (messages, modelName, apiKey, onChunk) =>
          chatCustomProvider(messages, modelName, apiKey, config.baseURL, onChunk),
        meta: {
          name: config.name,
          icon: config.icon,
          models: config.models,
        },
      })
    }
  } catch (err) {
    console.warn('[custom-providers] Failed to load:', err)
  }
}

export function getCustomProviderConfigs(): CustomProviderConfig[] {
  return Array.from(customProviderConfigs.values())
}

export function addCustomProviderConfig(config: CustomProviderConfig): void {
  customProviderConfigs.set(config.id, config)
  registerOptionalProvider(config.id, {
    chat: (messages, modelName, apiKey, onChunk) =>
      chatCustomProvider(messages, modelName, apiKey, config.baseURL, onChunk),
    meta: {
      name: config.name,
      icon: config.icon,
      models: config.models,
    },
  })
  _saveCustomProviders()
}

export function updateCustomProviderConfig(config: CustomProviderConfig): void {
  addCustomProviderConfig(config) // same logic: upsert
}

export function removeCustomProviderConfig(id: string): void {
  customProviderConfigs.delete(id)
  unregisterOptionalProvider(id)
  _saveCustomProviders()
}

function _saveCustomProviders(): void {
  const configs = Array.from(customProviderConfigs.values())
  setSetting('custom-providers', JSON.stringify(configs))
}

/**
 * Route an LLM chat/completion request to the appropriate provider.
 * model format: "providerId:modelName" (e.g., "openrouter:anthropic/claude-sonnet-4")
 */
export async function routeLLM(
  messages: { role: string; content: string }[],
  model: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const [providerId, ...rest] = model.split(':')
  const modelName = rest.join(':')

  // Air-gapped mode: block all cloud providers, allow only local/ollama/apple
  const localProviders = new Set(['local', 'ollama', 'apple', 'mlx'])
  if (!localProviders.has(providerId)) {
    try {
      const { getSetting } = require('../storage/database')
      if (getSetting('privacy-airgapped') === 'true') {
        throw new Error('Air-gapped mode is enabled. Cloud AI providers are disabled. Switch to a local model in Settings > AI Models, or disable air-gapped mode in Settings > Privacy.')
      }
    } catch (e: any) {
      if (e.message?.includes('Air-gapped')) throw e
      // DB not ready yet — allow through
    }
  }

  // Local models — no API key needed, route directly
  if (providerId === 'ollama') {
    return chatOllama(messages, modelName, onChunk)
  }
  if (providerId === 'local') {
    const llmEngine = await import('../models/llm-engine')
    return (llmEngine as any).chatWithLocal(messages, modelName, onChunk)
  }
  if (providerId === 'mlx') {
    const { chatMLX } = await import('./mlx-llm')
    return chatMLX(messages, modelName, onChunk)
  }
  if (providerId === 'apple') {
    const { chatApple } = await import('./apple-llm')
    return chatApple(messages, model, onChunk)
  }

  // OpenRouter — first-class built-in
  if (providerId === 'openrouter') {
    const apiKey = getApiKey('openrouter')
    return chatOpenRouter(messages, modelName, apiKey, onChunk)
  }

  // Optional providers (file-based plugins + UI-created custom providers)
  const optional = optionalProviders.get(providerId)
  if (optional?.chat) {
    const apiKey = getApiKey(providerId)
    return optional.chat(messages, modelName, apiKey, onChunk)
  }

  throw new Error(`Unknown LLM provider: "${providerId}". Connect OpenRouter for cloud models, add a custom provider, or use a local model in Settings > AI Models.`)
}

/**
 * Route an STT request to the appropriate cloud provider.
 * model format: "providerId:modelName" (e.g., "deepgram:Nova-2")
 * vocabulary: optional domain terms (Deepgram keywords)
 * prompt: optional natural-sentence context (Groq/OpenAI Whisper initial_prompt)
 */
export async function routeSTT(wavBuffer: Buffer, model: string, vocabulary?: string[], prompt?: string): Promise<string> {
  if (!model?.trim()) {
    throw new Error('No STT model selected. Choose one in Settings > AI Models.')
  }
  const [providerId, ...rest] = model.split(':')
  const modelName = rest.join(':')
  if (!providerId?.trim()) {
    throw new Error('Invalid STT model. Choose a cloud provider (e.g. Deepgram) in Settings > AI Models.')
  }

  const optional = optionalProviders.get(providerId)
  if (optional?.stt) {
    const apiKey = getApiKey(providerId)
    return optional.stt(wavBuffer, modelName, apiKey)
  }

  const apiKey = getApiKey(providerId)

  switch (providerId) {
    case 'openai':
      return sttOpenAI(wavBuffer, apiKey, prompt)
    case 'deepgram':
      return sttDeepgram(wavBuffer, modelName, apiKey, vocabulary)
    case 'assemblyai':
      return sttAssemblyAI(wavBuffer, apiKey)
    case 'groq':
      return sttGroq(wavBuffer, apiKey, prompt)
    case 'microsoft':
      return sttMicrosoft(wavBuffer, modelName, apiKey, prompt)
    default:
      throw new Error(`Unknown STT provider: "${providerId}". Use Deepgram, AssemblyAI, Groq, Microsoft, or a local model for transcription.`)
  }
}

export { chat } from '../models/llm-engine'
