import { processWithLocalSTT, resetContext, type STTResult } from '../models/stt-engine'
import { routeSTT } from '../cloud/router'
import { sttSystemDarwin } from './stt-system-darwin'
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
let hasLoggedNoSTTModelThisSession = false
/** When true, do not run live STT during recording; run once on full buffer when recording stops. */
let deferTranscription = false

// Near real-time: process every 2.5s when active, 15s when idle; 1s minimum buffer for faster first result
const CHUNK_INTERVAL_ACTIVE_MS = 2500
const CHUNK_INTERVAL_IDLE_MS = 15000
const SAMPLE_RATE = 16000
// Auto-pause on silence disabled — user manually pauses and uses "Generate summary" button
const MIN_SAMPLES_PER_CHANNEL = 16000 * 1 // 1s minimum for STT (faster first result; APIs support short audio)
// Diarization is channel-based: channel 0 = mic (You), channel 1 = system audio (Others).
// When you're muted, mic may still send silence/comfort noise; we use stricter gates for "You" to avoid false labels.
const SPEAKER_BY_CHANNEL = ['You', 'Others'] as const
const MIN_ENERGY_BY_CHANNEL = [0.0004, 0.0001] as const   // You: stricter so muted mic doesn't produce segments
const MIN_SPEECH_ENERGY_BY_CHANNEL = [0.0012, 0.0004] as const
const MIN_SPEECH_DURATION_SEC_BY_CHANNEL = [0.8, 0.5] as const  // You: require clearer/longer speech

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

let meetingContextVocabulary: string[] = []
let meetingTitleForPrompt = ''
let sttVocabularyTerms: string[] = []

/** Build natural-sentence prompt for Whisper (proper nouns, domain terms). Max ~224 tokens (~800 chars). */
const WHISPER_PROMPT_MAX_CHARS = 800

function buildWhisperPrompt(title: string, vocabulary: string[]): string {
  const parts: string[] = []
  if (title?.trim()) parts.push(`${title.trim()} meeting.`)
  if (vocabulary.length > 0) {
    const terms = vocabulary.slice(0, 35).join(', ')
    parts.push(`Discussion about ${terms}.`)
  }
  const raw = parts.join(' ') || 'Meeting transcription.'
  return raw.length <= WHISPER_PROMPT_MAX_CHARS ? raw : raw.slice(0, WHISPER_PROMPT_MAX_CHARS).trim()
}

export async function startRecording(
  options: { sttModel: string; deviceId?: string; meetingTitle?: string; vocabulary?: string[] },
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
  hasLoggedNoSTTModelThisSession = false
  deferTranscription = getSetting('transcribe-when-stopped') === 'true'
  resetContext()

  // Merge vocabulary: settings + meeting title tokens + explicit vocabulary
  meetingTitleForPrompt = options.meetingTitle?.trim() || ''
  const titleTerms = meetingTitleForPrompt
    ? meetingTitleForPrompt.split(/\s+/).filter(w => w.length > 2)
    : []
  meetingContextVocabulary = [
    ...(options.vocabulary || []),
    ...titleTerms,
  ]

  try {
    const fromSettings = getSetting('custom-vocabulary') || ''
    const terms = [
      ...(typeof fromSettings === 'string' ? fromSettings.split(/[,\n]+/).map(t => t.trim()).filter(Boolean) : []),
      ...meetingContextVocabulary,
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 100)
    sttVocabularyTerms = terms
    // Natural-sentence prompt for Whisper (Granola/Notion quality)
    customVocabulary = buildWhisperPrompt(meetingTitleForPrompt, terms)
  } catch {
    sttVocabularyTerms = meetingContextVocabulary
    customVocabulary = buildWhisperPrompt(meetingTitleForPrompt, meetingContextVocabulary)
  }

  if (currentSTTModel) {
    ensureVADModel().catch(err => console.warn('VAD model pre-load failed:', err.message))
  }

  consecutiveSilentChunks = 0
  currentChunkIntervalMs = CHUNK_INTERVAL_ACTIVE_MS
  if (!deferTranscription) {
    chunkTimer = setInterval(() => {
      if (isPaused || isProcessing) return
      const hasData = audioBuffers[0].length > 0 || audioBuffers[1].length > 0
      if (hasData) processBufferedAudio()
    }, currentChunkIntervalMs)
  }

  // Silence-based auto-pause disabled — user triggers pause manually and uses "Generate summary" button

  return true
}

export async function stopRecording(): Promise<{ duration: number } | null> {
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
  // silenceTimer no longer used (auto-pause disabled)

  const hasData = (audioBuffers[0].length > 0 || audioBuffers[1].length > 0)
  if (deferTranscription && hasData && transcriptCallback) {
    statusCallback?.({ state: 'stt-processing' })
    await processBufferedAudio()
    statusCallback?.({ state: 'stt-idle' })
  } else if (hasData && !isProcessing) {
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

export function resumeRecording(options?: { sttModel?: string }): void {
  isPaused = false
  autoPaused = false
  lastSpeechTime = Date.now()
  if (options?.sttModel != null && options.sttModel !== currentSTTModel) {
    currentSTTModel = options.sttModel
  }
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

  // Near real-time: schedule STT as soon as we have enough audio (don't wait for next timer). Skip when transcribe-when-stopped.
  if (!deferTranscription) {
    const totalSamples = audioBuffers[ch].reduce((sum, c) => sum + c.length, 0)
    if (!isProcessing && totalSamples >= MIN_SAMPLES_PER_CHANNEL) {
      setImmediate(() => processBufferedAudio())
    }
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
    statusCallback?.({ state: 'stt-processing' })

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
        if (!hasLoggedNoSTTModelThisSession) {
          hasLoggedNoSTTModelThisSession = true
          console.warn('[capture] No STT model configured; transcript will be empty. Set Speech-to-Text model in Settings > AI Models.')
        }
        isProcessing = false
        statusCallback?.({ state: 'stt-idle' })
        return
      }

      const energy = merged.reduce((sum, v) => sum + v * v, 0) / merged.length
      const minEnergy = MIN_ENERGY_BY_CHANNEL[channel]
      if (energy < minEnergy) {
        consecutiveSilentChunks++
        if (consecutiveSilentChunks >= 2 && currentChunkIntervalMs < CHUNK_INTERVAL_IDLE_MS) {
          currentChunkIntervalMs = CHUNK_INTERVAL_IDLE_MS
          restartChunkTimer()
        }
        isProcessing = false
        statusCallback?.({ state: 'stt-idle' })
        continue
      }

      let speechAudio = merged
      let hasSpeech = true
      try {
        const vadSegments = await runVAD(merged, SAMPLE_RATE)
        if (vadSegments.length === 0) {
          hasSpeech = false
          isProcessing = false
          statusCallback?.({ state: 'stt-idle' })
          continue
        }
        const totalSpeechDuration = vadSegments.reduce((sum, s) => sum + (s.end - s.start), 0)
        const minSpeechSec = MIN_SPEECH_DURATION_SEC_BY_CHANNEL[channel]
        if (totalSpeechDuration < minSpeechSec) {
          isProcessing = false
          statusCallback?.({ state: 'stt-idle' })
          continue
        }
        speechAudio = extractSpeechSegments(merged, vadSegments, SAMPLE_RATE)
      } catch (vadErr) {
        console.warn('VAD failed, processing full audio:', vadErr)
      }

      // Skip STT on near-silence to avoid hallucinations (stricter for "You" when muted)
      const speechEnergy = speechAudio.reduce((sum, v) => sum + v * v, 0) / speechAudio.length
      const minSpeechEnergy = MIN_SPEECH_ENERGY_BY_CHANNEL[channel]
      if (speechEnergy < minSpeechEnergy) {
        isProcessing = false
        statusCallback?.({ state: 'stt-idle' })
        continue
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
      } else if (currentSTTModel.startsWith('system:')) {
        const text = await sttSystemDarwin(wavBuffer)
        sttResult = { text, words: [] }
      } else {
        // vocabulary: for Deepgram keywords; prompt: for Groq/OpenAI Whisper
        const vocab = sttVocabularyTerms.length > 0 ? sttVocabularyTerms : undefined
        const prompt = customVocabulary || undefined
        const text = await routeSTT(wavBuffer, currentSTTModel, vocab, prompt)
        sttResult = { text, words: [] }
      }

      const filtered = filterHallucinatedTranscript(sttResult.text)
      if (filtered) {
        lastSpeechTime = Date.now()
        transcriptCallback({
          speaker,
          time: formatTimestamp(chunkStartSec),
          text: filtered,
        })
      }
    } catch (err: any) {
      console.error('STT processing error:', err)
      if (transcriptCallback) {
        const msg = err?.message || String(err)
        let hint = ''
        if (currentSTTModel.startsWith('local:')) {
          const isMLX = currentSTTModel.includes('mlx')
          const isTheStage = currentSTTModel.includes('thestage')
          if (/ffmpeg|Errno 2.*file or directory/i.test(msg)) {
            hint = ' Install ffmpeg (e.g. brew install ffmpeg) and ensure it is in your PATH. MLX Whisper needs it to read audio.'
          } else if (isTheStage) {
            hint = ' For TheStage Whisper: install from Settings > AI Models (Download); macOS only. Requires Python 3 and thestage-speechkit.'
          } else if (isMLX || msg.includes('MLX') || msg.includes('mlx')) {
            hint = ' For MLX: ensure Python 3 and mlx-whisper are installed (pip3 install mlx-whisper); first run may take several minutes. To use another STT, select it in Settings > AI Models and start or resume recording.'
          } else {
            hint = ' For whisper.cpp: ensure the model is downloaded and whisper-cli is available in Settings > AI Models.'
          }
        } else if (currentSTTModel.startsWith('system:')) {
          hint = ' Grant Speech Recognition in System Settings > Privacy & Security, or try another STT model.'
        } else if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('no api key')) {
          hint = ' Add your API key in Settings > AI Models and connect the provider.'
        } else if (/certificate|issuer certificate|SSL|TLS|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) {
          hint = ' If you\'re on a corporate network or VPN, try another network or check proxy/certificate settings.'
        }
        transcriptCallback({
          speaker: 'System',
          time: formatTimestamp(elapsedSec),
          text: `[STT Error: ${msg}${hint}]`,
        })
        statusCallback?.({ state: 'stt-idle', error: msg })
      }
    }
    isProcessing = false
    statusCallback?.({ state: 'stt-idle' })
  }

  // Low-latency: if either channel still has enough samples, process again immediately
  const hasMore0 = audioBuffers[0].reduce((s, c) => s + c.length, 0) >= MIN_SAMPLES_PER_CHANNEL
  const hasMore1 = audioBuffers[1].reduce((s, c) => s + c.length, 0) >= MIN_SAMPLES_PER_CHANNEL
  if ((hasMore0 || hasMore1) && transcriptCallback) {
    setImmediate(() => processBufferedAudio())
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

/** Collapse repeated phrases to one occurrence so we keep content instead of dropping. */
function collapseRepetitions(text: string): string {
  let out = text.trim()
  // Sentence-level: drop duplicate consecutive sentences (keep first)
  const sentences = out.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  const seen = new Set<string>()
  const kept: string[] = []
  for (const s of sentences) {
    const norm = s.toLowerCase()
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      kept.push(s)
    }
  }
  out = kept.join(' ') || out
  // Phrase repetition: same 10+ char phrase 3+ times → keep once
  out = out.replace(/(.{10,}?)(\s+\1){2,}/g, '$1')
  return out.trim()
}

/** Capitalize first letter of each sentence and " i " → " I ". */
function normalizeSentenceCasing(text: string): string {
  const segments = text.split(/(?<=[.!?])\s+|\n+/)
  return segments
    .map((seg) => {
      const t = seg.trim()
      if (!t) return t
      const capped = t.charAt(0).toUpperCase() + t.slice(1)
      return capped.replace(/\s+i\s+/g, ' I ')
    })
    .filter(Boolean)
    .join(' ')
}

/** Filter known Whisper/STT hallucinations; collapse repetitions instead of dropping. */
function filterHallucinatedTranscript(text: string): string | null {
  const collapsed = collapseRepetitions(text)
  if (!collapsed) return null

  const lower = collapsed.toLowerCase()

  const hallucinationPatterns = [
    /thank\s+you\s+for\s+watching/i,
    /thanks\s+for\s+watching/i,
    /subscribe\s*(to\s+our\s+channel)?/i,
    /like\s+and\s+subscribe/i,
    /see\s+you\s+(in\s+the\s+)?next\s+/i,
    /don't\s+forget\s+to\s+subscribe/i,
    /hit\s+the\s+(bell|subscribe)\s+button/i,
    /^\[music\]$/i, /^\[applause\]$/i, /^\[blank_audio\]$/i,
    /^\(music\)$/i, /^\(applause\)$/i, /^\(laughter\)$/i,
  ]
  for (const pat of hallucinationPatterns) {
    if (pat.test(lower)) return null
  }

  // Entire segment is only repeated short phrase (2–4 words 3+ times)
  const words = collapsed.split(/\s+/)
  if (words.length >= 6) {
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= words.length - len * 3; i++) {
        const chunk = words.slice(i, i + len).join(' ').toLowerCase()
        const next1 = words.slice(i + len, i + len * 2).join(' ').toLowerCase()
        const next2 = words.slice(i + len * 2, i + len * 3).join(' ').toLowerCase()
        if (chunk === next1 && chunk === next2) return null
      }
    }
  }

  return normalizeSentenceCasing(collapsed)
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
