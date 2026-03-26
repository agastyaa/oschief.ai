import { ollamaHealthCheck, ollamaListModels, ollamaShowModel, ollamaPullModel } from '../cloud/ollama'

export type OllamaModelTier = {
  tag: string
  label: string
  size: string
  contextCap: number
  minRamGB: number
}

/**
 * RAM-tiered model recommendations.
 * Context caps prevent OOM from KV cache on consumer hardware.
 */
export const MODEL_TIERS: OllamaModelTier[] = [
  { tag: 'qwen3:4b', label: 'Qwen3 4B', size: '~2.5 GB', contextCap: 32768, minRamGB: 10 },
  { tag: 'qwen3:8b', label: 'Qwen3 8B', size: '~5 GB', contextCap: 32768, minRamGB: 16 },
  { tag: 'qwen2.5:32b', label: 'Qwen 2.5 32B', size: '~20 GB', contextCap: 16384, minRamGB: 32 },
  { tag: 'llama3.3:70b', label: 'Llama 3.3 70B', size: '~40 GB', contextCap: 8192, minRamGB: 64 },
]

/** Get total system RAM in GB. */
export function getSystemRAMGB(): number {
  const totalBytes = require('os').totalmem()
  return Math.round(totalBytes / (1024 * 1024 * 1024))
}

/**
 * Get the recommended Ollama model tier for this machine.
 * Returns null if RAM < 16GB (should use node-llama-cpp fallback).
 */
export function getRecommendedTier(): OllamaModelTier | null {
  const ramGB = getSystemRAMGB()

  // Pick the largest model that fits this machine's RAM
  let best: OllamaModelTier | null = null
  for (const tier of MODEL_TIERS) {
    if (ramGB >= tier.minRamGB) {
      best = tier
    }
  }
  return best
}

/**
 * Get the context cap for a specific Ollama model tag.
 * Falls back to 8192 if the model isn't in our tier table.
 */
export function getContextCap(modelTag: string): number {
  // Strip any leading "ollama:" prefix
  const tag = modelTag.replace(/^ollama:/, '')
  const tier = MODEL_TIERS.find((t) => tag.startsWith(t.tag.split(':')[0]))
  return tier?.contextCap ?? 8192
}

/** Check if Ollama is installed and running. */
export async function detectOllama(): Promise<{ available: boolean; models: string[] }> {
  const available = await ollamaHealthCheck()
  if (!available) return { available: false, models: [] }

  const models = await ollamaListModels()
  return {
    available: true,
    models: models.map((m) => m.name),
  }
}

/** Get Ollama models formatted for the AI model picker. */
export async function getOllamaModelsForPicker(): Promise<{ value: string; label: string; size: number }[]> {
  const models = await ollamaListModels()
  return models.map((m) => ({
    value: `ollama:${m.name}`,
    label: m.name,
    size: m.size,
  }))
}

/** Pull a model with progress forwarding. */
export async function pullOllamaModel(
  modelTag: string,
  onProgress?: (progress: { status: string; completed: number; total: number; percent: number }) => void,
  signal?: AbortSignal
): Promise<void> {
  return ollamaPullModel(modelTag, onProgress, signal)
}

/**
 * Auto-setup: if Ollama is running but no recommended model is pulled,
 * automatically pull the best model for this machine's RAM.
 * Runs silently in background on app launch — doesn't block startup.
 */
export async function autoSetupOllamaModel(
  onProgress?: (progress: { status: string; completed: number; total: number; percent: number }) => void
): Promise<{ pulled: boolean; model?: string; error?: string }> {
  try {
    const { available, models } = await detectOllama()
    if (!available) return { pulled: false }

    const tier = getRecommendedTier()
    if (!tier) return { pulled: false }

    // Check if any recommended model is already pulled
    const hasRecommended = MODEL_TIERS.some(t =>
      models.some(m => m.startsWith(t.tag.split(':')[0]))
    )
    if (hasRecommended) return { pulled: false }

    // No recommended model found — auto-pull the best one for this machine
    console.log(`[Ollama] Auto-pulling recommended model: ${tier.tag}`)
    await pullOllamaModel(tier.tag, onProgress)
    console.log(`[Ollama] Auto-pull complete: ${tier.tag}`)
    return { pulled: true, model: tier.tag }
  } catch (err: any) {
    console.warn('[Ollama] Auto-setup failed (non-blocking):', err.message?.slice(0, 100))
    return { pulled: false, error: err.message }
  }
}

/** Re-export for convenience. */
export { ollamaHealthCheck, ollamaListModels, ollamaShowModel }
