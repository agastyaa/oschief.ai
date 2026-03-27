import { getSetting } from '../storage/database'

/**
 * Normalize model IDs to the prefixed form expected by llm-engine.
 * The Settings UI stores raw IDs ("mlx-qwen3-4b", "llama-3.2-3b")
 * but the LLM router expects prefixed forms ("mlx:qwen3-4b", "local:llama-3.2-3b").
 */
const MODEL_ID_MAP: Record<string, string> = {
  'mlx-qwen3-4b': 'mlx:qwen3-4b',
  'llama-3.2-3b': 'local:llama-3.2-3b',
  'qwen3.5:4b': 'ollama:qwen3.5:4b',
  'qwen3:4b': 'ollama:qwen3:4b',
  'qwen3:8b': 'ollama:qwen3:8b',
}

function normalizeModelId(raw: string): string {
  if (!raw) return raw
  // Already prefixed (has colon) — pass through
  if (raw.includes(':')) return raw
  // Known mapping
  return MODEL_ID_MAP[raw] || raw
}

/**
 * Resolve AI model selection from (in order):
 * 1) explicit arg
 * 2) legacy settings key: selected-ai-model
 * 3) current settings blob: model-settings.selectedAIModel
 *
 * Always normalizes to the prefixed form (e.g., "mlx:qwen3-4b").
 */
export function resolveSelectedAIModel(explicitModel?: string | null): string {
  const direct = (explicitModel || '').trim()
  if (direct) return normalizeModelId(direct)

  const legacy = (getSetting('selected-ai-model') || '').trim()
  if (legacy) return normalizeModelId(legacy)

  const modelSettingsRaw = getSetting('model-settings')
  if (!modelSettingsRaw) return ''
  try {
    const parsed = JSON.parse(modelSettingsRaw) as { selectedAIModel?: string }
    return normalizeModelId((parsed.selectedAIModel || '').trim())
  } catch {
    return ''
  }
}
