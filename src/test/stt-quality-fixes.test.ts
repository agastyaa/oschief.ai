/**
 * Tests for STT quality fixes:
 * 1. Adaptive VAD uses quietest window (not first 0.5s)
 * 2. Confidence gate at -3.0 (not -2.0)
 * 3. Hallucination / entropy filter
 * 4. Word-thold and MLX logprob threshold values
 */

import { describe, it, expect } from 'vitest'

// ─── 1. Adaptive VAD: quietest-window calibration ─────────────────────────────

const SAMPLE_RATE = 16000

/**
 * Mirrors the adaptive VAD calibration logic from capture.ts.
 * Finds the quietest 0.5s window in the buffer to use as ambient baseline.
 */
function computeAmbientEnergy(merged: Float32Array): number {
  const windowLen = Math.min(Math.floor(SAMPLE_RATE / 2), merged.length)
  const stepSize = Math.max(1, Math.floor(windowLen / 4))
  let minWindowEnergy = Infinity
  for (let wi = 0; wi + windowLen <= merged.length; wi += stepSize) {
    const win = merged.subarray(wi, wi + windowLen)
    const winEnergy = win.reduce((s, v) => s + v * v, 0) / win.length
    if (winEnergy < minWindowEnergy) minWindowEnergy = winEnergy
  }
  return minWindowEnergy === Infinity ? 0 : minWindowEnergy
}

/** Old (broken) approach: uses first 0.5s as baseline. */
function computeAmbientEnergyOld(merged: Float32Array): number {
  const ambientWindow = merged.subarray(0, Math.min(SAMPLE_RATE / 2, merged.length))
  return ambientWindow.reduce((s, v) => s + v * v, 0) / ambientWindow.length
}

function computeVadThreshold(ambientEnergy: number, channel: 0 | 1): number {
  return channel === 0
    ? Math.max(0.45, Math.min(0.65, 0.50 + ambientEnergy * 100))
    : Math.max(0.40, Math.min(0.60, 0.45 + ambientEnergy * 100))
}

describe('adaptive VAD calibration', () => {
  it('uses quietest window, not first window — speech-first buffer', () => {
    // Simulate: first 0.5s is speech (amplitude ~0.3), rest is quiet (amplitude ~0.01)
    const speechLen = SAMPLE_RATE / 2  // 0.5s of speech
    const silenceLen = SAMPLE_RATE     // 1s of silence
    const buffer = new Float32Array(speechLen + silenceLen)

    // Fill speech portion
    for (let i = 0; i < speechLen; i++) {
      buffer[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE)
    }
    // Fill silence portion (very low noise)
    for (let i = speechLen; i < buffer.length; i++) {
      buffer[i] = 0.005 * Math.sin(2 * Math.PI * 100 * i / SAMPLE_RATE)
    }

    const newEnergy = computeAmbientEnergy(buffer)
    const oldEnergy = computeAmbientEnergyOld(buffer)

    // Old method picks up the speech energy (high)
    expect(oldEnergy).toBeGreaterThan(0.01)
    // New method finds the quiet window (low)
    expect(newEnergy).toBeLessThan(0.001)
    // New threshold should be close to default (not inflated by speech)
    const newThreshold = computeVadThreshold(newEnergy, 1)
    const oldThreshold = computeVadThreshold(oldEnergy, 1)
    expect(newThreshold).toBeLessThan(oldThreshold)
  })

  it('produces same result when buffer is uniformly quiet', () => {
    const buffer = new Float32Array(SAMPLE_RATE)
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = 0.002 * Math.sin(2 * Math.PI * 60 * i / SAMPLE_RATE)
    }
    const newEnergy = computeAmbientEnergy(buffer)
    const oldEnergy = computeAmbientEnergyOld(buffer)
    // Both should be roughly the same for uniform audio
    expect(Math.abs(newEnergy - oldEnergy)).toBeLessThan(0.0001)
  })

  it('YouTube scenario: entire buffer is speech — both methods agree on high energy', () => {
    const buffer = new Float32Array(SAMPLE_RATE * 2)
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = 0.25 * Math.sin(2 * Math.PI * 300 * i / SAMPLE_RATE)
    }
    const newEnergy = computeAmbientEnergy(buffer)
    const oldEnergy = computeAmbientEnergyOld(buffer)
    // When everything is speech, both should be similar
    expect(Math.abs(newEnergy - oldEnergy) / oldEnergy).toBeLessThan(0.05)
  })

  it('threshold stays within valid range for system audio channel', () => {
    for (const energy of [0, 0.0001, 0.001, 0.01, 0.1, 1.0]) {
      const threshold = computeVadThreshold(energy, 1)
      expect(threshold).toBeGreaterThanOrEqual(0.40)
      expect(threshold).toBeLessThanOrEqual(0.60)
    }
  })

  it('threshold stays within valid range for mic channel', () => {
    for (const energy of [0, 0.0001, 0.001, 0.01, 0.1, 1.0]) {
      const threshold = computeVadThreshold(energy, 0)
      expect(threshold).toBeGreaterThanOrEqual(0.45)
      expect(threshold).toBeLessThanOrEqual(0.65)
    }
  })
})

// ─── 2. Confidence gate ───────────────────────────────────────────────────────

const CONFIDENCE_GATE = -3.0

function shouldDropByConfidence(avgConfidence: number | undefined): boolean {
  return avgConfidence != null && avgConfidence < CONFIDENCE_GATE
}

describe('confidence gate', () => {
  it('keeps segments with moderate confidence (-2.5)', () => {
    expect(shouldDropByConfidence(-2.5)).toBe(false)
  })

  it('keeps segments with low-but-acceptable confidence (-2.9)', () => {
    expect(shouldDropByConfidence(-2.9)).toBe(false)
  })

  it('drops segments below -3.0', () => {
    expect(shouldDropByConfidence(-3.5)).toBe(true)
    expect(shouldDropByConfidence(-5.0)).toBe(true)
  })

  it('keeps segments at exactly -3.0', () => {
    expect(shouldDropByConfidence(-3.0)).toBe(false)
  })

  it('passes through undefined confidence (cloud STT)', () => {
    expect(shouldDropByConfidence(undefined)).toBe(false)
  })

  it('old gate (-2.0) would have dropped valid speech at -2.5', () => {
    const OLD_GATE = -2.0
    const avgConf = -2.5
    // Old behavior: dropped (bad)
    expect(avgConf < OLD_GATE).toBe(true)
    // New behavior: kept (good)
    expect(shouldDropByConfidence(avgConf)).toBe(false)
  })
})

// ─── 3. Entropy / hallucination filter ────────────────────────────────────────

function collapseRepetitions(text: string): string {
  let out = text.trim()
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
  out = out.replace(/(.{10,}?)(\s+\1){2,}/g, '$1')
  return out.trim()
}

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

  // Entropy check: mostly repeated words → hallucination
  const wordList = collapsed.toLowerCase().split(/\s+/)
  const uniqueWords = new Set(wordList)
  if (wordList.length > 5 && uniqueWords.size / wordList.length < 0.3) {
    return null
  }

  // Entire segment is only repeated short phrase
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

  return collapsed
}

describe('hallucination filter', () => {
  it('keeps normal speech', () => {
    expect(filterHallucinatedTranscript('So the key takeaway from this meeting is that we need to focus on user retention.')).not.toBeNull()
  })

  it('keeps short but valid speech', () => {
    expect(filterHallucinatedTranscript('Yes, I agree.')).not.toBeNull()
  })

  it('drops "thank you for watching" hallucination', () => {
    expect(filterHallucinatedTranscript('Thank you for watching.')).toBeNull()
  })

  it('drops low-entropy repeated words', () => {
    expect(filterHallucinatedTranscript('the the the the the the the')).toBeNull()
  })

  it('drops repeated short phrase (2-word repeat 3x)', () => {
    expect(filterHallucinatedTranscript('okay so okay so okay so')).toBeNull()
  })

  it('keeps diverse text even with some repetition', () => {
    const text = 'I think the product roadmap needs to include better onboarding. The team agreed on this.'
    expect(filterHallucinatedTranscript(text)).not.toBeNull()
  })

  it('drops [blank_audio]', () => {
    expect(filterHallucinatedTranscript('[blank_audio]')).toBeNull()
  })

  it('drops empty/whitespace', () => {
    expect(filterHallucinatedTranscript('')).toBeNull()
    expect(filterHallucinatedTranscript('   ')).toBeNull()
  })
})

// ─── 4. Transcript grouping: time-gap + sentence splitting ───────────────────

import { groupTranscriptBySpeaker, parseTimeToSeconds } from '../lib/transcript-utils'

describe('parseTimeToSeconds', () => {
  it('parses "0:00" to 0', () => {
    expect(parseTimeToSeconds('0:00')).toBe(0)
  })
  it('parses "1:30" to 90', () => {
    expect(parseTimeToSeconds('1:30')).toBe(90)
  })
  it('parses "10:05" to 605', () => {
    expect(parseTimeToSeconds('10:05')).toBe(605)
  })
  it('handles empty string gracefully', () => {
    expect(parseTimeToSeconds('')).toBe(0)
  })
})

describe('groupTranscriptBySpeaker with time-gap splitting', () => {
  it('merges consecutive same-speaker lines with small time gap', () => {
    const items = [
      { speaker: 'Others', time: '0:10', text: 'Hello everyone.', originalIndex: 0 },
      { speaker: 'Others', time: '0:12', text: 'Let us start.', originalIndex: 1 },
      { speaker: 'Others', time: '0:15', text: 'First topic.', originalIndex: 2 },
    ]
    const groups = groupTranscriptBySpeaker(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].text).toContain('Hello everyone.')
    expect(groups[0].text).toContain('First topic.')
  })

  it('splits same-speaker lines when time gap exceeds 45 seconds', () => {
    const items = [
      { speaker: 'Others', time: '0:10', text: 'First paragraph point.', originalIndex: 0 },
      { speaker: 'Others', time: '0:12', text: 'More detail here.', originalIndex: 1 },
      { speaker: 'Others', time: '1:10', text: 'After a long pause.', originalIndex: 2 },
    ]
    const groups = groupTranscriptBySpeaker(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].text).toContain('First paragraph point.')
    expect(groups[1].text).toContain('After a long pause.')
  })

  it('still splits on speaker change regardless of time gap', () => {
    const items = [
      { speaker: 'Others', time: '0:10', text: 'Their point.', originalIndex: 0 },
      { speaker: 'You', time: '0:11', text: 'My response.', originalIndex: 1 },
    ]
    const groups = groupTranscriptBySpeaker(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].speaker).toBe('Others')
    expect(groups[1].speaker).toBe('You')
  })

  it('handles empty input', () => {
    expect(groupTranscriptBySpeaker([])).toEqual([])
  })

  it('handles single item', () => {
    const items = [{ speaker: 'You', time: '0:00', text: 'Hello.', originalIndex: 0 }]
    const groups = groupTranscriptBySpeaker(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].text).toBe('Hello.')
  })

  it('preserves indices correctly across time-gap splits', () => {
    const items = [
      { speaker: 'Others', time: '0:10', text: 'A.', originalIndex: 0 },
      { speaker: 'Others', time: '0:12', text: 'B.', originalIndex: 1 },
      { speaker: 'Others', time: '1:10', text: 'C.', originalIndex: 2 },
    ]
    const groups = groupTranscriptBySpeaker(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].indices).toEqual([0, 1])
    expect(groups[1].indices).toEqual([2])
  })
})

describe('max-sentence splitting', () => {
  it('splits a long same-speaker monologue by sentence count', () => {
    // 25 sentences to exceed MAX_SENTENCES_PER_GROUP (20)
    const longText = Array.from({ length: 25 }, (_, i) => `Sentence ${i + 1}.`).join(' ')
    const items = [
      { speaker: 'Others', time: '0:10', text: longText, originalIndex: 0 },
    ]
    const groups = groupTranscriptBySpeaker(items)
    expect(groups.length).toBeGreaterThan(1)
    // First group should have at most 20 sentences
    const firstSentences = groups[0].text.match(/[.!?]/g)
    expect(firstSentences!.length).toBeLessThanOrEqual(20)
  })

  it('does not split short text', () => {
    const items = [
      { speaker: 'Others', time: '0:10', text: 'One. Two. Three.', originalIndex: 0 },
    ]
    const groups = groupTranscriptBySpeaker(items)
    expect(groups).toHaveLength(1)
  })

  it('handles text without sentence-ending punctuation', () => {
    const items = [
      { speaker: 'Others', time: '0:10', text: 'This is a long run-on sentence without periods that goes on and on', originalIndex: 0 },
    ]
    const groups = groupTranscriptBySpeaker(items)
    expect(groups).toHaveLength(1) // Cannot split without sentence boundaries
  })
})

// ─── 5. Threshold values (compile-time checks) ───────────────────────────────

describe('threshold values are correctly set', () => {
  // These read the actual source files to verify the values
  it('word-thold is 0.01 (not 0.5)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.resolve(__dirname, '../../electron/main/models/stt-engine.ts'),
      'utf-8'
    )
    expect(content).toContain("'--word-thold', '0.01'")
    expect(content).not.toContain("'--word-thold', '0.5'")
  })

  it('MLX logprob_threshold is -1.0 (not -0.5)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.resolve(__dirname, '../../electron/main/models/stt-engine.ts'),
      'utf-8'
    )
    expect(content).toContain('"logprob_threshold": -1.0')
    expect(content).not.toContain('"logprob_threshold": -0.5')
  })

  it('confidence gate is -3.0 (not -2.0)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.resolve(__dirname, '../../electron/main/audio/capture.ts'),
      'utf-8'
    )
    expect(content).toContain('avgConfidence < -3.0')
    expect(content).not.toContain('avgConfidence < -2.0')
  })

  it('adaptive VAD uses min-window scan (not first-window)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const content = fs.readFileSync(
      path.resolve(__dirname, '../../electron/main/audio/capture.ts'),
      'utf-8'
    )
    expect(content).toContain('minWindowEnergy')
    expect(content).not.toContain('merged.subarray(0, Math.min(SAMPLE_RATE / 2')
  })
})
