import { parseTimeToSeconds } from './transcript-utils'

/**
 * Live Coaching Engine
 *
 * Computes real-time speech metrics from accumulating transcript lines.
 * Designed to run on every new transcript line (every ~5s) with O(n)
 * over recent window, not full history.
 *
 * Reuses filler word detection from coaching-analytics.ts.
 */

// Import filler words list from existing coaching analytics
// The FILLER_WORDS list includes: um, uh, like, you know, basically, right, actually, literally, so, I mean, kind of, sort of

export const FILLER_WORDS = [
  'um', 'uh', 'like', 'you know', 'basically', 'right', 'actually',
  'literally', 'so', 'I mean', 'kind of', 'sort of',
]

export interface LiveCoachMetrics {
  // Current values
  wpm: number                    // Words per minute (rolling 60s window)
  talkRatio: number              // 0-1, your talk time / total (rolling 2min)
  fillerCount: number            // Session total filler words
  fillersPerMinute: number       // Fillers per minute of your speaking
  monologueSeconds: number       // Consecutive seconds you've been talking
  interruptionCount: number      // Times you interrupted others

  // Status indicators
  wpmStatus: 'slow' | 'good' | 'fast'
  talkStatus: 'quiet' | 'balanced' | 'dominant'

  // Nudge (if any)
  nudge: string | null
}

export interface TranscriptLine {
  speaker: string
  time: string
  text: string
}

// parseTimeToSeconds imported from transcript-utils.ts

/**
 * Count filler words in text (case-insensitive, word boundary aware).
 */
function countFillers(text: string): number {
  const lower = text.toLowerCase()
  let count = 0
  for (const filler of FILLER_WORDS) {
    // Use simple includes for multi-word fillers, word boundary for single words
    if (filler.includes(' ')) {
      let idx = 0
      while ((idx = lower.indexOf(filler, idx)) !== -1) {
        count++
        idx += filler.length
      }
    } else {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi')
      const matches = lower.match(regex)
      if (matches) count += matches.length
    }
  }
  return count
}

/**
 * Compute live coaching metrics from transcript lines.
 * Call this on every new transcript line during recording.
 */
export function computeLiveMetrics(lines: TranscriptLine[]): LiveCoachMetrics {
  if (lines.length === 0) {
    return {
      wpm: 0, talkRatio: 0, fillerCount: 0, fillersPerMinute: 0,
      monologueSeconds: 0, interruptionCount: 0,
      wpmStatus: 'good', talkStatus: 'balanced', nudge: null,
    }
  }

  const now = lines.length > 0 ? parseTimeToSeconds(lines[lines.length - 1].time) : 0

  // --- Rolling WPM (last 60s) ---
  const wpmWindowStart = Math.max(0, now - 60)
  let recentWordCount = 0
  let recentSpeakingSeconds = 0

  for (const line of lines) {
    const lineTime = parseTimeToSeconds(line.time)
    if (lineTime >= wpmWindowStart && line.speaker === 'You') {
      recentWordCount += line.text.split(/\s+/).filter(Boolean).length
      recentSpeakingSeconds += 5  // Approximate: each line is ~5s
    }
  }

  const wpmWindow = Math.min(60, now)
  const wpm = wpmWindow > 0 && recentSpeakingSeconds > 0
    ? Math.round((recentWordCount / recentSpeakingSeconds) * 60)
    : 0

  // --- Talk ratio (rolling 2 min) ---
  const talkWindowStart = Math.max(0, now - 120)
  let yourLines = 0
  let totalLines = 0

  for (const line of lines) {
    const lineTime = parseTimeToSeconds(line.time)
    if (lineTime >= talkWindowStart) {
      totalLines++
      if (line.speaker === 'You') yourLines++
    }
  }

  const talkRatio = totalLines > 0 ? yourLines / totalLines : 0

  // --- Filler words (session total) ---
  let fillerCount = 0
  let totalYourSeconds = 0

  for (const line of lines) {
    if (line.speaker === 'You') {
      fillerCount += countFillers(line.text)
      totalYourSeconds += 5
    }
  }

  const yourMinutes = totalYourSeconds / 60
  const fillersPerMinute = yourMinutes > 0 ? Math.round((fillerCount / yourMinutes) * 10) / 10 : 0

  // --- Monologue detection ---
  let monologueSeconds = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].speaker === 'You') {
      monologueSeconds += 5
    } else {
      break
    }
  }

  // --- Interruption detection ---
  let interruptionCount = 0
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].speaker === 'You' && lines[i - 1].speaker !== 'You') {
      // Check if the previous speaker's line was very short (likely interrupted)
      const prevWords = lines[i - 1].text.split(/\s+/).length
      if (prevWords < 5 && i > 1 && lines[i - 2]?.speaker !== 'You') {
        interruptionCount++
      }
    }
  }

  // --- Status indicators ---
  const wpmStatus: LiveCoachMetrics['wpmStatus'] =
    wpm === 0 ? 'good' :
    wpm < 110 ? 'slow' :
    wpm > 170 ? 'fast' : 'good'

  const talkStatus: LiveCoachMetrics['talkStatus'] =
    talkRatio < 0.3 ? 'quiet' :
    talkRatio > 0.7 ? 'dominant' : 'balanced'

  // --- Nudge system ---
  let nudge: string | null = null

  if (monologueSeconds >= 180) {
    nudge = "You've been talking for 3+ minutes \u2014 try asking a question"
  } else if (monologueSeconds >= 120) {
    nudge = "You've been talking for 2 minutes \u2014 consider pausing"
  } else if (talkRatio > 0.8 && totalLines > 10) {
    nudge = "You're doing most of the talking \u2014 try listening more"
  } else if (wpm > 180 && recentSpeakingSeconds > 15) {
    nudge = "You're speaking quite fast \u2014 try slowing down"
  } else if (fillersPerMinute > 5 && yourMinutes > 1) {
    nudge = `${fillerCount} filler words so far \u2014 try pausing instead`
  }

  return {
    wpm, talkRatio, fillerCount, fillersPerMinute,
    monologueSeconds, interruptionCount,
    wpmStatus, talkStatus, nudge,
  }
}
