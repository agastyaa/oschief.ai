import { getSetting } from '../storage/database'

/**
 * Resolve AI model selection from (in order):
 * 1) explicit arg
 * 2) legacy settings key: selected-ai-model
 * 3) current settings blob: model-settings.selectedAIModel
 */
export function resolveSelectedAIModel(explicitModel?: string | null): string {
  const direct = (explicitModel || '').trim()
  if (direct) return direct

  const legacy = (getSetting('selected-ai-model') || '').trim()
  if (legacy) return legacy

  const modelSettingsRaw = getSetting('model-settings')
  if (!modelSettingsRaw) return ''
  try {
    const parsed = JSON.parse(modelSettingsRaw) as { selectedAIModel?: string }
    return (parsed.selectedAIModel || '').trim()
  } catch {
    return ''
  }
}
