import { getSetting } from '../storage/database'
import { chatOpenAI, sttOpenAI } from './openai'
import { chatAnthropic } from './anthropic'
import { chatCopart, sttCopart, listCopartModels, isCopartSttModel } from './copart'
import { chatGoogle } from './google'
import { sttDeepgram } from './deepgram'
import { sttAssemblyAI } from './assemblyai'
import { chatGroq, sttGroq } from './groq'

function getApiKey(providerId: string): string {
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

  const apiKey = getApiKey(providerId)

  switch (providerId) {
    case 'openai':
      return chatOpenAI(messages, modelName, apiKey, onChunk)
    case 'anthropic':
      return chatAnthropic(messages, modelName, apiKey, onChunk)
    case 'copart':
      return chatCopart(messages, modelName, apiKey, onChunk)
    case 'google':
      return chatGoogle(messages, modelName, apiKey, onChunk)
    case 'groq':
      return chatGroq(messages, modelName, apiKey, onChunk)
    default:
      throw new Error(`Unknown LLM provider: ${providerId}`)
  }
}

/**
 * Route an STT request to the appropriate cloud provider.
 * model format: "providerId:modelName" (e.g., "deepgram:Nova-2")
 */
export async function routeSTT(wavBuffer: Buffer, model: string): Promise<string> {
  if (!model?.trim()) {
    throw new Error('No STT model selected. Choose one in Settings > AI Models.')
  }
  const [providerId, ...rest] = model.split(':')
  const modelName = rest.join(':')
  if (!providerId?.trim()) {
    throw new Error('Invalid STT model. Choose a cloud provider (e.g. Deepgram) in Settings > AI Models.')
  }

  const apiKey = getApiKey(providerId)

  switch (providerId) {
    case 'openai':
      return sttOpenAI(wavBuffer, apiKey)
    case 'deepgram':
      return sttDeepgram(wavBuffer, modelName, apiKey)
    case 'assemblyai':
      return sttAssemblyAI(wavBuffer, apiKey)
    case 'groq':
      return sttGroq(wavBuffer, apiKey)
    case 'copart':
      return sttCopart(wavBuffer, modelName, apiKey)
    default:
      throw new Error(`Unknown STT provider: ${providerId}`)
  }
}

/**
 * Test Copart Genie API key by sending a minimal chat request.
 * Returns { ok: true } or { ok: false, error: string }.
 * Common failures: no key in Settings; "Invalid API key" (401); wrong base URL or model ID (4xx/5xx from genie.copart.com).
 */
export async function testCopartConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const apiKey = getApiKey('copart')
    await chatCopart(
      [{ role: 'user', content: 'Reply with exactly: OK' }],
      'Claude Sonnet 4',
      apiKey
    )
    return { ok: true }
  } catch (err: any) {
    const message = err?.message ?? String(err)
    return { ok: false, error: message }
  }
}

/**
 * List available models from Copart Genie API.
 * Returns { models: CopartModel[], sttModels: CopartModel[] } or empty arrays on error.
 */
export async function listCopartGenieModels(): Promise<{
  models: { id: string }[]
  sttModels: { id: string }[]
}> {
  try {
    const apiKey = getApiKey('copart')
    const all = await listCopartModels(apiKey)
    const sttModels = all.filter((m) => isCopartSttModel(m.id))
    const models = all.filter((m) => !isCopartSttModel(m.id))
    return { models, sttModels }
  } catch {
    return { models: [], sttModels: [] }
  }
}

export { chat } from '../models/llm-engine'
