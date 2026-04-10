import { join } from 'path'
import { existsSync } from 'fs'
import { getModelsDir, downloadModel } from '../models/manager'

let embeddingSession: any = null

const SEGMENT_DURATION = 1.5
const SEGMENT_OVERLAP = 0.75
const EMBEDDING_DIM = 512 // Wespeaker ECAPA-TDNN 512-LM

export interface SpeakerEmbedding {
  embedding: Float32Array
  startTime: number
  endTime: number
}

function getModelPath(): string {
  return join(getModelsDir(), 'ecapa_tdnn.onnx')
}

export async function ensureEmbeddingModel(): Promise<void> {
  const modelPath = getModelPath()
  if (existsSync(modelPath)) return

  console.log('Auto-downloading ECAPA-TDNN speaker embedding model...')
  await downloadModel('ecapa-tdnn', () => {})
}

async function getSession(): Promise<any> {
  if (embeddingSession) return embeddingSession

  const modelPath = getModelPath()
  if (!existsSync(modelPath)) {
    await ensureEmbeddingModel()
  }

  try {
    const ort = require('onnxruntime-node')
    embeddingSession = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
    })
  } catch (err: any) {
    throw new Error(`Failed to load speaker embedding model: ${err.message}`)
  }

  return embeddingSession
}

export async function extractEmbeddings(
  audio: Float32Array,
  sampleRate: number
): Promise<SpeakerEmbedding[]> {
  let session: any
  try {
    session = await getSession()
  } catch (err) {
    console.warn('Speaker embedding model unavailable:', err)
    return []
  }

  const ort = require('onnxruntime-node')
  const segmentSamples = Math.floor(SEGMENT_DURATION * sampleRate)
  const stepSamples = Math.floor((SEGMENT_DURATION - SEGMENT_OVERLAP) * sampleRate)
  const embeddings: SpeakerEmbedding[] = []

  for (let start = 0; start + segmentSamples <= audio.length; start += stepSamples) {
    const segment = audio.slice(start, start + segmentSamples)
    const startTime = start / sampleRate
    const endTime = (start + segmentSamples) / sampleRate

    // Normalize the segment
    const normalized = normalizeAudio(segment)

    try {
      const inputTensor = new ort.Tensor('float32', normalized, [1, normalized.length])
      const lengthTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(normalized.length)]), [1])

      const feeds: Record<string, any> = {}
      const inputNames = session.inputNames as string[]

      if (inputNames.includes('input_signal')) {
        feeds['input_signal'] = inputTensor
        if (inputNames.includes('input_signal_length')) {
          feeds['input_signal_length'] = lengthTensor
        }
      } else {
        feeds[inputNames[0]] = inputTensor
        if (inputNames.length > 1) {
          feeds[inputNames[1]] = lengthTensor
        }
      }

      const results = await session.run(feeds)
      const outputName = session.outputNames[0]
      const embeddingData = results[outputName].data as Float32Array

      // L2 normalize the embedding
      const norm = Math.sqrt(embeddingData.reduce((s: number, v: number) => s + v * v, 0))
      const normalizedEmb = new Float32Array(embeddingData.length)
      for (let i = 0; i < embeddingData.length; i++) {
        normalizedEmb[i] = norm > 0 ? embeddingData[i] / norm : 0
      }

      embeddings.push({
        embedding: normalizedEmb,
        startTime,
        endTime,
      })
    } catch (err) {
      console.warn(`Failed to extract embedding for segment at ${startTime}s:`, err)
    }
  }

  return embeddings
}

function normalizeAudio(audio: Float32Array): Float32Array {
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < audio.length; i++) {
    sum += audio[i]
    sumSq += audio[i] * audio[i]
  }
  const mean = sum / audio.length
  const variance = sumSq / audio.length - mean * mean
  const std = Math.sqrt(Math.max(variance, 1e-7))

  const result = new Float32Array(audio.length)
  for (let i = 0; i < audio.length; i++) {
    result[i] = (audio[i] - mean) / std
  }
  return result
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom > 0 ? dot / denom : 0
}
