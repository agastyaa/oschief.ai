/**
 * Two-stage speaker diarization using:
 *   1. pyannote/segmentation-3.0 (ONNX, 6MB) — frame-level speaker activity detection
 *   2. ECAPA-TDNN (ONNX, existing) — speaker embeddings for cross-chunk identity
 *
 * The segmentation model outputs 7 powerset classes for up to 3 local speakers
 * per 10-second chunk. The embedding model then identifies which global speaker
 * each local speaker corresponds to via centroid matching.
 */

import { join } from 'path'
import { existsSync } from 'fs'
import { getModelsDir, downloadModel } from '../models/manager'
import { extractEmbeddings, ensureEmbeddingModel, cosineSimilarity } from './speaker-embeddings'

// ── Constants ────────────────────────────────────────────────────────────

const SAMPLE_RATE = 16000
const WINDOW_SAMPLES = SAMPLE_RATE * 10  // 10s window for pyannote
const NUM_FRAMES = 767     // output frames per 10s window
const NUM_CLASSES = 7      // powerset classes
const FRAME_DURATION = 10 / NUM_FRAMES  // ~13ms per frame

const SIMILARITY_THRESHOLD = 0.65
const MAX_SPEAKERS = 6
const CENTROID_ALPHA = 0.3

// Powerset mapping: class index → which local speakers are active (0-indexed)
// max_speakers_per_chunk=3, max_speakers_per_frame=2
const POWERSET_MAP: number[][] = [
  [],       // 0: non-speech
  [0],      // 1: speaker 1 only
  [1],      // 2: speaker 2 only
  [2],      // 3: speaker 3 only
  [0, 1],   // 4: speaker 1 + 2 overlap
  [0, 2],   // 5: speaker 1 + 3 overlap
  [1, 2],   // 6: speaker 2 + 3 overlap
]

// ── Types ────────────────────────────────────────────────────────────────

interface SpeakerSegment {
  localSpeaker: number  // 0, 1, or 2 (local to this chunk)
  startSec: number
  endSec: number
}

interface SpeakerCentroid {
  id: number
  centroid: Float32Array
  count: number
}

// ── StreamingDiarizer ────────────────────────────────────────────────────

export class StreamingDiarizer {
  private segSession: any = null
  private centroids: SpeakerCentroid[] = []
  private nextSpeakerId = 1
  private modelReady = false
  private modelLoading: Promise<void> | null = null

  async ensureModel(): Promise<void> {
    if (this.modelReady) return
    if (this.modelLoading) return this.modelLoading
    this.modelLoading = this._loadModels()
      .then(() => { this.modelReady = true })
      .catch((err) => {
        console.error('[diarizer] Model loading failed:', err)
        throw err
      })
      .finally(() => { this.modelLoading = null })
    return this.modelLoading
  }

  private async _loadModels(): Promise<void> {
    // Download both models in parallel if needed
    const segPath = join(getModelsDir(), 'pyannote_segmentation_3.onnx')
    const embPath = join(getModelsDir(), 'ecapa_tdnn.onnx')

    const downloads: Promise<void>[] = []
    if (!existsSync(segPath)) {
      console.log('[diarizer] Downloading pyannote segmentation model...')
      downloads.push(downloadModel('pyannote-segmentation', () => {}))
    }
    if (!existsSync(embPath)) {
      console.log('[diarizer] Downloading ECAPA-TDNN embedding model...')
      downloads.push(ensureEmbeddingModel())
    } else {
      downloads.push(ensureEmbeddingModel())
    }
    await Promise.all(downloads)

    // Load segmentation ONNX session
    const ort = require('onnxruntime-node')
    this.segSession = await ort.InferenceSession.create(segPath, {
      executionProviders: ['cpu'],
    })
    console.log('[diarizer] Models loaded — pyannote segmentation + ECAPA-TDNN')
  }

  isReady(): boolean {
    return this.modelReady
  }

  /**
   * Identify the dominant speaker in a speech audio chunk.
   * Returns "Speaker 1", "Speaker 2", etc. or empty string if fails.
   */
  async identifySpeaker(speechAudio: Float32Array, sampleRate: number): Promise<string> {
    if (!this.modelReady || !this.segSession) return ''

    try {
      // Stage 1: Segment — detect who speaks when
      const segments = await this.segment(speechAudio, sampleRate)
      if (segments.length === 0) return ''

      // Stage 2: Embed + match — identify each local speaker globally
      const speakerVotes = await this.embedAndMatch(speechAudio, sampleRate, segments)
      if (speakerVotes.length === 0) return ''

      // Weighted majority vote by segment duration
      const weightedCounts = new Map<number, number>()
      for (const { globalId, durationSec } of speakerVotes) {
        weightedCounts.set(globalId, (weightedCounts.get(globalId) || 0) + durationSec)
      }
      let bestId = speakerVotes[0].globalId
      let bestWeight = 0
      for (const [id, weight] of weightedCounts) {
        if (weight > bestWeight) {
          bestId = id
          bestWeight = weight
        }
      }

      return `Speaker ${bestId}`
    } catch (err: any) {
      console.warn('[diarizer] identifySpeaker failed:', err?.message || err)
      return ''
    }
  }

  /**
   * Run pyannote segmentation on audio. Handles chunks shorter or longer than 10s.
   */
  private async segment(audio: Float32Array, sampleRate: number): Promise<SpeakerSegment[]> {
    const ort = require('onnxruntime-node')

    // Pad or use as-is (model accepts dynamic input but trained on 10s)
    let input: Float32Array
    if (audio.length < WINDOW_SAMPLES) {
      input = new Float32Array(WINDOW_SAMPLES)
      input.set(audio, 0)  // zero-pad
    } else if (audio.length > WINDOW_SAMPLES) {
      // Use the last 10s — most recent speech is most relevant
      input = audio.slice(audio.length - WINDOW_SAMPLES)
    } else {
      input = audio
    }

    // Input shape: [1, 1, 160000]
    const inputTensor = new ort.Tensor('float32', input, [1, 1, WINDOW_SAMPLES])
    const feeds: Record<string, any> = {}
    const inputName = this.segSession.inputNames[0] || 'input_values'
    feeds[inputName] = inputTensor

    const results = await this.segSession.run(feeds)
    const outputName = this.segSession.outputNames[0] || 'logits'
    const logits = results[outputName].data as Float32Array  // [1, 767, 7] flattened

    // Decode powerset logits → per-frame speaker activity
    return this.decodeSegmentation(logits, audio.length / sampleRate)
  }

  /**
   * Decode powerset logits into speaker segments.
   * Applies softmax per frame, picks winning class, maps to active speakers.
   */
  private decodeSegmentation(logits: Float32Array, audioDurationSec: number): SpeakerSegment[] {
    // Per-frame: find the class with highest logit (argmax, skip softmax for speed)
    const frameActiveSpeakers: number[][] = []

    for (let f = 0; f < NUM_FRAMES; f++) {
      let bestClass = 0
      let bestLogit = -Infinity
      for (let c = 0; c < NUM_CLASSES; c++) {
        const val = logits[f * NUM_CLASSES + c]
        if (val > bestLogit) {
          bestLogit = val
          bestClass = c
        }
      }
      frameActiveSpeakers.push(POWERSET_MAP[bestClass])
    }

    // Convert frame-level activity → contiguous segments per local speaker
    const segments: SpeakerSegment[] = []
    const scale = audioDurationSec / NUM_FRAMES

    for (let spk = 0; spk < 3; spk++) {
      let segStart = -1
      for (let f = 0; f <= NUM_FRAMES; f++) {
        const active = f < NUM_FRAMES && frameActiveSpeakers[f].includes(spk)
        if (active && segStart < 0) {
          segStart = f
        } else if (!active && segStart >= 0) {
          const startSec = segStart * scale
          const endSec = f * scale
          if (endSec - startSec >= 0.3) {  // min 300ms segment
            segments.push({ localSpeaker: spk, startSec, endSec })
          }
          segStart = -1
        }
      }
    }

    return segments.sort((a, b) => a.startSec - b.startSec)
  }

  /**
   * For each local speaker detected by segmentation, extract their audio,
   * compute an ECAPA-TDNN embedding, and match to global speaker centroids.
   */
  private async embedAndMatch(
    audio: Float32Array,
    sampleRate: number,
    segments: SpeakerSegment[]
  ): Promise<{ globalId: number; durationSec: number }[]> {
    // Group segments by local speaker
    const byLocal = new Map<number, SpeakerSegment[]>()
    for (const seg of segments) {
      if (!byLocal.has(seg.localSpeaker)) byLocal.set(seg.localSpeaker, [])
      byLocal.get(seg.localSpeaker)!.push(seg)
    }

    const results: { globalId: number; durationSec: number }[] = []

    for (const [localSpk, segs] of byLocal) {
      // Extract audio for this local speaker
      const speakerAudio = this.extractSpeakerAudio(audio, sampleRate, segs)
      if (speakerAudio.length < sampleRate * 0.5) continue  // need at least 0.5s

      // Get ECAPA-TDNN embedding
      const embeddings = await extractEmbeddings(speakerAudio, sampleRate)
      if (embeddings.length === 0) continue

      // Average all embeddings for this local speaker
      const dim = embeddings[0].embedding.length
      const avg = new Float32Array(dim)
      for (const e of embeddings) {
        for (let i = 0; i < dim; i++) avg[i] += e.embedding[i]
      }
      for (let i = 0; i < dim; i++) avg[i] /= embeddings.length
      // L2 normalize
      const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0))
      if (norm > 0) for (let i = 0; i < dim; i++) avg[i] /= norm

      // Match to global centroid
      const globalId = this.matchOrCreateSpeaker(avg)
      const totalDuration = segs.reduce((sum, s) => sum + (s.endSec - s.startSec), 0)
      results.push({ globalId, durationSec: totalDuration })
    }

    return results
  }

  /** Concatenate audio samples where a specific speaker is active. */
  private extractSpeakerAudio(audio: Float32Array, sampleRate: number, segs: SpeakerSegment[]): Float32Array {
    let totalSamples = 0
    for (const s of segs) {
      totalSamples += Math.floor((s.endSec - s.startSec) * sampleRate)
    }
    const out = new Float32Array(totalSamples)
    let offset = 0
    for (const s of segs) {
      const start = Math.floor(s.startSec * sampleRate)
      const end = Math.min(Math.floor(s.endSec * sampleRate), audio.length)
      if (start < end && start < audio.length) {
        const slice = audio.subarray(start, end)
        out.set(slice, offset)
        offset += slice.length
      }
    }
    return out.subarray(0, offset)
  }

  /** Match embedding to existing centroid or create new speaker. */
  private matchOrCreateSpeaker(embedding: Float32Array): number {
    let bestSim = -1
    let bestIdx = -1

    for (let i = 0; i < this.centroids.length; i++) {
      const sim = cosineSimilarity(embedding, this.centroids[i].centroid)
      if (sim > bestSim) {
        bestSim = sim
        bestIdx = i
      }
    }

    if (bestSim >= SIMILARITY_THRESHOLD && bestIdx >= 0) {
      const c = this.centroids[bestIdx]
      const updated = new Float32Array(c.centroid.length)
      for (let i = 0; i < updated.length; i++) {
        updated[i] = CENTROID_ALPHA * embedding[i] + (1 - CENTROID_ALPHA) * c.centroid[i]
      }
      const norm = Math.sqrt(updated.reduce((s, v) => s + v * v, 0))
      if (norm > 0) for (let i = 0; i < updated.length; i++) updated[i] /= norm
      c.centroid = updated
      c.count++
      return c.id
    }

    if (this.centroids.length < MAX_SPEAKERS) {
      const id = this.nextSpeakerId++
      this.centroids.push({ id, centroid: embedding.slice(), count: 1 })
      return id
    }

    if (bestIdx >= 0) {
      this.centroids[bestIdx].count++
      return this.centroids[bestIdx].id
    }

    return 1
  }

  reset(): void {
    this.centroids = []
    this.nextSpeakerId = 1
    // Keep models loaded — no need to re-download between recordings
  }
}
