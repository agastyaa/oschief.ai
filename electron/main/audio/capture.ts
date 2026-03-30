import {
  processWithLocalSTT,
  resetContext,
  setPreviousContextForChannel,
  getPreviousContextForChannel,
  type STTResult,
} from '../models/stt-engine'
import { routeSTT, routeLLM } from '../cloud/router'
import { sttSystemDarwin } from './stt-system-darwin'
import { runVAD, ensureVADModel } from './vad'
import { getSetting } from '../storage/database'

export type TranscriptCallback = (chunk: { speaker: string; time: string; text: string; words?: { word: string; start: number; end: number }[] }) => void
export type CorrectionCallback = (chunk: { speaker: string; time: string; text: string; originalText: string }) => void
export type StatusCallback = (status: { state: string; error?: string }) => void

let isRecording = false
let isPaused = false
let transcriptCallback: TranscriptCallback | null = null
let correctionCallback: CorrectionCallback | null = null
let statusCallback: StatusCallback | null = null
const audioBuffers: Float32Array[][] = [[], []]
let recordingStartTime = 0
/** Wall-clock ms spent paused — excluded from transcript times and stop duration. */
let totalPausedMs = 0
let pauseStartedAt: number | null = null

function activeRecordingElapsedMs(): number {
  let paused = totalPausedMs
  if (isPaused && pauseStartedAt != null) {
    paused += Date.now() - pauseStartedAt
  }
  return Math.max(0, Date.now() - recordingStartTime - paused)
}
let chunkTimer: ReturnType<typeof setInterval> | null = null
let silenceTimer: ReturnType<typeof setInterval> | null = null
let currentSTTModel = ''
let customVocabulary = ''
let isProcessing = false
let isProcessingSince = 0  // timestamp when isProcessing was set true; 0 when idle
const MAX_PROCESSING_TIME_MS = 90_000  // 90s safety timeout to unstick isProcessing (MLX Whisper can take 30-60s on longer chunks)

function clearProcessingLock(notifyIdle = false): void {
  isProcessing = false
  isProcessingSince = 0
  if (notifyIdle) statusCallback?.({ state: 'stt-idle' })
}
let lastSpeechTime = 0
let autoPaused = false
let consecutiveSilentChunks: [number, number] = [0, 0]
let hasLoggedNoSTTModelThisSession = false
/** When true, do not run live STT during recording; run once on full buffer when recording stops. */
let deferTranscription = false
/** LLM post-processing: background correction queue */
let llmPostProcessEnabled = false
const correctionQueue: Array<{ speaker: string; time: string; text: string }> = []
let isCorrecting = false
const CORRECTION_QUEUE_MAX = 20
const CORRECTION_TIMEOUT_MS = 15000
const CLOUD_STT_TIMEOUT_MS = 30000  // 30s timeout for cloud STT to prevent hung requests blocking pipeline
let consecutiveEmptyCloudResults = 0
const MAX_SILENT_EMPTY_RESULTS = 4  // After this many consecutive empties, warn the user
/** Per-channel retry counts — drop audio after MAX_CHUNK_RETRIES to prevent infinite loops. */
const chunkRetryCount = [0, 0]
const MAX_CHUNK_RETRIES = 3
// Local STT error backoff: after repeated failures, pause before retrying to avoid error spam
let consecutiveLocalSTTErrors = 0
const MAX_LOCAL_ERRORS_BEFORE_BACKOFF = 3
const MAX_LOCAL_ERRORS_BEFORE_BACKOFF_MLX = 4  // MLX first run can timeout while loading model
const LOCAL_ERROR_BACKOFF_MS = 30000  // 30s cooldown
let localSTTBackoffUntil = 0
let autoRepairInProgress = false
/** Sliding window of recently corrected segments for LLM context continuity. */
const recentCorrectedSegments: string[] = []
const MAX_RECENT_CONTEXT = 3

/** Word-overlap (Jaccard) similarity between two normalized strings. Returns 0–1. */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter(Boolean))
  const wordsB = new Set(b.split(' ').filter(Boolean))
  if (wordsA.size === 0 && wordsB.size === 0) return 1
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let intersection = 0
  for (const w of wordsA) if (wordsB.has(w)) intersection++
  return intersection / (wordsA.size + wordsB.size - intersection)
}

/** Recent emitted transcripts for cross-channel deduplication. */
const recentEmittedTexts: Array<{ text: string; time: number; channel: number }> = []
const DEDUP_WINDOW_MS_DEFAULT = 15000 // 15s window — if same/similar text was emitted recently, skip (up from 12s)
const FUZZY_DEDUP_THRESHOLD_DEFAULT = 0.65 // Jaccard word-overlap threshold for cross-channel echo suppression (tightened from 0.75)

/** Recent emitted sentences for inter-chunk sentence-level dedup (prevents cross-chunk sentence repetition). */
const recentEmittedSentences: Array<{ norm: string; time: number }> = []
const SENTENCE_DEDUP_WINDOW_MS = 30000 // 30s — sentences older than this are pruned

// Near real-time: process every 6s when active (up from 4s — longer context = better WER), 15s when idle
const CHUNK_INTERVAL_ACTIVE_MS = 6000
const CHUNK_INTERVAL_IDLE_MS = 15000
const SAMPLE_RATE = 16000
// Auto-pause on silence disabled — user manually pauses and uses "Generate summary" button
const MIN_SAMPLES_PER_CHANNEL = 16000 * 1.5 // 1.5s minimum for STT (balance: enough context vs fast first result)
const EARLY_TRIGGER_SAMPLES = 16000 * 4  // 4s: slightly longer for better context (~5-6s total latency)
const MAX_BUFFER_SAMPLES = SAMPLE_RATE * 60  // 60s cap per channel — prevents OOM on very long recordings
// Overlapping chunks: keep last 2s of audio from previous chunk as context for the next one.
// This gives the STT model continuity across chunk boundaries — dramatically improves WER at word boundaries.
const OVERLAP_SAMPLES = SAMPLE_RATE * 2  // 2s = 32,000 samples
const previousAudioTail: [Float32Array | null, Float32Array | null] = [null, null]
// Per-channel word tail: last emitted text, used to strip re-transcribed overlap from next chunk
const previousEmittedTail: [string, string] = ['', '']
const OVERLAP_WORD_MATCH_MIN = 2   // min words that must match to trim (lowered from 4 to catch shorter overlaps at chunk boundaries)
const OVERLAP_WORD_MATCH_MAX = 25  // max words to look back in previous tail
// Diarization is channel-based: channel 0 = mic (You), channel 1 = system audio (Others).
// When you're muted, mic may still send silence/comfort noise; we use stricter gates for "You" to avoid false labels.
const SPEAKER_BY_CHANNEL = ['You', 'Others'] as const
const MIN_ENERGY_BY_CHANNEL = [0.0002, 0.00002] as const   // You: relaxed to catch softer speech; Others: lowered further for system audio (YouTube, calls)
const MIN_SPEECH_ENERGY_BY_CHANNEL = [0.0006, 0.0001] as const  // You: halved; Others: halved again — system audio energy is lower than mic
// You: lowered so short replies ("yes", "got it") aren't dropped
const MIN_SPEECH_DURATION_SEC_BY_CHANNEL = [0.35, 0.5] as const

/** When true (Settings → stt-capture-sensitivity=sensitive), relax energy gates and dedup slightly. */
let sttCaptureSensitivityRelaxed = false

function refreshSttCaptureSensitivity(): void {
  sttCaptureSensitivityRelaxed = getSetting('stt-capture-sensitivity') === 'sensitive'
}

function effectiveMinEnergy(channel: 0 | 1): number {
  const base = MIN_ENERGY_BY_CHANNEL[channel]
  return sttCaptureSensitivityRelaxed ? base * 0.62 : base
}

function effectiveMinSpeechEnergy(channel: 0 | 1): number {
  const base = MIN_SPEECH_ENERGY_BY_CHANNEL[channel]
  return sttCaptureSensitivityRelaxed ? base * 0.7 : base
}

function effectiveDedupWindowMs(): number {
  return sttCaptureSensitivityRelaxed ? 9000 : DEDUP_WINDOW_MS_DEFAULT
}

function effectiveFuzzyDedupThreshold(): number {
  return sttCaptureSensitivityRelaxed ? 0.68 : FUZZY_DEDUP_THRESHOLD_DEFAULT
}

/**
 * After pause→resume, the worklet reconnects; first buffers are often noise/underrun.
 * Whisper then emits generic "meeting filler" text. For the next N STT passes per channel,
 * require stronger speech energy and slightly longer VAD segments before calling the model.
 */
let resumeStrictPassCountdown: [number, number] = [0, 0]
const RESUME_STRICT_PASSES_PER_CHANNEL = 1
const RESUME_STRICT_SPEECH_ENERGY_MULT = 1.1   // lowered from 1.3 — context reset on resume reduces hallucination risk
const RESUME_STRICT_MIN_SPEECH_SEC_MULT = 1.05  // lowered from 1.15

/** Log mic-channel skip reasons when SYAG_DEBUG_AUDIO=1 or setting debug-audio-capture=true (see docs/transcript-me-them.md). */
function isDebugAudioCapture(): boolean {
  try {
    const e = process.env.SYAG_DEBUG_AUDIO
    if (e === '1' || e === 'true') return true
  } catch {
    /* no process.env in some test contexts */
  }
  return getSetting('debug-audio-capture') === 'true'
}

function logMicCaptureDebug(reason: string, detail: Record<string, string | number | boolean | undefined> = {}) {
  if (!isDebugAudioCapture()) return
  console.log('[capture-debug] mic(ch0)', reason, detail)
}

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
  // Accent-aware priming: helps Whisper adapt to diverse English accents
  parts.push('Speakers may have Indian, British, or other non-American English accents.')
  if (title?.trim()) parts.push(`${title.trim()} meeting.`)
  if (vocabulary.length > 0) {
    const terms = vocabulary.slice(0, 35).join(', ')
    parts.push(`Discussion about ${terms}.`)
  }
  const raw = parts.join(' ')
  return raw.length <= WHISPER_PROMPT_MAX_CHARS ? raw : raw.slice(0, WHISPER_PROMPT_MAX_CHARS).trim()
}

export async function startRecording(
  options: { sttModel: string; deviceId?: string; meetingTitle?: string; vocabulary?: string[] },
  onTranscript: TranscriptCallback,
  onStatus?: StatusCallback,
  onCorrectedTranscript?: CorrectionCallback
): Promise<boolean> {
  if (isRecording) return false

  isRecording = true
  isPaused = false
  clearProcessingLock()
  autoPaused = false
  transcriptCallback = onTranscript
  correctionCallback = onCorrectedTranscript || null
  statusCallback = onStatus || null
  llmPostProcessEnabled = getSetting('llm-post-process-transcript') === 'true'
  correctionQueue.length = 0
  isCorrecting = false
  recentCorrectedSegments.length = 0
  consecutiveEmptyCloudResults = 0
  consecutiveLocalSTTErrors = 0
  localSTTBackoffUntil = 0
  autoRepairInProgress = false
  recentEmittedTexts.length = 0
  audioBuffers[0].length = 0
  audioBuffers[1].length = 0
  chunkRetryCount[0] = 0
  chunkRetryCount[1] = 0
  totalPausedMs = 0
  pauseStartedAt = null
  recordingStartTime = Date.now()
  lastSpeechTime = Date.now()
  currentSTTModel = options.sttModel
  hasLoggedNoSTTModelThisSession = false
  deferTranscription = getSetting('transcribe-when-stopped') === 'true'
  refreshSttCaptureSensitivity()
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

  consecutiveSilentChunks = [0, 0]
  resumeStrictPassCountdown = [0, 0]
  currentChunkIntervalMs = CHUNK_INTERVAL_ACTIVE_MS
  if (!deferTranscription) {
    chunkTimer = setInterval(() => {
      if (isPaused || isProcessing) return
      const hasData = audioBuffers[0].length > 0 || audioBuffers[1].length > 0
      if (hasData) processBufferedAudio()
    }, currentChunkIntervalMs)
    // Process the first chunk earlier (2s) so nothing is missed at the start
    setTimeout(() => {
      if (!isPaused && !isProcessing && isRecording) {
        const hasData = audioBuffers[0].length > 0 || audioBuffers[1].length > 0
        if (hasData) processBufferedAudio()
      }
    }, 2000)
  }

  // Silence-based auto-pause disabled — user triggers pause manually and uses "Generate summary" button

  return true
}

export async function stopRecording(): Promise<{ duration: number } | null> {
  if (!isRecording) return null

  if (pauseStartedAt != null) {
    totalPausedMs += Date.now() - pauseStartedAt
    pauseStartedAt = null
  }

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

  // Drain remaining corrections before clearing callbacks
  if (llmPostProcessEnabled && correctionQueue.length > 0) {
    await drainCorrectionQueue()
  }

  transcriptCallback = null
  correctionCallback = null
  statusCallback = null
  correctionQueue.length = 0
  isCorrecting = false
  const duration = activeRecordingElapsedMs()
  totalPausedMs = 0
  pauseStartedAt = null
  audioBuffers[0].length = 0
  audioBuffers[1].length = 0

  return { duration }
}

export function pauseRecording(): void {
  if (!isPaused) {
    pauseStartedAt = Date.now()
  }
  isPaused = true
}

export function resumeRecording(options?: { sttModel?: string }): void {
  if (pauseStartedAt != null) {
    totalPausedMs += Date.now() - pauseStartedAt
    pauseStartedAt = null
  }
  isPaused = false
  autoPaused = false
  lastSpeechTime = Date.now()
  refreshSttCaptureSensitivity()
  // Clear any existing timers to prevent accumulation across pause/resume cycles
  if (chunkTimer) { clearInterval(chunkTimer); chunkTimer = null }
  if (silenceTimer) { clearInterval(silenceTimer); silenceTimer = null }
  // Restart chunk timer with active interval
  currentChunkIntervalMs = CHUNK_INTERVAL_ACTIVE_MS
  restartChunkTimer()
  // Clear stale dedup window — after a long pause, old entries would cause
  // false-positive dedup matches against new speech
  recentEmittedTexts.length = 0
  // Clear stale Whisper context — after a pause, old text causes hallucinated continuations
  resetContext()
  // Clear overlap tails — stale overlap from pre-pause audio would cause false trimming
  previousEmittedTail[0] = ''
  previousEmittedTail[1] = ''
  previousAudioTail[0] = null
  previousAudioTail[1] = null
  recentEmittedSentences.length = 0
  resumeStrictPassCountdown = [RESUME_STRICT_PASSES_PER_CHANNEL, RESUME_STRICT_PASSES_PER_CHANNEL]
  if (options?.sttModel != null && options.sttModel !== currentSTTModel) {
    currentSTTModel = options.sttModel
  }
  // Process first post-resume chunk early (2s) so nothing is missed
  setTimeout(() => {
    if (!isPaused && !isProcessing && isRecording) {
      const hasData = audioBuffers[0].length > 0 || audioBuffers[1].length > 0
      if (hasData) processBufferedAudio()
    }
  }, 2000)
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

  // Cap buffer to prevent OOM on very long recordings
  while (audioBuffers[ch].reduce((sum, c) => sum + c.length, 0) > MAX_BUFFER_SAMPLES) {
    audioBuffers[ch].shift()
  }

  // Near real-time: schedule STT as soon as we have enough audio (don't wait for next timer). Skip when transcribe-when-stopped.
  if (!deferTranscription) {
    const totalSamples = audioBuffers[ch].reduce((sum, c) => sum + c.length, 0)
    if (!isProcessing && totalSamples >= EARLY_TRIGGER_SAMPLES) {
      setImmediate(() => processBufferedAudio())
    }
  }

  return true
}

async function processBufferedAudio(): Promise<void> {
  if (!transcriptCallback) return
  if (isProcessing) {
    // Safety: if isProcessing has been stuck for over 2 minutes, force-reset it
    if (isProcessingSince > 0 && Date.now() - isProcessingSince > MAX_PROCESSING_TIME_MS) {
      console.warn('[capture] isProcessing stuck for', Math.round((Date.now() - isProcessingSince) / 1000), 's — force-resetting')
      isProcessing = false
      isProcessingSince = 0
    } else {
      return
    }
  }
  if (isPaused) return

  for (const channel of [0, 1]) {
    if (audioBuffers[channel].length === 0) continue

    if (audioBuffers[channel].reduce((sum, c) => sum + c.length, 0) < MIN_SAMPLES_PER_CHANNEL) continue

    // Yield to event loop between channels so UI stays responsive during STT
    if (channel === 1) await new Promise(r => setImmediate(r))

    // Snapshot chunks THEN compute totalLength from the snapshot (not the live buffer)
    // to prevent size mismatch if new chunks arrive between snapshot and merge
    const chunkCount = audioBuffers[channel].length
    const chunks = audioBuffers[channel].slice(0, chunkCount)
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)

    isProcessing = true
    isProcessingSince = Date.now()
    statusCallback?.({ state: 'stt-processing' })

    try {
    // Prepend overlap tail from previous chunk (2s of prior audio for context continuity)
    const tail = previousAudioTail[channel]
    const overlapLength = tail ? tail.length : 0
    const merged = new Float32Array(overlapLength + totalLength)
    if (tail) merged.set(tail, 0)
    let offset = overlapLength
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    const elapsedSec = Math.floor(activeRecordingElapsedMs() / 1000)
    const chunkStartSec = Math.max(0, elapsedSec - Math.floor(totalLength / SAMPLE_RATE))
    const speaker = SPEAKER_BY_CHANNEL[channel]
      if (!currentSTTModel) {
        if (!hasLoggedNoSTTModelThisSession) {
          hasLoggedNoSTTModelThisSession = true
          console.warn('[capture] No STT model configured; transcript will be empty. Set Speech-to-Text model in Settings > AI Models.')
        }
        audioBuffers[channel].splice(0, chunkCount)
        clearProcessingLock(true)
        return
      }

      // Backoff: skip processing if local STT is in cooldown after repeated failures
      if (currentSTTModel.startsWith('local:') && Date.now() < localSTTBackoffUntil) {
        console.log('[capture] Skipping local STT (backoff until', new Date(localSTTBackoffUntil).toISOString(), ')')
        if (channel === 0) logMicCaptureDebug('skip_local_stt_backoff', { until: localSTTBackoffUntil })
        // Lock cleared after loop at line 827
        continue
      }

      const energy = merged.reduce((sum, v) => sum + v * v, 0) / merged.length
      const minEnergy = effectiveMinEnergy(channel as 0 | 1)
      if (energy < minEnergy) {
        if (currentSTTModel.startsWith('local:')) console.log('[capture] Skip (buffer energy', energy.toFixed(6), '<', minEnergy, ') channel:', channel)
        audioBuffers[channel].splice(0, chunkCount)
        if (channel === 0) logMicCaptureDebug('skip_buffer_energy', { energy: energy, minEnergy, samples: merged.length })
        else console.log(`[capture] ch1 skip: buffer energy ${energy.toFixed(6)} < ${minEnergy}`)
        consecutiveSilentChunks[channel as 0 | 1]++
        // Switch to idle interval only when BOTH channels are silent
        const bothSilent = consecutiveSilentChunks[0] >= 4 && consecutiveSilentChunks[1] >= 4
        if (bothSilent && currentChunkIntervalMs < CHUNK_INTERVAL_IDLE_MS) {
          currentChunkIntervalMs = CHUNK_INTERVAL_IDLE_MS
          restartChunkTimer()
        }
        // After extended silence on BOTH channels (~3 min), force back to active interval
        if (consecutiveSilentChunks[0] >= 12 && consecutiveSilentChunks[1] >= 12) {
          consecutiveSilentChunks = [0, 0]
          if (currentChunkIntervalMs > CHUNK_INTERVAL_ACTIVE_MS) {
            currentChunkIntervalMs = CHUNK_INTERVAL_ACTIVE_MS
            restartChunkTimer()
          }
        }
        // Lock cleared after loop at line 827
        continue
      }

      // Energy gate passed — audio is not silent. Reset THIS channel's silence counter.
      if (consecutiveSilentChunks[channel as 0 | 1] > 0) {
        consecutiveSilentChunks[channel as 0 | 1] = 0
        // If either channel has speech, stay on active interval
        if (currentChunkIntervalMs > CHUNK_INTERVAL_ACTIVE_MS) {
          currentChunkIntervalMs = CHUNK_INTERVAL_ACTIVE_MS
          restartChunkTimer()
        }
      }

      let speechAudio = merged
      let hasSpeech = true
      try {
        // Adaptive VAD: find the quietest 0.5s window in the buffer as ambient baseline
        const windowLen = Math.min(Math.floor(SAMPLE_RATE / 2), merged.length)
        const stepSize = Math.max(1, Math.floor(windowLen / 4))
        let minWindowEnergy = Infinity
        for (let wi = 0; wi + windowLen <= merged.length; wi += stepSize) {
          const win = merged.subarray(wi, wi + windowLen)
          const winEnergy = win.reduce((s, v) => s + v * v, 0) / win.length
          if (winEnergy < minWindowEnergy) minWindowEnergy = winEnergy
        }
        const ambientEnergy = minWindowEnergy === Infinity ? 0 : minWindowEnergy
        // VAD thresholds: lowered for system audio (YouTube, calls have different energy profile than mic)
        const vadThreshold = channel === 0
          ? Math.max(0.40, Math.min(0.60, 0.45 + ambientEnergy * 100))
          : Math.max(0.30, Math.min(0.50, 0.35 + ambientEnergy * 100))

        const vadSegments = await Promise.race([
          runVAD(merged, SAMPLE_RATE, { threshold: vadThreshold }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('VAD timeout (10s)')), 10000)),
        ])
        if (vadSegments.length === 0) {
          hasSpeech = false
          if (currentSTTModel.startsWith('local:')) console.log('[capture] Skip (VAD: no segments) channel:', channel)
          audioBuffers[channel].splice(0, chunkCount)
          if (channel === 0) logMicCaptureDebug('skip_vad_no_segments', { vadThreshold, ambientEnergy })
          else console.log(`[capture] ch1 skip: VAD no segments (threshold=${vadThreshold.toFixed(2)}, ambient=${ambientEnergy.toFixed(6)})`)
          // Lock cleared after loop at line 827
          continue
        }
        const totalSpeechDuration = vadSegments.reduce((sum, s) => sum + (s.end - s.start), 0)
        const chIdx = channel as 0 | 1
        const useResumeStrict = resumeStrictPassCountdown[chIdx] > 0
        let minSpeechSec = MIN_SPEECH_DURATION_SEC_BY_CHANNEL[channel]
        if (useResumeStrict) minSpeechSec *= RESUME_STRICT_MIN_SPEECH_SEC_MULT
        if (totalSpeechDuration < minSpeechSec) {
          if (currentSTTModel.startsWith('local:')) console.log('[capture] Skip (VAD: speech duration', totalSpeechDuration.toFixed(1), '<', minSpeechSec, 's) channel:', channel)
          audioBuffers[channel].splice(0, chunkCount)
          if (channel === 0) logMicCaptureDebug('skip_vad_short_duration', { totalSpeechDuration, minSpeechSec })
          else console.log(`[capture] ch1 skip: VAD short duration ${totalSpeechDuration.toFixed(1)}s < ${minSpeechSec}s`)
          // Lock cleared after loop at line 827
          continue
        }
        speechAudio = extractSpeechSegments(merged, vadSegments, SAMPLE_RATE)
      } catch (vadErr) {
        console.warn('VAD failed, processing full audio:', vadErr)
      }

      // Skip STT on near-silence to avoid hallucinations (stricter for "You" when muted)
      const speechEnergy = speechAudio.reduce((sum, v) => sum + v * v, 0) / speechAudio.length
      const chIdxForEnergy = channel as 0 | 1
      const resumeStrictEnergy = resumeStrictPassCountdown[chIdxForEnergy] > 0
      let minSpeechEnergy = effectiveMinSpeechEnergy(chIdxForEnergy)
      if (resumeStrictEnergy) minSpeechEnergy *= RESUME_STRICT_SPEECH_ENERGY_MULT
      if (speechEnergy < minSpeechEnergy) {
        if (currentSTTModel.startsWith('local:')) console.log('[capture] Skip (speech energy', speechEnergy.toFixed(6), '<', minSpeechEnergy, ') channel:', channel)
        audioBuffers[channel].splice(0, chunkCount)
        if (channel === 0) logMicCaptureDebug('skip_speech_energy', { speechEnergy, minSpeechEnergy })
        else console.log(`[capture] ch1 skip: speech energy ${speechEnergy.toFixed(6)} < ${minSpeechEnergy}`)
        // Lock cleared after loop at line 827
        continue
      }

      if (hasSpeech) {
        lastSpeechTime = Date.now()
        consecutiveSilentChunks[channel as 0 | 1] = 0
        if (currentChunkIntervalMs > CHUNK_INTERVAL_ACTIVE_MS) {
          currentChunkIntervalMs = CHUNK_INTERVAL_ACTIVE_MS
          restartChunkTimer()
        }
      }

      if (resumeStrictPassCountdown[chIdxForEnergy] > 0) {
        resumeStrictPassCountdown[chIdxForEnergy]--
        if (channel === 0) logMicCaptureDebug('resume_strict_pass_used', { remaining: resumeStrictPassCountdown[0] })
      }

      const wavBuffer = pcmToWav(speechAudio, SAMPLE_RATE)
      let sttResult: STTResult
      if (currentSTTModel.startsWith('local:')) {
        console.log('[capture] Running local STT:', currentSTTModel, 'channel:', channel, 'samples:', speechAudio.length)
        sttResult = await processWithLocalSTT(
          wavBuffer,
          currentSTTModel.replace('local:', ''),
          customVocabulary,
          channel as 0 | 1
        )
      } else if (currentSTTModel.startsWith('system:')) {
        const text = await sttSystemDarwin(wavBuffer)
        sttResult = { text, words: [] }
      } else {
        // vocabulary: for Deepgram keywords; prompt: for Groq/OpenAI Whisper
        const vocab = sttVocabularyTerms.length > 0 ? sttVocabularyTerms : undefined
        const prevSame = getPreviousContextForChannel(channel as 0 | 1)
        const prompt =
          [customVocabulary, prevSame ? `Same speaker may continue: ${prevSame}` : '']
            .filter(Boolean)
            .join(' ')
            .slice(0, 800) || undefined
        // Timeout prevents a hung API call from blocking the entire pipeline
        const text = await Promise.race([
          routeSTT(wavBuffer, currentSTTModel, vocab, prompt),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Cloud STT timed out after 30s')), CLOUD_STT_TIMEOUT_MS)
          ),
        ])
        sttResult = { text, words: [] }
        // Track consecutive empty results from cloud STT
        if (!text.trim()) {
          consecutiveEmptyCloudResults++
          if (consecutiveEmptyCloudResults >= MAX_SILENT_EMPTY_RESULTS && transcriptCallback) {
            transcriptCallback({
              speaker: 'System',
              time: formatTimestamp(chunkStartSec),
              text: `[STT: No speech detected in ${consecutiveEmptyCloudResults} consecutive chunks. Check audio input or try another STT model.]`,
            })
            consecutiveEmptyCloudResults = 0  // Reset so we don't spam
          }
        } else {
          consecutiveEmptyCloudResults = 0
        }
      }

      // Confidence-based filtering: skip low-confidence segments (likely noise/hallucination)
      if (sttResult.avgConfidence != null && sttResult.avgConfidence < -3.0) {
        audioBuffers[channel].splice(0, chunkCount)
        chunkRetryCount[channel] = 0
        if (channel === 0) logMicCaptureDebug('skip_low_confidence', { avgConfidence: sttResult.avgConfidence })
        else console.log(`[capture] ch1 skip: low confidence ${sttResult.avgConfidence}`)
        // Lock cleared after loop at line 827
        continue
      }

      const filtered = filterHallucinatedTranscript(sttResult.text)
      if (filtered) {
        // Strip re-transcribed overlap from previous chunk (Whisper overlap-context artifact)
        let deoverlapped = trimOverlapTail(previousEmittedTail[channel], filtered)
        if (!deoverlapped) {
          // Entire chunk was re-transcribed overlap — discard
          audioBuffers[channel].splice(0, chunkCount)
          chunkRetryCount[channel] = 0
          logMicCaptureDebug('skip_full_overlap', { preview: filtered.slice(0, 80) })
          if (channel === 1) console.log(`[capture] ch1 skip: full overlap`)
          // Lock cleared after loop at line 827
          continue
        }
        // Fuzzy boundary dedup: catch 2-3 word near-duplicates at chunk edges missed by trimOverlapTail
        deoverlapped = trimFuzzyBoundaryOverlap(previousEmittedTail[channel], deoverlapped)
        // Inter-chunk sentence dedup: strip sentences already emitted in the last 30s
        deoverlapped = deduplicateSentencesAcrossChunks(deoverlapped)
        if (!deoverlapped.trim()) {
          audioBuffers[channel].splice(0, chunkCount)
          chunkRetryCount[channel] = 0
          if (channel === 1) console.log(`[capture] ch1 skip: sentence dedup emptied text`)
          // Lock cleared after loop at line 827
          continue
        }

        // Cross-channel dedup: skip if same/very similar text was emitted recently
        const now = Date.now()
        const filteredNorm = deoverlapped.toLowerCase().replace(/[,.\-!?\s]+/g, ' ').trim()
        // Prune old entries
        while (recentEmittedTexts.length > 0 && now - recentEmittedTexts[0].time > effectiveDedupWindowMs()) {
          recentEmittedTexts.shift()
        }
        const isDuplicate = recentEmittedTexts.some(entry => {
          if (entry.text === filteredNorm) return true
          // Substring check: only for texts with >= 5 words to avoid false positives on short phrases like "okay"
          const shorter = entry.text.length < filteredNorm.length ? entry.text : filteredNorm
          if (shorter.split(' ').length >= 5 && (filteredNorm.includes(entry.text) || entry.text.includes(filteredNorm))) return true
          // Fuzzy match: strict threshold for same-channel (0.85), relaxed for cross-channel echo
          const threshold = entry.channel !== channel ? effectiveFuzzyDedupThreshold() : 0.85
          if (textSimilarity(entry.text, filteredNorm) > threshold) return true
          return false
        })
        if (isDuplicate) {
          audioBuffers[channel].splice(0, chunkCount)
          chunkRetryCount[channel] = 0
          if (channel === 0) logMicCaptureDebug('skip_cross_channel_dedup', { preview: filteredNorm.slice(0, 80) })
          else console.log(`[capture] ch1 skip: cross-channel dedup "${filteredNorm.slice(0, 60)}"`)
          // Lock cleared after loop at line 827
          continue
        }
        recentEmittedTexts.push({ text: filteredNorm, time: now, channel })
        if (recentEmittedTexts.length > 100) recentEmittedTexts.splice(0, recentEmittedTexts.length - 100)

        lastSpeechTime = Date.now()
        const time = formatTimestamp(chunkStartSec)
        transcriptCallback({ speaker, time, text: deoverlapped, words: sttResult.words?.length ? sttResult.words : undefined })
        previousEmittedTail[channel] = deoverlapped
        setPreviousContextForChannel(channel as 0 | 1, deoverlapped)
        // Save last 2s of audio as overlap context for next chunk (improves WER at boundaries)
        const mergedForTail = new Float32Array(totalLength)
        let tailOffset = 0
        for (const c of chunks) { mergedForTail.set(c, tailOffset); tailOffset += c.length }
        if (mergedForTail.length > OVERLAP_SAMPLES) {
          previousAudioTail[channel] = mergedForTail.slice(-OVERLAP_SAMPLES)
        } else {
          previousAudioTail[channel] = mergedForTail.slice()
        }
        // Success — remove processed audio from buffer and reset retry counter
        audioBuffers[channel].splice(0, chunkCount)
        chunkRetryCount[channel] = 0
        if (currentSTTModel.startsWith('local:')) consecutiveLocalSTTErrors = 0
        // Queue for LLM correction in background
        if (llmPostProcessEnabled && correctionCallback) {
          enqueueCorrection({ speaker, time, text: filtered })
        }
      } else {
        // STT succeeded but produced no useful text — drain buffer
        audioBuffers[channel].splice(0, chunkCount)
        chunkRetryCount[channel] = 0
      }
    } catch (err: any) {
      console.error('STT processing error:', err)
      const msg = err?.message || String(err)

      // Short/invalid audio errors are data-quality issues, not model failures — don't count toward backoff
      const isAudioDataError = /invalidAudioData|Audio too short|too short for Parakeet/i.test(msg)
      if (isAudioDataError) {
        console.warn(`[capture] Audio data error (not counting toward backoff): ${msg.slice(0, 120)}`)
        audioBuffers[channel].splice(0, chunkCount)
        chunkRetryCount[channel] = 0
        // Lock cleared after loop at line 827
        continue
      }

      // Retry logic: keep audio in buffer for retry, but drop after MAX_CHUNK_RETRIES
      chunkRetryCount[channel]++
      if (chunkRetryCount[channel] >= MAX_CHUNK_RETRIES) {
        console.warn(`[capture] Dropping audio for channel ${channel} after ${MAX_CHUNK_RETRIES} retries`)
        audioBuffers[channel].splice(0, chunkCount)
        chunkRetryCount[channel] = 0
      }

      // Track consecutive local STT failures for backoff
      if (currentSTTModel.startsWith('local:')) {
        consecutiveLocalSTTErrors++
        const backoffThreshold = currentSTTModel.includes('mlx') ? MAX_LOCAL_ERRORS_BEFORE_BACKOFF_MLX : MAX_LOCAL_ERRORS_BEFORE_BACKOFF
        if (consecutiveLocalSTTErrors >= backoffThreshold) {
          localSTTBackoffUntil = Date.now() + LOCAL_ERROR_BACKOFF_MS
          if (transcriptCallback) {
            transcriptCallback({
              speaker: 'System',
              time: formatTimestamp(elapsedSec),
              text: `[STT paused: ${consecutiveLocalSTTErrors} consecutive errors. Retrying in 30s. Check Settings > AI Models or try another STT model.]`,
            })
          }
          // Attempt auto-repair for MLX models
          if (currentSTTModel.includes('mlx') && !autoRepairInProgress) {
            autoRepairInProgress = true
            import('../models/stt-engine').then(({ repairMLXWhisper, repairMLXWhisper8Bit }) => {
              const repairFn = currentSTTModel.includes('8bit') ? repairMLXWhisper8Bit : repairMLXWhisper
              repairFn().then(({ ok }) => {
                autoRepairInProgress = false
                if (ok) {
                  localSTTBackoffUntil = 0
                  consecutiveLocalSTTErrors = 0
                  transcriptCallback?.({ speaker: 'System', time: formatTimestamp(elapsedSec), text: '[STT repaired automatically. Resuming transcription.]' })
                }
              }).catch(() => { autoRepairInProgress = false })
            }).catch(() => { autoRepairInProgress = false })
          }
          consecutiveLocalSTTErrors = 0
        }
      }

      if (transcriptCallback) {
        let hint = ''
        if (currentSTTModel.startsWith('local:')) {
          const isMLX = currentSTTModel.includes('mlx')
          if (/ffmpeg|Errno 2.*file or directory/i.test(msg)) {
            hint = ' Install ffmpeg (e.g. brew install ffmpeg) and ensure it is in your PATH. MLX Whisper needs it to read audio.'
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
  }
  clearProcessingLock(true)

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

/**
 * Normalize a token for duplicate detection (handles "are," vs "are", "it's" intact).
 */
function tokenCompareKey(token: string): string {
  return token
    .toLowerCase()
    .replace(/^['"([{]+/g, '')
    .replace(/['"})\].,!?;:]+$/g, '')
    .trim()
}

/**
 * Collapse consecutive duplicate tokens — fixes paired stutter from cloud STT (e.g. Deepgram
 * "are are", "that that") that regex (1) below misses (it needs 3+ repeats).
 */
function collapseAdjacentDuplicateTokens(text: string): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return text.trim()
  const out: string[] = []
  for (const t of tokens) {
    const key = tokenCompareKey(t)
    const prev = out[out.length - 1]
    const prevKey = prev ? tokenCompareKey(prev) : ''
    if (key.length > 0 && key === prevKey) continue
    out.push(t)
  }
  return out.join(' ')
}

/** Collapse repeated phrases/words to one occurrence so we keep content instead of dropping. */
function collapseRepetitions(text: string): string {
  let out = text.trim()
  // 0. Immediate doubles (cloud STT stutter) — run twice; later steps can re-adjacentize
  out = collapseAdjacentDuplicateTokens(out)

  // 1. Word-level stutter: "Oh, Oh, Oh, Oh" → "Oh" / "you you you you" → "you"
  //    Match a word (with optional trailing comma) repeated 2+ times consecutively
  out = out.replace(/\b(\w+),?\s+(?:\1,?\s+){1,}\1\b/gi, '$1')

  // 2. Comma-separated repeats: "member, member, member" → "member"
  out = out.replace(/\b(\w+)(?:\s*,\s*\1){2,}\b/gi, '$1')

  // 3. Short phrase repeats (2-3 words): "yeah yeah yeah" / "right right right"
  out = out.replace(/\b((?:\w+\s+){1,2}\w+)[,.]?\s+(?:\1[,.]?\s+){1,}/gi, '$1')

  // 4. Sentence-level: drop duplicate consecutive sentences (keep first)
  const sentences = out.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
  const seen = new Set<string>()
  const kept: string[] = []
  for (const s of sentences) {
    const norm = s.toLowerCase().replace(/[,.\s]+/g, ' ').trim()
    if (norm && !seen.has(norm)) {
      seen.add(norm)
      kept.push(s)
    }
  }
  out = kept.join(' ') || out

  // 5. Phrase repetition: same 10+ char phrase 3+ times → keep once
  out = out.replace(/(.{10,}?)(\s+\1){2,}/g, '$1')

  // 6. Clean up leftover double spaces / commas
  out = out.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim()

  // 7. Final pass: paired duplicates after punctuation normalization
  out = collapseAdjacentDuplicateTokens(out)

  return out
}

/**
 * Strip the re-transcribed overlap prefix from a new chunk.
 * When Whisper uses the last 2s of audio as context for the next chunk, it re-transcribes
 * those words at the start of the new result. Find the longest suffix of prevTail that
 * matches a prefix of newText (word-normalized) and strip it.
 */
function trimOverlapTail(prevTail: string, newText: string): string {
  if (!prevTail || !newText) return newText
  const norm = (s: string) =>
    s.toLowerCase().replace(/[,.\-!?'"]/g, '').trim().split(/\s+/).filter(Boolean)
  const prev = norm(prevTail)
  const next = norm(newText)
  const maxLen = Math.min(prev.length, next.length, OVERLAP_WORD_MATCH_MAX)
  for (let len = maxLen; len >= OVERLAP_WORD_MATCH_MIN; len--) {
    if (prev.slice(-len).join(' ') === next.slice(0, len).join(' ')) {
      const rawWords = newText.trim().split(/\s+/)
      const trimmed = rawWords.slice(len).join(' ').trim()
      logMicCaptureDebug('trim_overlap_tail', { removed: rawWords.slice(0, len).join(' '), kept: trimmed.slice(0, 60) })
      return trimmed
    }
  }
  return newText
}

/**
 * Inter-chunk sentence-level dedup: strip sentences that were already emitted recently.
 * This catches cross-chunk duplicates like "So instead of comparing..." repeated across chunks.
 */
function deduplicateSentencesAcrossChunks(text: string): string {
  const now = Date.now()
  // Prune old sentences
  while (recentEmittedSentences.length > 0 && now - recentEmittedSentences[0].time > SENTENCE_DEDUP_WINDOW_MS) {
    recentEmittedSentences.shift()
  }

  // Split into sentences (by . ! ? or long phrases separated by ,)
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
  if (sentences.length <= 1) {
    // Single sentence — don't dedup (would kill entire chunk)
    return text
  }

  const kept: string[] = []
  for (const sentence of sentences) {
    const norm = sentence.toLowerCase().replace(/[,.\-!?\s]+/g, ' ').trim()
    if (norm.length < 15) {
      // Too short to reliably dedup across chunks
      kept.push(sentence)
      continue
    }
    // Check if this sentence (or very similar) was emitted recently
    const isDup = recentEmittedSentences.some(entry => {
      if (entry.norm === norm) return true
      // Fuzzy: >80% word overlap for sentences
      if (norm.length > 20 && entry.norm.length > 20 && textSimilarity(entry.norm, norm) > 0.80) return true
      // Substring containment for long phrases
      if (norm.length > 30 && (entry.norm.includes(norm) || norm.includes(entry.norm))) return true
      return false
    })
    if (!isDup) {
      kept.push(sentence)
    }
  }

  const result = kept.join(' ').trim()
  // Track all sentences from this chunk for future dedup
  for (const sentence of sentences) {
    const norm = sentence.toLowerCase().replace(/[,.\-!?\s]+/g, ' ').trim()
    if (norm.length >= 15) {
      recentEmittedSentences.push({ norm, time: now })
    }
  }
  // Cap size
  if (recentEmittedSentences.length > 200) recentEmittedSentences.splice(0, recentEmittedSentences.length - 200)

  return result || text
}

/** Known acronyms / proper-noun patterns to preserve in uppercase. */
const PRESERVE_UPPER_RE = /^(?:[A-Z]{2,}|I|OK|AI|API|AWS|GCP|CEO|CTO|CFO|VP|HR|PR|QA|UI|UX|OKR|KPI|SLA|SQL|SDK|CI|CD|ML|NLP|LLM|HTTP|URL|DNS|VPN|IPC|CPU|GPU|RAM|SSD|iOS|macOS|PDF|CSV|JSON|XML|HTML|CSS|MVP|POC|ROI|SaaS|B2B|B2C)$/

/** Capitalize first letter of each sentence, fix " i " → " I ", and lowercase random mid-sentence caps from Whisper. */
function normalizeSentenceCasing(text: string): string {
  const segments = text.split(/(?<=[.!?])\s+|\n+/)
  return segments
    .map((seg) => {
      const t = seg.trim()
      if (!t) return t
      const words = t.split(/\s+/)
      const fixed = words.map((word, i) => {
        // First word: capitalize first letter, lowercase rest (unless acronym)
        if (i === 0) {
          if (PRESERVE_UPPER_RE.test(word)) return word
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        }
        // Standalone "i"
        if (word.toLowerCase() === 'i') return 'I'
        // Preserve known acronyms and all-caps words (2+ chars)
        if (PRESERVE_UPPER_RE.test(word)) return word
        // Preserve contractions like "I'm", "don't" — just return as-is if contains apostrophe
        if (word.includes("'")) return word.toLowerCase()
        // Proper name pattern: starts uppercase, rest lowercase (e.g. "Andrew", "Monday") — preserve
        if (/^[A-Z][a-z]{2,}$/.test(word)) return word
        // Random mixed case mid-sentence (e.g. "SHould", "tHe") — lowercase
        if (word.length > 1 && word !== word.toLowerCase() && word !== word.toUpperCase()) {
          return word.toLowerCase()
        }
        return word
      })
      return fixed.join(' ')
    })
    .filter(Boolean)
    .join(' ')
}

/**
 * Fuzzy boundary overlap: catch near-duplicate 2-3 word phrases at chunk boundaries
 * that trimOverlapTail missed due to punctuation/capitalization differences.
 */
function trimFuzzyBoundaryOverlap(prevTail: string, newText: string): string {
  if (!prevTail || !newText) return newText
  const normWord = (s: string) => s.toLowerCase().replace(/[,.\-!?'"]/g, '').trim()
  const prevWords = prevTail.trim().split(/\s+/).map(normWord).filter(Boolean)
  const newWords = newText.trim().split(/\s+/)
  if (prevWords.length < 2 || newWords.length < 2) return newText

  // Check if last 2-3 words of prev match first 2-3 words of new (normalized)
  for (let len = Math.min(3, prevWords.length, newWords.length); len >= 2; len--) {
    const tailSlice = prevWords.slice(-len).join(' ')
    const headSlice = newWords.slice(0, len).map(normWord).join(' ')
    if (tailSlice === headSlice) {
      const trimmed = newWords.slice(len).join(' ').trim()
      return trimmed || newText
    }
  }
  return newText
}

/** Filter known Whisper/STT hallucinations; collapse repetitions instead of dropping. */
function filterHallucinatedTranscript(text: string): string | null {
  const collapsed = collapseRepetitions(text)
  if (!collapsed) return null

  // Strip Whisper prompt echo — the accent priming text sometimes gets interleaved with real speech
  const PROMPT_SUBSTRINGS_TO_STRIP = [
    /Speakers may have Indian,? British,? or other non-American English accents\.?/gi,
    /Discussion about [^.]{0,200}\./g, // Vocabulary prompt echo
  ]
  let cleaned = collapsed
  for (const pat of PROMPT_SUBSTRINGS_TO_STRIP) {
    cleaned = cleaned.replace(pat, '')
  }
  // Safety net: strip any leaked "Msg = " prefixes from FluidAudio/Parakeet CoreML output
  cleaned = cleaned.replace(/\bMsg\s*=\s*/gi, '')
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  if (!cleaned) return null

  const lower = cleaned.toLowerCase()

  const hallucinationPatterns = [
    // YouTube/podcast hallucinations (Whisper trained on these)
    /thank\s+you\s+for\s+watching/i,
    /thanks\s+for\s+watching/i,
    /subscribe\s*(to\s+our\s+channel)?/i,
    /like\s+and\s+subscribe/i,
    /see\s+you\s+(in\s+the\s+)?next\s+/i,
    /don't\s+forget\s+to\s+subscribe/i,
    /hit\s+the\s+(bell|subscribe)\s+button/i,
    /please\s+leave\s+a\s+(like|comment)/i,
    /if\s+you\s+enjoyed\s+this/i,
    /check\s+out\s+our\s+(other\s+)?videos/i,
    /sponsored\s+by/i,
    /this\s+episode\s+is\s+brought\s+to\s+you/i,
    // Audio tags
    /^\[music\]$/i, /^\[applause\]$/i, /^\[blank_audio\]$/i, /^\[silence\]$/i,
    /^\(music\)$/i, /^\(applause\)$/i, /^\(laughter\)$/i, /^\(silence\)$/i,
    /^\[inaudible\]$/i, /^\(inaudible\)$/i,
    // Common Whisper "meeting filler" on silence / reconnect noise (esp. after pause→resume)
    /let me add (a few )?thoughts on (this |the )?topic/i,
    /consider the timeline (for|of) next steps/i,
    /wrap up the remaining items/i,
    /let's move on to the next/i,
    /i think (that's|we) (a good|the right) point/i,
    /^\.+$/,  // Just periods/dots
    /^,+$/,   // Just commas
    // Single foreign-language words that Whisper hallucinates on silence
    /^(vous|merci|bonjour|danke|gracias|arigatou|xie\s*xie|spasibo)$/i,
  ]
  for (const pat of hallucinationPatterns) {
    if (pat.test(lower)) return null
  }

  // Entropy check: if text is mostly repeated words, it's hallucination
  const wordList = cleaned.toLowerCase().replace(/[,.\-!?]/g, '').split(/\s+/).filter(Boolean)
  const uniqueWords = new Set(wordList)
  if (wordList.length > 4 && uniqueWords.size / wordList.length < 0.4) {
    return null
  }

  // Single word repeated (after collapse): "Oh" or just filler
  if (wordList.length <= 2 && cleaned.length < 5) {
    return null
  }

  // Entire segment is only repeated short phrase (2–4 words repeated 2+ times)
  const words = cleaned.split(/\s+/)
  if (words.length >= 4) {
    for (let len = 1; len <= 4; len++) {
      for (let i = 0; i <= words.length - len * 2; i++) {
        const chunk = words.slice(i, i + len).join(' ').toLowerCase().replace(/[,.]/g, '')
        const next1 = words.slice(i + len, i + len * 2).join(' ').toLowerCase().replace(/[,.]/g, '')
        if (chunk === next1 && i + len * 2 >= words.length - 1) {
          // The rest of the segment is just this phrase repeated
          return null
        }
        if (words.length >= len * 3) {
          const next2 = words.slice(i + len * 2, i + len * 3).join(' ').toLowerCase().replace(/[,.]/g, '')
          if (chunk === next1 && chunk === next2) return null
        }
      }
    }
  }

  return normalizeSentenceCasing(cleaned)
}

// ─── LLM Post-Processing (background correction queue) ──────────────────────

function buildCorrectionPrompt(text: string, vocabulary: string[], meetingTitle: string, recentContext: string[]): string {
  const parts: string[] = []

  if (meetingTitle) parts.push(`Meeting: ${meetingTitle}`)
  if (vocabulary.length > 0) parts.push(`Domain terms: ${vocabulary.slice(0, 30).join(', ')}`)
  if (recentContext.length > 0) {
    parts.push('Recent transcript for context:')
    for (const seg of recentContext) parts.push(`- ${seg}`)
  }
  parts.push('')
  parts.push(`Correct this segment:\n${text}`)

  return parts.join('\n')
}

function enqueueCorrection(item: { speaker: string; time: string; text: string }): void {
  if (correctionQueue.length >= CORRECTION_QUEUE_MAX) {
    correctionQueue.shift() // drop oldest if overflowing
  }
  correctionQueue.push(item)
  if (!isCorrecting) {
    setImmediate(() => processCorrectionQueue())
  }
}

async function processCorrectionQueue(): Promise<void> {
  if (isCorrecting || correctionQueue.length === 0) return
  isCorrecting = true

  while (correctionQueue.length > 0) {
    const item = correctionQueue.shift()!
    if (!correctionCallback) break

    try {
      const llmModel = getSetting('llm-model') || ''
      if (!llmModel || llmModel.startsWith('local:') || llmModel.startsWith('apple:')) {
        // Skip: local/Apple LLMs are too slow for real-time correction
        continue
      }

      const prompt = buildCorrectionPrompt(item.text, sttVocabularyTerms, meetingTitleForPrompt, recentCorrectedSegments)
      const corrected = await Promise.race([
        routeLLM([
          { role: 'system', content: 'You are a transcript editor correcting automated speech-to-text output. Fix misheard words, grammar, punctuation, and capitalization. Words may be phonetically similar to the correct word (e.g., "very fling" → "verify link"). Use the meeting context and domain terms to infer correct words. Keep the exact meaning — do not add, remove, or paraphrase content. Return ONLY the corrected text.' },
          { role: 'user', content: prompt },
        ], llmModel),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), CORRECTION_TIMEOUT_MS)),
      ])

      const cleaned = corrected.trim()
      // Sanity check: skip if empty, unchanged, or too different (LLM hallucinated)
      if (cleaned && cleaned !== item.text && !isCorrectionTooFar(item.text, cleaned)) {
        correctionCallback({
          speaker: item.speaker,
          time: item.time,
          text: cleaned,
          originalText: item.text,
        })
        // Update sliding window with corrected text for future context
        recentCorrectedSegments.push(cleaned)
        if (recentCorrectedSegments.length > MAX_RECENT_CONTEXT) recentCorrectedSegments.shift()
      } else if (cleaned && cleaned === item.text) {
        // Unchanged but valid — still add to context window
        recentCorrectedSegments.push(item.text)
        if (recentCorrectedSegments.length > MAX_RECENT_CONTEXT) recentCorrectedSegments.shift()
      }
    } catch (err: any) {
      // Silently skip failed corrections — raw transcript is already displayed
      if (err?.message !== 'timeout') {
        console.warn('[capture] LLM correction failed:', err?.message?.slice(0, 100))
      }
    }
  }

  isCorrecting = false
}

async function drainCorrectionQueue(): Promise<void> {
  if (correctionQueue.length === 0 && !isCorrecting) return
  // Wait for in-flight + remaining corrections (max 30s total)
  const deadline = Date.now() + 30000
  while ((isCorrecting || correctionQueue.length > 0) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

/** Reject corrections where too many words changed (LLM went off-script). */
function isCorrectionTooFar(original: string, corrected: string): boolean {
  const origWords = original.toLowerCase().split(/\s+/)
  const corrWords = corrected.toLowerCase().split(/\s+/)
  if (origWords.length === 0) return true
  // Short segments: domain corrections can change most words, so allow more latitude
  if (origWords.length <= 5) return false
  const origSet = new Set(origWords)
  let kept = 0
  for (const w of corrWords) {
    if (origSet.has(w)) kept++
  }
  const ratio = kept / Math.max(origWords.length, corrWords.length)
  return ratio < 0.25 // Less than 25% overlap → reject (relaxed from 40% for domain corrections)
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
