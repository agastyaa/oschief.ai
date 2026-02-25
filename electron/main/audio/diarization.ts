import { extractEmbeddings, cosineSimilarity, ensureEmbeddingModel, type SpeakerEmbedding } from './speaker-embeddings'
import { ensureVADModel, runVAD, type VADSegment } from './vad'

export interface DiarizedSegment {
  speaker: string
  startTime: number
  endTime: number
}

const SIMILARITY_THRESHOLD = 0.65
const MAX_SPEAKERS = 6

export async function ensureDiarizationModels(): Promise<void> {
  await Promise.all([
    ensureVADModel(),
    ensureEmbeddingModel(),
  ])
}

export async function diarize(
  audio: Float32Array,
  sampleRate: number
): Promise<DiarizedSegment[]> {
  const embeddings = await extractEmbeddings(audio, sampleRate)

  if (embeddings.length === 0) {
    return [{
      speaker: 'Speaker 1',
      startTime: 0,
      endTime: audio.length / sampleRate,
    }]
  }

  if (embeddings.length === 1) {
    return [{
      speaker: 'Speaker 1',
      startTime: embeddings[0].startTime,
      endTime: embeddings[0].endTime,
    }]
  }

  const labels = agglomerativeClustering(embeddings, SIMILARITY_THRESHOLD, MAX_SPEAKERS)

  const segments: DiarizedSegment[] = []
  for (let i = 0; i < embeddings.length; i++) {
    segments.push({
      speaker: `Speaker ${labels[i] + 1}`,
      startTime: embeddings[i].startTime,
      endTime: embeddings[i].endTime,
    })
  }

  return mergeAdjacentSegments(segments)
}

function agglomerativeClustering(
  embeddings: SpeakerEmbedding[],
  threshold: number,
  maxClusters: number
): number[] {
  const n = embeddings.length

  // Build similarity matrix
  const simMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    simMatrix[i][i] = 1
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(embeddings[i].embedding, embeddings[j].embedding)
      simMatrix[i][j] = sim
      simMatrix[j][i] = sim
    }
  }

  // Each point starts in its own cluster
  let clusters: number[][] = Array.from({ length: n }, (_, i) => [i])
  let clusterIds: number[] = Array.from({ length: n }, (_, i) => i)

  while (clusters.length > 1) {
    // Find the two most similar clusters (average linkage)
    let bestSim = -Infinity
    let bestI = 0
    let bestJ = 1

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = averageLinkage(clusters[i], clusters[j], simMatrix)
        if (sim > bestSim) {
          bestSim = sim
          bestI = i
          bestJ = j
        }
      }
    }

    // Stop if best similarity is below threshold or we've reached max clusters
    if (bestSim < threshold && clusters.length <= maxClusters) {
      break
    }

    if (clusters.length <= 1) break

    // Merge the two most similar clusters
    const merged = [...clusters[bestI], ...clusters[bestJ]]
    const newClusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ)
    newClusters.push(merged)
    clusters = newClusters
  }

  // Assign labels
  const labels = new Array(n).fill(0)
  for (let clusterIdx = 0; clusterIdx < clusters.length; clusterIdx++) {
    for (const pointIdx of clusters[clusterIdx]) {
      labels[pointIdx] = clusterIdx
    }
  }

  return labels
}

function averageLinkage(clusterA: number[], clusterB: number[], simMatrix: number[][]): number {
  let totalSim = 0
  let count = 0
  for (const a of clusterA) {
    for (const b of clusterB) {
      totalSim += simMatrix[a][b]
      count++
    }
  }
  return count > 0 ? totalSim / count : 0
}

function mergeAdjacentSegments(segments: DiarizedSegment[]): DiarizedSegment[] {
  if (segments.length === 0) return []

  const merged: DiarizedSegment[] = [{ ...segments[0] }]

  for (let i = 1; i < segments.length; i++) {
    const last = merged[merged.length - 1]
    const curr = segments[i]

    if (curr.speaker === last.speaker && curr.startTime - last.endTime < 1.0) {
      last.endTime = curr.endTime
    } else {
      merged.push({ ...curr })
    }
  }

  return merged
}
