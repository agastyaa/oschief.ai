import { join } from 'path'
import { existsSync } from 'fs'
import { getModelsDir, downloadModel } from '../models/manager'

let ortSession: any = null
let ortLoaded = false

export interface VADSegment {
  start: number
  end: number
}

// Tuned for meetings: lower threshold catches quieter speakers, longer silence avoids splitting mid-thought
const VAD_THRESHOLD_DEFAULT = 0.45
const MIN_SPEECH_DURATION_DEFAULT = 0.25
const MIN_SILENCE_DURATION_DEFAULT = 0.7
const WINDOW_SIZE_SAMPLES = 512

export interface VADOptions {
  threshold?: number
  minSpeechDuration?: number
  minSilenceDuration?: number
}

function getVADModelPath(): string {
  return join(getModelsDir(), 'silero_vad.onnx')
}

export async function ensureVADModel(): Promise<void> {
  const modelPath = getVADModelPath()
  if (existsSync(modelPath)) return

  console.log('Auto-downloading Silero VAD model...')
  await downloadModel('silero-vad', () => {})
}

async function getORTSession(): Promise<any> {
  if (ortSession) return ortSession

  const modelPath = getVADModelPath()
  if (!existsSync(modelPath)) {
    await ensureVADModel()
  }

  if (!ortLoaded) {
    try {
      const ort = require('onnxruntime-node')
      ortSession = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
      })
      ortLoaded = true
    } catch (err: any) {
      console.error('Failed to load ONNX runtime or VAD model:', err.message)
      throw new Error('onnxruntime-node is required for VAD. Install with: npm install onnxruntime-node')
    }
  }

  return ortSession
}

export async function runVAD(audio: Float32Array, sampleRate: number, options?: VADOptions): Promise<VADSegment[]> {
  let session: any
  try {
    session = await getORTSession()
  } catch {
    return [{ start: 0, end: audio.length / sampleRate }]
  }

  const ort = require('onnxruntime-node')

  // Resample to 16kHz if needed
  let samples = audio
  if (sampleRate !== 16000) {
    const ratio = 16000 / sampleRate
    const newLen = Math.floor(audio.length * ratio)
    samples = new Float32Array(newLen)
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i / ratio
      const idx = Math.floor(srcIdx)
      const frac = srcIdx - idx
      samples[i] = idx + 1 < audio.length
        ? audio[idx] * (1 - frac) + audio[idx + 1] * frac
        : audio[idx]
    }
  }

  const speechProbs: number[] = []

  // Initialize hidden states for Silero VAD v5
  let h = new ort.Tensor('float32', new Float32Array(2 * 1 * 64).fill(0), [2, 1, 64])
  let c = new ort.Tensor('float32', new Float32Array(2 * 1 * 64).fill(0), [2, 1, 64])
  const sr = new ort.Tensor('int64', BigInt64Array.from([BigInt(16000)]), [1])

  for (let i = 0; i + WINDOW_SIZE_SAMPLES <= samples.length; i += WINDOW_SIZE_SAMPLES) {
    const chunk = samples.slice(i, i + WINDOW_SIZE_SAMPLES)
    const input = new ort.Tensor('float32', chunk, [1, WINDOW_SIZE_SAMPLES])

    try {
      const feeds: Record<string, any> = { input, h, c, sr }
      const results = await session.run(feeds)
      const prob = results.output.data[0]
      speechProbs.push(prob)
      h = results.hn
      c = results.cn
    } catch (err) {
      speechProbs.push(0)
    }
  }

  const threshold = options?.threshold ?? VAD_THRESHOLD_DEFAULT
  const minSpeech = options?.minSpeechDuration ?? MIN_SPEECH_DURATION_DEFAULT
  const minSilence = options?.minSilenceDuration ?? MIN_SILENCE_DURATION_DEFAULT

  return probsToSegments(speechProbs, WINDOW_SIZE_SAMPLES / 16000, threshold, minSpeech, minSilence)
}

function probsToSegments(probs: number[], frameDuration: number, threshold: number, minSpeechDuration: number, minSilenceDuration: number): VADSegment[] {
  const segments: VADSegment[] = []
  let inSpeech = false
  let speechStart = 0
  let silenceStart = 0

  for (let i = 0; i < probs.length; i++) {
    const time = i * frameDuration

    if (probs[i] >= threshold) {
      if (!inSpeech) {
        speechStart = time
        inSpeech = true
      }
      silenceStart = time + frameDuration
    } else {
      if (inSpeech) {
        const silenceDuration = time - silenceStart
        if (silenceDuration >= minSilenceDuration) {
          const speechDuration = silenceStart - speechStart
          if (speechDuration >= minSpeechDuration) {
            segments.push({ start: speechStart, end: silenceStart })
          }
          inSpeech = false
        }
      }
    }
  }

  if (inSpeech) {
    const endTime = probs.length * frameDuration
    if (endTime - speechStart >= minSpeechDuration) {
      segments.push({ start: speechStart, end: endTime })
    }
  }

  // Merge segments that are close together
  const merged: VADSegment[] = []
  for (const seg of segments) {
    if (merged.length > 0 && seg.start - merged[merged.length - 1].end < 0.7) {
      merged[merged.length - 1].end = seg.end
    } else {
      merged.push({ ...seg })
    }
  }

  return merged
}

// ─── Pause Removal Filter (Anti-Hallucination) ─────────────────────────────

/**
 * Threshold for removing internal pauses from speech segments before STT.
 * Silences > this threshold within a speech segment are removed to prevent
 * Whisper hallucination (fabricated text during silence).
 * Source: Whisper hallucination research — silences > 1s are the primary trigger.
 * 1.5s provides margin while preserving natural speech rhythm.
 */
export const PAUSE_REMOVAL_THRESHOLD_MS = 1500

/**
 * Remove long internal pauses from audio samples using VAD probabilities.
 * Returns a new Float32Array with pauses > PAUSE_REMOVAL_THRESHOLD_MS removed.
 * This is applied AFTER VAD segments speech, BEFORE sending to Whisper STT.
 */
export function removeLongPauses(
  samples: Float32Array,
  sampleRate: number,
  options?: VADOptions,
): Float32Array {
  // Quick path: short audio doesn't need filtering
  const durationMs = (samples.length / sampleRate) * 1000
  if (durationMs < PAUSE_REMOVAL_THRESHOLD_MS * 2) return samples

  const threshold = options?.threshold ?? VAD_THRESHOLD_DEFAULT

  // Compute per-frame speech probability using simple energy-based heuristic
  // (Faster than running full Silero VAD for this secondary filter)
  const frameSize = Math.floor(sampleRate * 0.032) // 32ms frames
  const pauseThresholdSamples = Math.floor((PAUSE_REMOVAL_THRESHOLD_MS / 1000) * sampleRate)

  // Find speech/silence segments using RMS energy
  const rmsThreshold = 0.01 // ~-40dB
  let silenceStart = -1
  const pauseRegions: Array<{ start: number; end: number }> = []

  for (let i = 0; i < samples.length; i += frameSize) {
    const end = Math.min(i + frameSize, samples.length)
    let sumSq = 0
    for (let j = i; j < end; j++) sumSq += samples[j] * samples[j]
    const rms = Math.sqrt(sumSq / (end - i))

    if (rms < rmsThreshold) {
      if (silenceStart === -1) silenceStart = i
    } else {
      if (silenceStart >= 0) {
        const silenceLen = i - silenceStart
        if (silenceLen >= pauseThresholdSamples) {
          pauseRegions.push({ start: silenceStart, end: i })
        }
        silenceStart = -1
      }
    }
  }

  if (pauseRegions.length === 0) return samples

  // Build new audio with pauses removed
  const keepRegions: Array<{ start: number; end: number }> = []
  let pos = 0
  for (const pause of pauseRegions) {
    if (pause.start > pos) keepRegions.push({ start: pos, end: pause.start })
    pos = pause.end
  }
  if (pos < samples.length) keepRegions.push({ start: pos, end: samples.length })

  const totalKeep = keepRegions.reduce((sum, r) => sum + (r.end - r.start), 0)
  const result = new Float32Array(totalKeep)
  let offset = 0
  for (const region of keepRegions) {
    result.set(samples.subarray(region.start, region.end), offset)
    offset += region.end - region.start
  }

  const removedMs = Math.round((samples.length - totalKeep) / sampleRate * 1000)
  if (removedMs > 100) {
    console.log(`[VAD] Removed ${removedMs}ms of internal pauses (${pauseRegions.length} regions) to reduce STT hallucination`)
  }

  return result
}
