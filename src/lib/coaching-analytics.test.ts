import { describe, it, expect } from 'vitest'
import { computeCoachingMetrics, type TranscriptLine } from './coaching-analytics'

// v2.10 characterization: lock in the metric shape + core scoring bands so the
// upcoming refactor (and any future touch to this file) can't drift silently.

describe('computeCoachingMetrics — empty inputs', () => {
  it('returns a zero-filled metrics object for empty transcript', () => {
    const m = computeCoachingMetrics([], 300)
    expect(m.yourSpeakingTimeSec).toBe(0)
    expect(m.othersSpeakingTimeSec).toBe(0)
    expect(m.talkToListenRatio).toBe(0)
    expect(m.wordsPerMinute).toBe(0)
    expect(m.overallScore).toBe(0)
    expect(m.fillerWords).toEqual([])
    expect(m.interruptionCount).toBe(0)
  })

  it('returns zero metrics when duration is 0 or negative', () => {
    const t: TranscriptLine[] = [{ speaker: 'You', time: '0:00', text: 'Hello there' }]
    expect(computeCoachingMetrics(t, 0).overallScore).toBe(0)
    expect(computeCoachingMetrics(t, -5).overallScore).toBe(0)
  })
})

describe('computeCoachingMetrics — speaking time', () => {
  it('estimates yourSpeakingTime from chunk timestamps when no word-level data', () => {
    const t: TranscriptLine[] = [
      { speaker: 'You', time: '0:00', text: 'Hello everyone, welcome.' },
      { speaker: 'Others', time: '0:20', text: 'Thanks for having us here today.' },
      { speaker: 'You', time: '0:40', text: 'Let us dive in.' },
    ]
    const m = computeCoachingMetrics(t, 60)
    expect(m.yourSpeakingTimeSec).toBeGreaterThan(0)
    expect(m.othersSpeakingTimeSec).toBeGreaterThan(0)
    expect(m.yourSpeakingTimeSec + m.othersSpeakingTimeSec).toBeLessThanOrEqual(60)
  })

  it('uses word-level timing when present', () => {
    const t: TranscriptLine[] = [
      {
        speaker: 'You',
        time: '0:00',
        text: 'Hello',
        words: [{ word: 'Hello', start: 0, end: 5 }],
      },
      {
        speaker: 'Others',
        time: '0:10',
        text: 'Hi',
        words: [{ word: 'Hi', start: 10, end: 13 }],
      },
    ]
    const m = computeCoachingMetrics(t, 60)
    expect(m.yourSpeakingTimeSec).toBe(5)
    expect(m.othersSpeakingTimeSec).toBe(3)
  })

  it('excludes System speaker from speaking time', () => {
    const t: TranscriptLine[] = [
      { speaker: 'System', time: '0:00', text: 'Recording started.' },
      { speaker: 'You', time: '0:05', text: 'Ok lets begin.' },
    ]
    const m = computeCoachingMetrics(t, 60)
    expect(m.othersSpeakingTimeSec).toBe(0)
  })
})

describe('computeCoachingMetrics — filler words', () => {
  it('counts single-word fillers (um, uh, like, basically)', () => {
    const t: TranscriptLine[] = [
      {
        speaker: 'You',
        time: '0:00',
        text: 'Um, I was like, basically thinking we should, uh, proceed.',
        words: [{ word: 'x', start: 0, end: 30 }],
      },
    ]
    const m = computeCoachingMetrics(t, 60)
    const words = Object.fromEntries(m.fillerWords.map(f => [f.word, f.count]))
    expect(words.um).toBeGreaterThanOrEqual(1)
    expect(words.uh).toBeGreaterThanOrEqual(1)
    expect(words.like).toBeGreaterThanOrEqual(1)
    expect(words.basically).toBeGreaterThanOrEqual(1)
    expect(m.totalFillerCount).toBeGreaterThanOrEqual(4)
  })

  it('counts multi-word fillers (you know, I mean, kind of, sort of)', () => {
    const t: TranscriptLine[] = [
      {
        speaker: 'You',
        time: '0:00',
        text: 'You know, I mean, it is kind of like that. Sort of.',
        words: [{ word: 'x', start: 0, end: 30 }],
      },
    ]
    const m = computeCoachingMetrics(t, 60)
    const words = Object.fromEntries(m.fillerWords.map(f => [f.word, f.count]))
    expect(words['you know']).toBe(1)
    expect(words['I mean']).toBe(1)
    expect(words['kind of']).toBe(1)
    expect(words['sort of']).toBe(1)
  })

  it('ignores fillers in Others or System lines', () => {
    const t: TranscriptLine[] = [
      {
        speaker: 'Others',
        time: '0:00',
        text: 'Um, uh, you know, like basically.',
        words: [{ word: 'x', start: 0, end: 10 }],
      },
      {
        speaker: 'You',
        time: '0:10',
        text: 'Sure thing.',
        words: [{ word: 'x', start: 10, end: 12 }],
      },
    ]
    const m = computeCoachingMetrics(t, 60)
    expect(m.totalFillerCount).toBe(0)
  })
})

describe('computeCoachingMetrics — scoring bands', () => {
  function makeYouLine(text: string, startSec: number, endSec: number): TranscriptLine {
    const m = Math.floor(startSec / 60)
    const s = startSec % 60
    return {
      speaker: 'You',
      time: `${m}:${String(s).padStart(2, '0')}`,
      text,
      words: [{ word: 'x', start: startSec, end: endSec }],
    }
  }

  it('pacing score = 100 for WPM in 130-160 range', () => {
    // ~140 wpm: 140 words in 60 seconds
    const words = Array(140).fill('word').join(' ')
    const t: TranscriptLine[] = [makeYouLine(words, 0, 60)]
    const m = computeCoachingMetrics(t, 120)
    expect(m.wordsPerMinute).toBeGreaterThanOrEqual(130)
    expect(m.wordsPerMinute).toBeLessThanOrEqual(160)
    expect(m.pacingScore).toBe(100)
  })

  it('listening score = 100 for talk ratio in 40-60%', () => {
    const t: TranscriptLine[] = [
      makeYouLine('a b c d e', 0, 30),      // You speaks 30s
      {
        speaker: 'Others',
        time: '0:30',
        text: 'x y z',
        words: [{ word: 'x', start: 30, end: 60 }],  // Others speaks 30s
      },
    ]
    const m = computeCoachingMetrics(t, 120)
    expect(m.talkToListenRatio).toBeCloseTo(0.5, 1)
    expect(m.listeningScore).toBe(100)
  })

  it('conciseness score = 100 with no fillers', () => {
    const t: TranscriptLine[] = [makeYouLine('clean speech with zero disfluencies today', 0, 60)]
    const m = computeCoachingMetrics(t, 120)
    expect(m.totalFillerCount).toBe(0)
    expect(m.concisenessScore).toBe(100)
  })

  it('overall score is weighted pacing*0.25 + conciseness*0.25 + listening*0.50', () => {
    // Craft a transcript hitting perfect 100 for all three.
    const words = Array(140).fill('good').join(' ')
    const t: TranscriptLine[] = [
      makeYouLine(words, 0, 60),
      {
        speaker: 'Others',
        time: '1:00',
        text: Array(140).fill('reply').join(' '),
        words: [{ word: 'x', start: 60, end: 120 }],
      },
    ]
    const m = computeCoachingMetrics(t, 180)
    expect(m.pacingScore).toBe(100)
    expect(m.listeningScore).toBe(100)
    expect(m.concisenessScore).toBe(100)
    expect(m.overallScore).toBe(100)
  })
})

describe('computeCoachingMetrics — shape stability', () => {
  it('always returns all documented numeric fields', () => {
    const m = computeCoachingMetrics([], 0)
    const requiredKeys = [
      'yourSpeakingTimeSec', 'othersSpeakingTimeSec', 'silenceTimeSec',
      'talkToListenRatio', 'wordsPerMinute', 'pacingVariance',
      'fastestSegmentWpm', 'slowestSegmentWpm',
      'fillerWords', 'fillerWordsPerMinute', 'totalFillerCount',
      'interruptionCount', 'interruptedByOthersCount',
      'pacingScore', 'concisenessScore', 'listeningScore', 'overallScore',
    ] as const
    for (const k of requiredKeys) {
      expect(m).toHaveProperty(k)
    }
  })
})
