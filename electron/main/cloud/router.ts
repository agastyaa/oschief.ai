import { getSetting } from '../storage/database'
import { chatOpenAI, sttOpenAI } from './openai'
import { chatAnthropic } from './anthropic'
import { chatGoogle } from './google'
import { sttDeepgram } from './deepgram'
import { sttAssemblyAI } from './assemblyai'
import { chatGroq, sttGroq } from './groq'

export type OptionalProviderMeta = {
  name: string
  icon: string
  supportsStt?: boolean
}

export type OptionalProviderHandlers = {
  chat: (messages: { role: string; content: string }[], modelName: string, apiKey: string, onChunk?: (chunk: { text: string; done: boolean }) => void) => Promise<string>
  stt?: (wavBuffer: Buffer, modelName: string, apiKey: string) => Promise<string>
  listModels?: (apiKey: string) => Promise<{ models: { id: string }[]; sttModels: { id: string }[] }>
  test?: () => Promise<{ ok: boolean; error?: string }>
  meta: OptionalProviderMeta
}

const optionalProviders = new Map<string, OptionalProviderHandlers>()

export function registerOptionalProvider(providerId: string, handlers: OptionalProviderHandlers): void {
  optionalProviders.set(providerId, handlers)
}

export function getOptionalProviderIds(): string[] {
  return Array.from(optionalProviders.keys())
}

export function getOptionalProviders(): { id: string; name: string; icon: string; supportsStt?: boolean }[] {
  return Array.from(optionalProviders.entries()).map(([id, h]) => ({
    id,
    name: h.meta?.name ?? id,
    icon: h.meta?.icon ?? '🔶',
    supportsStt: h.meta?.supportsStt,
  }))
}

export function getOptionalProviderHandlers(providerId: string): OptionalProviderHandlers | undefined {
  return optionalProviders.get(providerId)
}

export function getApiKey(providerId: string): string {
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

/**
 * Route an LLM chat/completion request to the appropriate cloud provider.
 * model format: "providerId:modelName" (e.g., "openai:GPT-4o")
 */
export async function routeLLM(
  messages: { role: string; content: string }[],
  model: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const [providerId, ...rest] = model.split(':')
  const modelName = rest.join(':')

  const optional = optionalProviders.get(providerId)
  if (optional?.chat) {
    const apiKey = getApiKey(providerId)
    return optional.chat(messages, modelName, apiKey, onChunk)
  }

  const apiKey = getApiKey(providerId)

  switch (providerId) {
    case 'openai':
      return chatOpenAI(messages, modelName, apiKey, onChunk)
    case 'anthropic':
      return chatAnthropic(messages, modelName, apiKey, onChunk)
    case 'google':
      return chatGoogle(messages, modelName, apiKey, onChunk)
    case 'groq':
      return chatGroq(messages, modelName, apiKey, onChunk)
    default:
      throw new Error(`Unknown LLM provider: ${providerId}. If this is an optional provider, install its files in Application Support > Syag > optional-providers and restart. Or pick OpenAI, Anthropic, Google, Groq, or a local model in Settings.`)
  }
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
    default:
      throw new Error(`Unknown STT provider: ${providerId}. If this is an optional provider, install its files in Application Support > Syag > optional-providers and restart. Or pick Deepgram, AssemblyAI, Groq, or a local model in Settings.`)
  }
}

export { chat } from '../models/llm-engine'
