/**
 * Zero-config AI model setup — runs on first launch.
 *
 * Two tracks:
 *   Track 1 (Ollama): MLX Whisper + Qwen3 8B via Ollama (best quality, 16GB+)
 *   Track 2 (Bundled): whisper.cpp + Llama 3.2 3B (just works, any Mac)
 *
 * STT: Try MLX Whisper first (Apple Silicon), fall back to whisper.cpp.
 * LLM: Try Ollama first, fall back to node-llama-cpp GGUF.
 */

import { getSetting, setSetting } from '../storage/database'
import { downloadModel, getModelPath, ensureModelsDir } from './manager'
import { getSystemRAMGB, getRecommendedTier, autoSetupOllamaModel } from './ollama-manager'
import { ollamaHealthCheck } from '../cloud/ollama'
import { existsSync } from 'fs'
import { join } from 'path'
import os from 'os'

export type SetupPhase = 'detecting' | 'downloading-stt' | 'installing-stt' | 'downloading-llm' | 'configuring' | 'ready' | 'error'

export type SetupStatus = {
  phase: SetupPhase
  message: string
  percent: number
  track: 1 | 2
  sttModel?: string
  llmModel?: string
}

export type SetupResult = {
  ok: boolean
  track: 1 | 2
  sttModel: string
  llmModel: string
  error?: string
}

const IS_APPLE_SILICON = os.arch() === 'arm64' && process.platform === 'darwin'

/**
 * Check if auto-setup has already completed.
 */
export function isSetupComplete(): boolean {
  return getSetting('auto-setup-complete') === 'true'
}

/**
 * Check if any STT + LLM models are already configured.
 */
function hasModelsConfigured(): boolean {
  const settingsRaw = getSetting('model-settings')
  if (!settingsRaw) return false
  try {
    const settings = JSON.parse(settingsRaw)
    return !!(settings.selectedSTTModel && settings.selectedAIModel)
  } catch {
    return false
  }
}

/**
 * Run zero-config auto-setup. Downloads best available models for this machine.
 * Non-blocking — caller should run this in background and forward progress to renderer.
 */
export async function runAutoSetup(
  onProgress: (status: SetupStatus) => void
): Promise<SetupResult> {
  // Track 0: Bundled models — zero downloads, instant setup
  if (process.resourcesPath) {
    const bundledParakeet = existsSync(join(process.resourcesPath, 'darwin', 'models', 'parakeet-coreml', '.models-ready'))
    const bundledMLX = existsSync(join(process.resourcesPath, 'darwin', 'syag-mlx-llm-bin'))
      && existsSync(join(process.resourcesPath, 'darwin', 'models', 'mlx-qwen3-4b'))
    if (bundledParakeet && bundledMLX && !hasModelsConfigured()) {
      console.log('[auto-setup] Track 0: Bundled models detected — instant setup')
      onProgress({ phase: 'configuring', message: 'On-device AI models ready', percent: 95, track: 1, sttModel: 'local:parakeet-coreml', llmModel: 'mlx:qwen3-4b' })
      const existingRaw = getSetting('model-settings')
      let existing: Record<string, any> = {}
      try { existing = existingRaw ? JSON.parse(existingRaw) : {} } catch {}
      const updated = { ...existing, selectedSTTModel: 'local:parakeet-coreml', selectedAIModel: 'mlx:qwen3-4b', useLocalModels: true }
      setSetting('model-settings', JSON.stringify(updated))
      setSetting('auto-setup-complete', 'true')
      onProgress({ phase: 'ready', message: 'OSChief is ready!', percent: 100, track: 1, sttModel: 'local:parakeet-coreml', llmModel: 'mlx:qwen3-4b' })
      return { ok: true, track: 1, sttModel: 'local:parakeet-coreml', llmModel: 'mlx:qwen3-4b' }
    }
  }

  // Skip if models already configured (fully set up)
  if (hasModelsConfigured() && isSetupComplete()) {
    // Even if setup completed, try to upgrade LLM to Ollama if available and currently using local fallback
    const existingRaw = getSetting('model-settings')
    const existing = existingRaw ? JSON.parse(existingRaw) : {}
    if (existing.selectedAIModel?.startsWith('local:')) {
      const ollamaRunning = await ollamaHealthCheck().catch(() => false)
      if (ollamaRunning) {
        const tier = getRecommendedTier()
        if (tier) {
          try {
            const result = await autoSetupOllamaModel()
            if (result.pulled && result.model) {
              existing.selectedAIModel = `ollama:${result.model}`
              setSetting('model-settings', JSON.stringify(existing))
              console.log(`[auto-setup] Upgraded LLM to Ollama: ${result.model}`)
              return { ok: true, track: 1, sttModel: existing.selectedSTTModel, llmModel: `ollama:${result.model}` }
            }
          } catch {}
        }
      }
    }
    return { ok: true, track: 1, sttModel: 'existing', llmModel: 'existing' }
  }

  ensureModelsDir()

  const ramGB = getSystemRAMGB()
  const ollamaRunning = await ollamaHealthCheck().catch(() => false)

  // Determine track
  const track: 1 | 2 = ollamaRunning ? 1 : 2
  console.log(`[auto-setup] Track ${track} | RAM: ${ramGB}GB | Ollama: ${ollamaRunning} | Apple Silicon: ${IS_APPLE_SILICON}`)

  onProgress({ phase: 'detecting', message: 'Detecting your Mac capabilities...', percent: 5, track })

  let sttModel = ''
  let llmModel = ''

  try {
    // ── STT Setup ──
    onProgress({ phase: 'downloading-stt', message: 'Setting up speech recognition...', percent: 10, track })

    if (IS_APPLE_SILICON) {
      // Try Parakeet CoreML first (best: 600M params, ~2.5% WER, runs on ANE)
      try {
        const { isParakeetCoreMLAvailable, buildParakeetCoreML, downloadParakeetCoreMLModels } = await import('../audio/stt-parakeet-coreml')
        const parakeetReady = await isParakeetCoreMLAvailable()
        if (parakeetReady) {
          sttModel = 'local:parakeet-coreml'
          console.log('[auto-setup] Parakeet CoreML already available')
        } else {
          onProgress({ phase: 'installing-stt', message: 'Setting up Parakeet speech recognition...', percent: 12, track })
          const buildResult = await buildParakeetCoreML()
          if (buildResult.ok) {
            onProgress({ phase: 'downloading-stt', message: 'Downloading Parakeet CoreML models (~600MB)...', percent: 15, track })
            const dlResult = await downloadParakeetCoreMLModels()
            if (dlResult.ok) {
              sttModel = 'local:parakeet-coreml'
              console.log('[auto-setup] Parakeet CoreML ready')
            } else {
              console.warn('[auto-setup] Parakeet model download failed:', dlResult.error)
            }
          } else {
            console.warn('[auto-setup] Parakeet build failed:', buildResult.error)
          }
        }
      } catch (err: any) {
        console.warn('[auto-setup] Parakeet CoreML failed:', err.message?.slice(0, 100))
      }

      // Fallback: MLX Whisper
      if (!sttModel) {
        try {
          onProgress({ phase: 'installing-stt', message: 'Installing MLX Whisper...', percent: 15, track })
          const { installMLXWhisper, checkMLXWhisperAvailable } = await import('./stt-engine')

          const alreadyInstalled = await checkMLXWhisperAvailable()
          if (alreadyInstalled) {
            sttModel = 'local:mlx-whisper-large-v3-turbo'
            console.log('[auto-setup] MLX Whisper already installed')
          } else {
            const result = await installMLXWhisper()
            if (result.ok) {
              sttModel = 'local:mlx-whisper-large-v3-turbo'
              console.log('[auto-setup] MLX Whisper installed successfully')
            } else {
              console.warn('[auto-setup] MLX Whisper install failed, falling back to whisper.cpp:', result.error)
            }
          }
        } catch (err: any) {
          console.warn('[auto-setup] MLX Whisper failed:', err.message?.slice(0, 100))
        }
      }
    }

    // Fallback: whisper.cpp (works on any Mac)
    if (!sttModel) {
      onProgress({ phase: 'downloading-stt', message: 'Downloading Whisper speech model (1.6 GB)...', percent: 20, track })

      const whisperPath = getModelPath('whisper-large-v3-turbo')
      if (whisperPath) {
        sttModel = 'local:whisper-large-v3-turbo'
        console.log('[auto-setup] Whisper model already downloaded')
      } else {
        await downloadModel('whisper-large-v3-turbo', (progress) => {
          const pct = 20 + Math.floor(progress.percent * 0.3) // 20-50% of overall
          onProgress({
            phase: 'downloading-stt',
            message: `Downloading speech recognition (${Math.round(progress.percent)}%)...`,
            percent: pct,
            track,
          })
        })
        sttModel = 'local:whisper-large-v3-turbo'
        console.log('[auto-setup] Whisper model downloaded')

        // Try to ensure whisper-cli binary is available
        try {
          const { ensureWhisperBinary } = await import('./stt-engine')
          await ensureWhisperBinary()
          console.log('[auto-setup] whisper-cli binary ready')
        } catch (err: any) {
          console.warn('[auto-setup] whisper-cli binary setup failed (user may need to install manually):', err.message?.slice(0, 100))
        }
      }
    }

    onProgress({ phase: 'downloading-stt', message: 'Speech recognition ready', percent: 50, track, sttModel })

    // ── LLM Setup ──
    onProgress({ phase: 'downloading-llm', message: 'Setting up AI summarization...', percent: 55, track })

    // Try MLX-LLM first (Qwen3-4B on Apple Silicon — no Ollama needed, fully on-device)
    if (IS_APPLE_SILICON && !llmModel) {
      try {
        const { isMLXLLMAvailable, buildMLXLLM, downloadMLXModels } = await import('../cloud/mlx-llm')
        const mlxReady = await isMLXLLMAvailable()
        if (mlxReady) {
          llmModel = 'mlx:qwen3-4b'
          console.log('[auto-setup] MLX-LLM (Qwen3-4B) already available')
        } else {
          onProgress({ phase: 'downloading-llm', message: 'Building MLX-LLM engine...', percent: 57, track })
          const buildResult = await buildMLXLLM()
          if (buildResult.ok) {
            onProgress({ phase: 'downloading-llm', message: 'Downloading Qwen3-4B (~2.5GB)...', percent: 60, track })
            const dlResult = await downloadMLXModels()
            if (dlResult.ok) {
              llmModel = 'mlx:qwen3-4b'
              console.log('[auto-setup] MLX-LLM (Qwen3-4B) ready')
            } else {
              console.warn('[auto-setup] MLX model download failed:', dlResult.error)
            }
          } else {
            console.warn('[auto-setup] MLX-LLM build failed:', buildResult.error)
          }
        }
      } catch (err: any) {
        console.warn('[auto-setup] MLX-LLM failed:', err.message?.slice(0, 100))
      }
    }

    // Fallback: Ollama
    if (!llmModel && track === 1 && ollamaRunning) {
      // Track 1: Ollama — auto-pull best model
      const tier = getRecommendedTier()
      if (tier) {
        onProgress({ phase: 'downloading-llm', message: `Downloading ${tier.label} via Ollama...`, percent: 60, track })
        const result = await autoSetupOllamaModel((progress) => {
          const pct = 60 + Math.floor((progress.percent / 100) * 30) // 60-90%
          onProgress({
            phase: 'downloading-llm',
            message: `Downloading ${tier.label} (${Math.round(progress.percent)}%)...`,
            percent: pct,
            track,
          })
        })
        if (result.pulled && result.model) {
          llmModel = `ollama:${result.model}`
          console.log(`[auto-setup] Ollama model pulled: ${result.model}`)
        } else if (!result.pulled) {
          // Model may already exist — check
          const { detectOllama } = await import('./ollama-manager')
          const detection = await detectOllama()
          if (detection.models.length > 0) {
            llmModel = `ollama:${detection.models[0]}`
            console.log(`[auto-setup] Ollama model already available: ${detection.models[0]}`)
          }
        }
      }
    }

    // Fallback: Llama 3.2 3B via node-llama-cpp
    if (!llmModel) {
      onProgress({ phase: 'downloading-llm', message: 'Downloading Llama 3.2 3B (2 GB)...', percent: 60, track: 2 })

      const llamaPath = getModelPath('llama-3.2-3b')
      if (llamaPath) {
        llmModel = 'local:llama-3.2-3b'
        console.log('[auto-setup] Llama 3.2 3B already downloaded')
      } else {
        await downloadModel('llama-3.2-3b', (progress) => {
          const pct = 60 + Math.floor(progress.percent * 0.3) // 60-90%
          onProgress({
            phase: 'downloading-llm',
            message: `Downloading AI summarization (${Math.round(progress.percent)}%)...`,
            percent: pct,
            track: 2,
          })
        })
        llmModel = 'local:llama-3.2-3b'
        console.log('[auto-setup] Llama 3.2 3B downloaded')
      }
    }

    onProgress({ phase: 'downloading-llm', message: 'AI summarization ready', percent: 90, track, llmModel })

    // ── Configure ──
    onProgress({ phase: 'configuring', message: 'Configuring OSChief...', percent: 95, track, sttModel, llmModel })

    // Auto-select models in Settings DB
    const existingRaw = getSetting('model-settings')
    let existing: Record<string, any> = {}
    try { existing = existingRaw ? JSON.parse(existingRaw) : {} } catch {}

    const updated = {
      ...existing,
      selectedSTTModel: sttModel,
      selectedAIModel: llmModel,
      useLocalModels: true,
    }
    setSetting('model-settings', JSON.stringify(updated))
    setSetting('auto-setup-complete', 'true')

    console.log(`[auto-setup] Complete — STT: ${sttModel}, LLM: ${llmModel}`)
    onProgress({ phase: 'ready', message: 'OSChief is ready!', percent: 100, track, sttModel, llmModel })

    return { ok: true, track, sttModel, llmModel }
  } catch (err: any) {
    const msg = err.message?.slice(0, 200) || 'Unknown error'
    console.error('[auto-setup] Failed:', msg)
    onProgress({ phase: 'error', message: `Setup failed: ${msg.slice(0, 80)}`, percent: 0, track })

    // Even if setup fails, mark as attempted so we don't loop
    setSetting('auto-setup-complete', 'partial')

    return { ok: false, track, sttModel, llmModel, error: msg }
  }
}
