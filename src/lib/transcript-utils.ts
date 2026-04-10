export type TranscriptGroup = {
  speaker: string;
  timeStart: string;
  timeEnd: string;
  text: string;
  indices: number[];
};

/** Parse "m:ss", "mm:ss", or "h:mm:ss" transcript timestamp to total seconds. */
export function parseTimeToSeconds(time: string): number {
  const parts = time.split(':').map(p => parseInt(p, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/** Count words in a string. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** When consecutive same-speaker chunks are ≥ this many seconds apart, start a new block. */
const PAUSE_THRESHOLD_SEC = 45;

/** Maximum sentences per group before splitting into a new paragraph. */
const MAX_SENTENCES_PER_GROUP = 20;

/** Returns true if the gap between two timestamps exceeds the threshold. */
function hasTimePause(timeEnd: string, timeStart: string, thresholdSec: number): boolean {
  const endSec = parseTimeToSeconds(timeEnd);
  const startSec = parseTimeToSeconds(timeStart);
  return (startSec - endSec) >= thresholdSec;
}

/** Split groups that exceed max sentences into multiple groups with the same speaker. */
function splitLongGroups(groups: TranscriptGroup[]): TranscriptGroup[] {
  const result: TranscriptGroup[] = [];

  for (const group of groups) {
    const sentences = group.text.match(/[^.!?]*[.!?]+\s*/g);

    // If we can't parse sentences or the group is short enough, keep as-is
    if (!sentences || sentences.length <= MAX_SENTENCES_PER_GROUP) {
      result.push(group);
      continue;
    }

    // Split into chunks of MAX_SENTENCES_PER_GROUP sentences
    for (let i = 0; i < sentences.length; i += MAX_SENTENCES_PER_GROUP) {
      const chunk = sentences.slice(i, i + MAX_SENTENCES_PER_GROUP);
      const text = chunk.join('').trim();
      if (!text) continue;

      // Distribute indices proportionally across sub-groups
      const startRatio = i / sentences.length;
      const endRatio = Math.min((i + MAX_SENTENCES_PER_GROUP) / sentences.length, 1);
      const startIdx = Math.floor(startRatio * group.indices.length);
      const endIdx = Math.ceil(endRatio * group.indices.length);
      const indices = group.indices.slice(startIdx, Math.max(endIdx, startIdx + 1));

      result.push({
        speaker: group.speaker,
        timeStart: i === 0 ? group.timeStart : group.timeEnd,
        timeEnd: group.timeEnd,
        text,
        indices,
      });
    }
  }

  return result;
}

/**
 * Group consecutive same-speaker transcript lines into blocks for display.
 * Breaks into new paragraphs on:
 *  1. Speaker change
 *  2. Time gap ≥ 5 seconds (natural speech pause)
 *  3. More than 5 sentences in a single group (long monologue fallback)
 */
export function groupTranscriptBySpeaker(
  items: { speaker: string; time: string; text: string; originalIndex: number }[]
): TranscriptGroup[] {
  if (items.length === 0) return [];

  const groups: TranscriptGroup[] = [];
  let current: TranscriptGroup = {
    speaker: items[0].speaker,
    timeStart: items[0].time,
    timeEnd: items[0].time,
    text: (items[0].text ?? '').trim(),
    indices: [items[0].originalIndex],
  };

  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const sameSpeaker = item.speaker === current.speaker;
    const timePause = hasTimePause(current.timeEnd, item.time, PAUSE_THRESHOLD_SEC);

    if (sameSpeaker && !timePause) {
      current.timeEnd = item.time;
      current.text = `${current.text} ${(item.text ?? '').trim()}`.trim();
      current.indices.push(item.originalIndex);
    } else {
      groups.push(current);
      current = {
        speaker: item.speaker,
        timeStart: item.time,
        timeEnd: item.time,
        text: (item.text ?? '').trim(),
        indices: [item.originalIndex],
      };
    }
  }
  groups.push(current);
  return splitLongGroups(groups);
}

/** Color palette for diarized speakers. Index 0 = "Me", 1+ = other speakers. */
const SPEAKER_COLORS = [
  { label: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30', dot: 'bg-emerald-500' },   // Me / Speaker 1
  { label: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30', dot: 'bg-blue-500' },                   // Them / Speaker 2
  { label: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30', dot: 'bg-violet-500' },          // Speaker 3
  { label: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', dot: 'bg-amber-500' },              // Speaker 4
  { label: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30', dot: 'bg-rose-500' },                   // Speaker 5
  { label: 'text-cyan-700 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-950/30', dot: 'bg-cyan-500' },                   // Speaker 6
] as const;

/** Map a speaker string to a consistent color index. "You"/"Me" = 0, "Others"/"Them" = 1, "Speaker N" = N-1, etc. */
const speakerColorCache = new Map<string, number>();
let nextColorIndex = 2; // 0=Me, 1=Them, 2+ for diarized speakers

export function getSpeakerColor(speaker: string): typeof SPEAKER_COLORS[number] {
  if (speaker === 'You' || speaker === 'Me') return SPEAKER_COLORS[0];
  if (speaker === 'Others' || speaker === 'Them') return SPEAKER_COLORS[1];

  // Diarized speaker — extract number if present ("Speaker 3" → index 2)
  const match = speaker.match(/Speaker\s*(\d+)/i);
  if (match) {
    const idx = Math.min(parseInt(match[1]) - 1, SPEAKER_COLORS.length - 1);
    return SPEAKER_COLORS[Math.max(0, idx)];
  }

  // Named speaker — assign a consistent color
  if (!speakerColorCache.has(speaker)) {
    speakerColorCache.set(speaker, nextColorIndex % SPEAKER_COLORS.length);
    nextColorIndex++;
  }
  return SPEAKER_COLORS[speakerColorCache.get(speaker)!];
}

/** Get the display label for a speaker. "You" → "Me", "Others" → "Them", "Speaker 1" stays. */
export function getSpeakerDisplayLabel(speaker: string): string {
  if (speaker === 'You') return 'Me';
  if (speaker === 'Others') return 'Them';
  return speaker;
}

export function resetSpeakerColors(): void {
  speakerColorCache.clear();
  nextColorIndex = 2;
}
