import { extractEmbeddings, ensureEmbeddingModel, cosineSimilarity } from './speaker-embeddings'

const SIMILARITY_THRESHOLD = 0.65
const MAX_SPEAKERS = 6
const CENTROID_ALPHA = 0.3 // exponential moving average weight for new embeddings

interface SpeakerCentroid {
  id: number
  centroid: Float32Array
  count: number
}

export class StreamingDiarizer {
  private centroids: SpeakerCentroid[] = []
  private nextSpeakerId = 1
  private modelReady = false
  private modelLoading: Promise<void> | null = null

  async ensureModel(): Promise<void> {
    if (this.modelReady) return
    if (this.modelLoading) return this.modelLoading
    this.modelLoading = ensureEmbeddingModel()
      .then(() => { this.modelReady = true })
      .finally(() => { this.modelLoading = null })
    return this.modelLoading
  }

  isReady(): boolean {
    return this.modelReady
  }

  /**
   * Identify the dominant speaker in a speech audio chunk.
   * Returns "Speaker 1", "Speaker 2", etc. or empty string if identification fails.
   */
  async identifySpeaker(speechAudio: Float32Array, sampleRate: number): Promise<string> {
    if (!this.modelReady) return ''

    const embeddings = await extractEmbeddings(speechAudio, sampleRate)
    if (embeddings.length === 0) return ''

    // Assign each embedding window to a speaker, then majority-vote
    const votes: number[] = []

    for (const emb of embeddings) {
      const speakerId = this.matchOrCreateSpeaker(emb.embedding)
      votes.push(speakerId)
    }

    // Majority vote
    const counts = new Map<number, number>()
    for (const v of votes) {
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    let bestId = votes[0]
    let bestCount = 0
    for (const [id, count] of counts) {
      if (count > bestCount) {
        bestId = id
        bestCount = count
      }
    }

    return `Speaker ${bestId}`
  }

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
      // Update centroid with exponential moving average
      const c = this.centroids[bestIdx]
      const updated = new Float32Array(c.centroid.length)
      for (let i = 0; i < updated.length; i++) {
        updated[i] = CENTROID_ALPHA * embedding[i] + (1 - CENTROID_ALPHA) * c.centroid[i]
      }
      // L2 normalize
      const norm = Math.sqrt(updated.reduce((s, v) => s + v * v, 0))
      if (norm > 0) {
        for (let i = 0; i < updated.length; i++) updated[i] /= norm
      }
      c.centroid = updated
      c.count++
      return c.id
    }

    // Create new speaker if under limit
    if (this.centroids.length < MAX_SPEAKERS) {
      const id = this.nextSpeakerId++
      this.centroids.push({ id, centroid: embedding.slice(), count: 1 })
      return id
    }

    // Over limit — assign to nearest existing centroid
    if (bestIdx >= 0) {
      const c = this.centroids[bestIdx]
      c.count++
      return c.id
    }

    return 1
  }

  reset(): void {
    this.centroids = []
    this.nextSpeakerId = 1
  }
}
