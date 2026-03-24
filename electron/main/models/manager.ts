import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, unlinkSync, readdirSync, statSync, renameSync } from 'fs'
import { netFetchStream } from '../cloud/net-request'

const MODEL_URLS: Record<string, { url: string; filename: string }> = {
  'whisper-large-v3-turbo': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
    filename: 'ggml-large-v3-turbo.bin',
  },
  'silero-vad': {
    url: 'https://huggingface.co/freddyaboulton/silero-vad/resolve/main/silero_vad.onnx',
    filename: 'silero_vad.onnx',
  },
  'ecapa-tdnn': {
    url: 'https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/resolve/main/embedding_model.onnx',
    filename: 'ecapa_tdnn.onnx',
  },
  'llama-3.2-3b': {
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    filename: 'llama-3.2-3b-instruct-q4_k_m.gguf',
  },
  // Qwen3-4B removed: node-llama-cpp@3.17 doesn't support Qwen3 architecture (garbled output).
  // Use Qwen3 via Ollama instead (ollama pull qwen3:4b). Revisit when node-llama-cpp updates.
  // Parakeet TDT: multi-file model installed via `pip3 install onnx-asr` (not a direct download).
}

const activeDownloads = new Map<string, { abort: () => void; controller: AbortController }>()

export function getModelsDir(): string {
  const dir = join(app.getPath('home'), '.syag', 'models')
  return dir
}

export function ensureModelsDir(): void {
  mkdirSync(getModelsDir(), { recursive: true })
}

export function getModelPath(modelId: string): string | null {
  const info = MODEL_URLS[modelId]
  if (!info) return null
  const path = join(getModelsDir(), info.filename)
  return existsSync(path) ? path : null
}

export function listDownloadedModels(): string[] {
  const modelsDir = getModelsDir()
  if (!existsSync(modelsDir)) return []

  const downloaded: string[] = []
  for (const [modelId, info] of Object.entries(MODEL_URLS)) {
    const path = join(modelsDir, info.filename)
    if (existsSync(path)) {
      const stat = statSync(path)
      if (stat.size > 1000) {
        downloaded.push(modelId)
      }
    }
  }
  return downloaded
}

type ProgressCallback = (progress: {
  modelId: string
  bytesDownloaded: number
  totalBytes: number
  percent: number
}) => void

export function downloadModel(modelId: string, onProgress: ProgressCallback): Promise<void> {
  const info = MODEL_URLS[modelId]
  if (!info) return Promise.reject(new Error(`Unknown model: ${modelId}`))

  ensureModelsDir()
  const destPath = join(getModelsDir(), info.filename)
  const tempPath = destPath + '.tmp'
  const controller = new AbortController()

  const cleanup = () => {
    try { unlinkSync(tempPath) } catch {}
    activeDownloads.delete(modelId)
  }

  activeDownloads.set(modelId, {
    controller,
    abort: () => {
      controller.abort()
      cleanup()
    },
  })

  return netFetchStream(
    info.url,
    tempPath,
    (bytesDownloaded, totalBytes) => {
      onProgress({
        modelId,
        bytesDownloaded,
        totalBytes,
        percent: totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0,
      })
    },
    controller.signal
  )
    .then(() => {
      ensureModelsDir()
      if (!existsSync(tempPath)) {
        throw new Error(`Download incomplete: temp file missing. Try again.`)
      }
      renameSync(tempPath, destPath)
      activeDownloads.delete(modelId)
    })
    .catch((err) => {
      cleanup()
      if (err?.name === 'AbortError') throw new Error('Download cancelled')
      throw err
    })
}

export function cancelDownload(modelId: string): void {
  const download = activeDownloads.get(modelId)
  if (download) download.abort()
}

export function deleteModel(modelId: string): void {
  const info = MODEL_URLS[modelId]
  if (!info) return
  const path = join(getModelsDir(), info.filename)
  try { unlinkSync(path) } catch {}
}
