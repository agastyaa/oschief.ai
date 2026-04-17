import { ipcMain } from 'electron'
import type { LocalSetupResult } from '../models/stt-engine'
import { downloadModel, cancelDownload, deleteModel, listDownloadedModels } from '../models/manager'
import {
  getCustomProviderConfigs, addCustomProviderConfig, updateCustomProviderConfig, removeCustomProviderConfig,
} from '../cloud/router'
import { fetchOpenRouterModels, invalidateOpenRouterModelCache, loadCachedOpenRouterModels } from '../cloud/openrouter'
import { testCustomProvider, fetchCustomProviderModels } from '../cloud/custom-provider'
import { loadKeychain } from './keychain-state'

/**
 * Model download / install / cloud-provider channels.
 * models (23) + ollama (5) + openrouter (2) + custom-provider (6) = 36 channels.
 */
export function registerModelsHandlers(): void {
  const WHISPER_CPP_MODEL_IDS = ['whisper-large-v3-turbo']

  ipcMain.handle('models:download', async (_e, modelId: string) => {
    const sender = _e.sender
    let downloadInProgress = true
    const onDestroyed = () => {
      if (downloadInProgress) {
        console.warn(`[models] Window destroyed during download of ${modelId}, cancelling`)
        cancelDownload(modelId)
      }
    }
    sender.once('destroyed', onDestroyed)
    try {
      await downloadModel(modelId, (progress) => {
        sender.send('models:download-progress', progress)
      })
      downloadInProgress = false
      let whisperCli: LocalSetupResult | undefined
      if (WHISPER_CPP_MODEL_IDS.includes(modelId)) {
        const { ensureWhisperCliSetupResult } = await import('../models/stt-engine')
        whisperCli = await ensureWhisperCliSetupResult()
      }
      sender.send('models:download-complete', { modelId, success: true, whisperCli })
      return true
    } catch (err: any) {
      downloadInProgress = false
      sender.send('models:download-complete', { modelId, success: false, error: err.message })
      return false
    } finally {
      sender.removeListener('destroyed', onDestroyed)
    }
  })
  ipcMain.handle('models:cancel-download', (_e, modelId: string) => { cancelDownload(modelId); return true })
  ipcMain.handle('models:delete', (_e, modelId: string) => { deleteModel(modelId); return true })
  ipcMain.handle('models:list', () => listDownloadedModels())
  ipcMain.handle('models:check-mlx-whisper', async () => {
    const { checkMLXWhisperAvailable } = await import('../models/stt-engine')
    return checkMLXWhisperAvailable()
  })
  ipcMain.handle('models:install-mlx-whisper', async () => {
    const { installMLXWhisper } = await import('../models/stt-engine')
    return installMLXWhisper()
  })
  ipcMain.handle('models:check-mlx-whisper-8bit', async () => {
    const { checkMLXWhisper8BitAvailable } = await import('../models/stt-engine')
    return checkMLXWhisper8BitAvailable()
  })
  ipcMain.handle('models:install-mlx-whisper-8bit', async () => {
    const { installMLXWhisper8Bit } = await import('../models/stt-engine')
    return installMLXWhisper8Bit()
  })
  ipcMain.handle('models:check-ffmpeg', async () => {
    const { checkFfmpegAvailable } = await import('../models/stt-engine')
    return checkFfmpegAvailable()
  })
  ipcMain.handle('models:install-ffmpeg', async () => {
    const { installFfmpeg } = await import('../models/stt-engine')
    return installFfmpeg()
  })
  ipcMain.handle('models:repair-mlx-whisper', async () => {
    const { repairMLXWhisper } = await import('../models/stt-engine')
    return repairMLXWhisper()
  })
  ipcMain.handle('models:repair-mlx-whisper-8bit', async () => {
    const { repairMLXWhisper8Bit } = await import('../models/stt-engine')
    return repairMLXWhisper8Bit()
  })
  ipcMain.handle('models:uninstall-mlx-whisper', async () => {
    const { uninstallMLXWhisper } = await import('../models/stt-engine')
    return uninstallMLXWhisper()
  })
  ipcMain.handle('models:uninstall-mlx-whisper-8bit', async () => {
    const { uninstallMLXWhisper8Bit } = await import('../models/stt-engine')
    return uninstallMLXWhisper8Bit()
  })

  // Qwen3-ASR
  ipcMain.handle('models:check-qwen3-asr', async () => {
    const { checkQwen3ASRAvailable } = await import('../models/stt-engine')
    return checkQwen3ASRAvailable()
  })
  ipcMain.handle('models:install-qwen3-asr', async () => {
    const { installQwen3ASR } = await import('../models/stt-engine')
    return installQwen3ASR()
  })
  ipcMain.handle('models:uninstall-qwen3-asr', async () => {
    const { uninstallQwen3ASR } = await import('../models/stt-engine')
    return uninstallQwen3ASR()
  })

  // Parakeet TDT
  ipcMain.handle('models:check-parakeet', async () => {
    try {
      const { execSync } = await import('child_process')
      execSync('python3 -c "import onnx_asr"', { timeout: 10000, stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  })
  ipcMain.handle('models:install-parakeet', async () => {
    const steps: { step: string; ok: boolean; detail?: string }[] = []
    try {
      const { execSync } = await import('child_process')
      try {
        execSync('python3 --version', { timeout: 5000, stdio: 'pipe' })
        steps.push({ step: 'Python 3 check', ok: true })
      } catch {
        steps.push({ step: 'Python 3 check', ok: false, detail: 'python3 not found. Install Python 3 from python.org or brew install python3' })
        return { ok: false, steps, error: 'Python 3 not found' }
      }
      try {
        execSync('python3 -m pip install --user onnx-asr', { timeout: 120000, stdio: 'pipe' })
        steps.push({ step: 'Install onnx-asr', ok: true })
      } catch (err: any) {
        const msg = err?.stderr?.toString?.()?.slice(0, 200) || ''
        if (msg.includes('externally-managed')) {
          try {
            execSync('python3 -m pip install --user --break-system-packages onnx-asr', { timeout: 120000, stdio: 'pipe' })
            steps.push({ step: 'Install onnx-asr (PEP 668 workaround)', ok: true })
          } catch (e2: any) {
            steps.push({ step: 'Install onnx-asr', ok: false, detail: e2?.stderr?.toString?.()?.slice(0, 200) || 'pip install failed' })
            return { ok: false, steps, error: 'pip install onnx-asr failed' }
          }
        } else {
          steps.push({ step: 'Install onnx-asr', ok: false, detail: msg || 'pip install failed' })
          return { ok: false, steps, error: 'pip install onnx-asr failed' }
        }
      }
      try {
        execSync('python3 -c "import onnx_asr; print(\'OK\')"', { timeout: 10000, stdio: 'pipe' })
        steps.push({ step: 'Verify onnx-asr', ok: true })
      } catch {
        steps.push({ step: 'Verify onnx-asr', ok: false, detail: 'Import check failed after install' })
        return { ok: false, steps, error: 'onnx-asr installed but import failed' }
      }
      return { ok: true, steps }
    } catch (err: any) {
      return { ok: false, steps, error: err.message?.slice(0, 200) || 'Unknown error' }
    }
  })

  // CoreML Parakeet
  ipcMain.handle('models:check-parakeet-coreml', async () => {
    try {
      const { isParakeetCoreMLAvailable } = await import('../audio/stt-parakeet-coreml')
      return await isParakeetCoreMLAvailable()
    } catch {
      return false
    }
  })
  ipcMain.handle('models:install-parakeet-coreml', async () => {
    try {
      const { buildParakeetCoreML, downloadParakeetCoreMLModels } = await import('../audio/stt-parakeet-coreml')
      console.log('[parakeet-coreml] Building Swift binary...')
      const buildResult = await buildParakeetCoreML()
      if (!buildResult.ok) return { ok: false, error: `Build failed: ${buildResult.error}` }
      console.log('[parakeet-coreml] Downloading CoreML models...')
      const dlResult = await downloadParakeetCoreMLModels()
      return dlResult
    } catch (err: any) {
      return { ok: false, error: err.message || 'CoreML Parakeet setup failed' }
    }
  })

  // MLX LLM
  ipcMain.handle('models:check-mlx-llm', async () => {
    try {
      const { isMLXLLMAvailable } = await import('../cloud/mlx-llm')
      return await isMLXLLMAvailable()
    } catch { return false }
  })
  ipcMain.handle('models:install-mlx-llm', async () => {
    try {
      const { buildMLXLLM, downloadMLXModels } = await import('../cloud/mlx-llm')
      console.log('[mlx-llm] Building Swift binary...')
      const buildResult = await buildMLXLLM()
      if (!buildResult.ok) return { ok: false, error: `Build failed: ${buildResult.error}` }
      console.log('[mlx-llm] Downloading MLX model weights...')
      const dlResult = await downloadMLXModels()
      return dlResult
    } catch (err: any) {
      return { ok: false, error: err.message || 'MLX LLM setup failed' }
    }
  })

  // Ollama
  ipcMain.handle('ollama:detect', async () => {
    const { detectOllama } = await import('../models/ollama-manager')
    return detectOllama()
  })
  ipcMain.handle('ollama:models', async () => {
    const { getOllamaModelsForPicker } = await import('../models/ollama-manager')
    return getOllamaModelsForPicker()
  })
  ipcMain.handle('ollama:recommended-tier', async () => {
    const { getRecommendedTier, getSystemRAMGB } = await import('../models/ollama-manager')
    return { tier: getRecommendedTier(), ramGB: getSystemRAMGB() }
  })
  ipcMain.handle('ollama:pull', async (_e, modelTag: string) => {
    const { pullOllamaModel } = await import('../models/ollama-manager')
    const sender = _e.sender
    await pullOllamaModel(modelTag, (progress) => {
      sender.send('ollama:pull-progress', { modelTag, ...progress })
    })
    return true
  })
  ipcMain.handle('ollama:health', async () => {
    const { ollamaHealthCheck } = await import('../models/ollama-manager')
    return ollamaHealthCheck()
  })

  // OpenRouter
  ipcMain.handle('openrouter:list-models', async () => {
    try {
      const chain = loadKeychain()
      const apiKey = chain['openrouter']
      if (!apiKey) return loadCachedOpenRouterModels()
      return await fetchOpenRouterModels(apiKey)
    } catch {
      return loadCachedOpenRouterModels()
    }
  })
  ipcMain.handle('openrouter:refresh-models', async () => {
    try {
      const chain = loadKeychain()
      const apiKey = chain['openrouter']
      if (!apiKey) return []
      invalidateOpenRouterModelCache()
      return await fetchOpenRouterModels(apiKey)
    } catch {
      return []
    }
  })

  // Custom Providers
  ipcMain.handle('custom-provider:list', () => getCustomProviderConfigs())
  ipcMain.handle('custom-provider:add', (_e, config: any) => { addCustomProviderConfig(config); return true })
  ipcMain.handle('custom-provider:update', (_e, config: any) => { updateCustomProviderConfig(config); return true })
  ipcMain.handle('custom-provider:remove', (_e, id: string) => { removeCustomProviderConfig(id); return true })
  ipcMain.handle('custom-provider:test', async (_e, apiKey: string, baseURL: string, model?: string) => {
    return testCustomProvider(apiKey, baseURL, model)
  })
  ipcMain.handle('custom-provider:fetch-models', async (_e, apiKey: string, baseURL: string) => {
    return fetchCustomProviderModels(apiKey, baseURL)
  })
}
