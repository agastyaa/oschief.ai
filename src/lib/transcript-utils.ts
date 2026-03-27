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
    text: items[0].text.trim(),
    indices: [items[0].originalIndex],
  };

  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const sameSpeaker = item.speaker === current.speaker;
    const timePause = hasTimePause(current.timeEnd, item.time, PAUSE_THRESHOLD_SEC);

    if (sameSpeaker && !timePause) {
      current.timeEnd = item.time;
      current.text = `${current.text} ${item.text.trim()}`.trim();
      current.indices.push(item.originalIndex);
    } else {
      groups.push(current);
      current = {
        speaker: item.speaker,
        timeStart: item.time,
        timeEnd: item.time,
        text: item.text.trim(),
        indices: [item.originalIndex],
      };
    }
  }
  groups.push(current);
  return splitLongGroups(groups);
}
