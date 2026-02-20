import { processWithLocalSTT, resetContext, type STTResult } from '../models/stt-engine'
import { routeSTT } from '../cloud/router'
import { runVAD, ensureVADModel } from './vad'
import { getSetting } from '../storage/database'

export type TranscriptCallback = (chunk: { speaker: string; time: string; text: string }) => void
export type StatusCallback = (status: { state: string; error?: string }) => void

let isRecording = false
let isPaused = false
let transcriptCallback: TranscriptCallback | null = null
let statusCallback: StatusCallback | null = null
const audioBuffers: Float32Array[][] = [[], []]
let recordingStartTime = 0
let chunkTimer: ReturnType<typeof setInterval> | null = null
let silenceTimer: ReturnType<typeof setInterval> | null = null
let currentSTTModel = ''
let customVocabulary = ''
let isProcessing = false
let lastSpeechTime = 0
let autoPaused = false
let consecutiveSilentChunks = 0

// Near real-time (Granola-style): process every 4s when active, 15s when idle
const CHUNK_INTERVAL_ACTIVE_MS = 4000
const CHUNK_INTERVAL_IDLE_MS = 15000
const SAMPLE_RATE = 16000
const AUTO_PAUSE_SILENCE_MS = 60000
const MIN_SAMPLES_PER_CHANNEL = 16000 * 2 // 2s minimum for STT (near real-time, APIs support short audio)
const SPEAKER_BY_CHANNEL = ['You', 'Others'] as const

export let currentChunkIntervalMs = CHUNK_INTERVAL_ACTIVE_MS

export function setChunkInterval(ms: number): void {
  currentChunkIntervalMs = ms
  restartChunkTimer()
}

function restartChunkTimer(): void {
  if (chunkTimer) clearInterval(chunkTimer)
  if (!isRecording) return
  chunkTimer = setInterval(() => {
    if (isPaused || isProcessing) return
    const hasData = audioBuffers[0].length > 0 || audioBuffers[1].length > 0
    if (hasData) processBufferedAudio()
  }, currentChunkIntervalMs)
}

export async function startRecording(
  options: { sttModel: string; deviceId?: string },
  onTranscript: TranscriptCallback,
  onStatus?: StatusCallback
): Promise<boolean> {
  if (isRecording) return false

  isRecording = true
  isPaused = false
  isProcessing = false
  autoPaused = false
  transcriptCallback = onTranscript
  statusCallback = onStatus || null
  audioBuffers[0].length = 0
  audioBuffers[1].length = 0
  recordingStartTime = Date.now()
  lastSpeechTime = Date.now()
  currentSTTModel = options.sttModel
  resetContext()

  try {
    customVocabulary = getSetting('custom-vocabulary') || ''
  } catch {
    customVocabulary = ''
  }

  if (currentSTTModel) {
    ensureVADModel().catch(err => console.warn('VAD model pre-load failed:', err.message))
  }

  consecutiveSilentChunks = 0
  currentChunkIntervalMs = CHUNK_INTERVAL_ACTIVE_MS
  chunkTimer = setInterval(() => {
    if (isPaused || isProcessing) return
    const hasData = audioBuffers[0].length > 0 || audioBuffers[1].length > 0
    if (hasData) processBufferedAudio()
  }, currentChunkIntervalMs)

  // Silence monitor: auto-pause when no speech detected for 30s
  silenceTimer = setInterval(() => {
    if (!isRecording || isPaused || autoPaused) return
    const silenceDuration = Date.now() - lastSpeechTime
    if (silenceDuration >= AUTO_PAUSE_SILENCE_MS) {
      autoPaused = true
      isPaused = true
      statusCallback?.({ state: 'auto-paused' })
    }
  }, 5000)

  return true
}

export function stopRecording(): any {
  if (!isRecording) return null

  isRecording = false
  isPaused = false
  autoPaused = false

  if (chunkTimer) {
    clearInterval(chunkTimer)
    chunkTimer = null
  }

  if (silenceTimer) {
    clearInterval(silenceTimer)
    silenceTimer = null
  }

  const hasData = (audioBuffers[0].length > 0 || audioBuffers[1].length > 0)
  if (hasData && !isProcessing) {
    processBufferedAudio()
  }

  transcriptCallback = null
  statusCallback = null
  const duration = Date.now() - recordingStartTime
  audioBuffers[0].length = 0
  audioBuffers[1].length = 0

  return { duration }
}

export function pauseRecording(): void {
  isPaused = true
}

export function resumeRecording(): void {
  isPaused = false
  autoPaused = false
  lastSpeechTime = Date.now()
}

export function processAudioChunk(pcmData: Float32Array, channel: number): boolean {
  if (!isRecording) return false

  const ch = channel === 1 ? 1 : 0
  if (autoPaused) {
    const energy = pcmData.reduce((sum, v) => sum + v * v, 0) / pcmData.length
    if (energy > 0.001) {
      autoPaused = false
      isPaused = false
      lastSpeechTime = Date.now()
      statusCallback?.({ state: 'auto-resumed' })
    } else {
      return false
    }
  }

  if (isPaused) return false

  audioBuffers[ch].push(pcmData)

  // Near real-time: schedule STT as soon as we have enough audio (don't wait for next timer)
  const totalSamples = audioBuffers[ch].reduce((sum, c) => sum + c.length, 0)
  if (!isProcessing && totalSamples >= MIN_SAMPLES_PER_CHANNEL) {
    setImmediate(() => processBufferedAudio())
  }

  return true
}

async function processBufferedAudio(): Promise<void> {
  if (!transcriptCallback) return
  if (isProcessing) return

  for (const channel of [0, 1]) {
    const chunks = audioBuffers[channel].splice(0)
    if (chunks.length === 0) continue

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    if (totalLength < MIN_SAMPLES_PER_CHANNEL) {
      audioBuffers[channel].push(...chunks)
      continue
    }

    isProcessing = true

    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    const elapsedSec = Math.floor((Date.now() - recordingStartTime) / 1000)
    const chunkStartSec = Math.max(0, elapsedSec - Math.floor(totalLength / SAMPLE_RATE))
    const speaker = SPEAKER_BY_CHANNEL[channel]

    try {
      if (!currentSTTModel) {
        isProcessing = false
        return
      }

      const energy = merged.reduce((sum, v) => sum + v * v, 0) / merged.length
      if (energy < 0.0001) {
        consecutiveSilentChunks++
        if (consecutiveSilentChunks >= 2 && currentChunkIntervalMs < CHUNK_INTERVAL_IDLE_MS) {
          currentChunkIntervalMs = CHUNK_INTERVAL_IDLE_MS
          restartChunkTimer()
        }
        isProcessing = false
        continue
      }

      let speechAudio = merged
      let hasSpeech = true
      try {
        const vadSegments = await runVAD(merged, SAMPLE_RATE)
        if (vadSegments.length === 0) {
          hasSpeech = false
          isProcessing = false
          continue
        }
        const totalSpeechDuration = vadSegments.reduce((sum, s) => sum + (s.end - s.start), 0)
        if (totalSpeechDuration < 0.5) {
          isProcessing = false
          continue
        }
        speechAudio = extractSpeechSegments(merged, vadSegments, SAMPLE_RATE)
      } catch (vadErr) {
        console.warn('VAD failed, processing full audio:', vadErr)
      }

      if (hasSpeech) {
        lastSpeechTime = Date.now()
        consecutiveSilentChunks = 0
        if (currentChunkIntervalMs > CHUNK_INTERVAL_ACTIVE_MS) {
          currentChunkIntervalMs = CHUNK_INTERVAL_ACTIVE_MS
          restartChunkTimer()
        }
      }

      const wavBuffer = pcmToWav(speechAudio, SAMPLE_RATE)
      let sttResult: STTResult
      if (currentSTTModel.startsWith('local:')) {
        sttResult = await processWithLocalSTT(wavBuffer, currentSTTModel.replace('local:', ''), customVocabulary)
      } else {
        const text = await routeSTT(wavBuffer, currentSTTModel)
        sttResult = { text, words: [] }
      }

      if (sttResult.text.trim()) {
        lastSpeechTime = Date.now()
        transcriptCallback({
          speaker,
          time: formatTimestamp(chunkStartSec),
          text: sttResult.text.trim(),
        })
      }
    } catch (err: any) {
      console.error('STT processing error:', err)
      if (transcriptCallback) {
        const msg = err?.message || String(err)
        const hint = currentSTTModel.startsWith('local:')
          ? ' Check that the model is downloaded in Settings > AI Models.'
          : msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('no api key')
            ? ' Add your API key in Settings > AI Models and connect the provider.'
            : ''
        transcriptCallback({
          speaker: 'System',
          time: formatTimestamp(elapsedSec),
          text: `[STT Error: ${msg}${hint}]`,
        })
      }
    }
    isProcessing = false
  }
}

function extractSpeechSegments(
  audio: Float32Array,
  segments: Array<{ start: number; end: number }>,
  sampleRate: number
): Float32Array {
  let totalSamples = 0
  for (const seg of segments) {
    const startSample = Math.floor(seg.start * sampleRate)
    const endSample = Math.min(Math.ceil(seg.end * sampleRate), audio.length)
    totalSamples += endSample - startSample
  }

  const result = new Float32Array(totalSamples)
  let writeOffset = 0
  for (const seg of segments) {
    const startSample = Math.floor(seg.start * sampleRate)
    const endSample = Math.min(Math.ceil(seg.end * sampleRate), audio.length)
    result.set(audio.subarray(startSample, endSample), writeOffset)
    writeOffset += endSample - startSample
  }
  return result
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function pcmToWav(pcm: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.length * (bitsPerSample / 8)
  const headerSize = 44

  const buffer = Buffer.alloc(headerSize + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]))
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
    buffer.writeInt16LE(Math.round(int16), headerSize + i * 2)
  }

  return buffer
}
