/**
 * Derive a meaningful meeting title from transcript/notes content.
 * Used both mid-recording (auto-populate working title) and post-summary (fallback).
 */

const GENERIC_TITLES = new Set([
  "meeting notes",
  "this meeting",
  "untitled",
  "untitled meeting",
  "new note",
  "",
]);

export function isGenericTitle(title: string): boolean {
  const normalized = (title || "").toLowerCase().trim();
  if (!normalized) return true;
  if (GENERIC_TITLES.has(normalized)) return true;
  // Auto-generated date-based titles like "Meeting — Apr 15, 10:30 AM"
  if (/^meeting\s*[—-]\s*\w{3}\s+\d{1,2}/i.test(normalized)) return true;
  return false;
}

/**
 * Extract first substantive clause from a block of text.
 * Returns null if no suitable title can be derived.
 */
export function deriveTitleFromText(text: string, options?: { minLen?: number; maxLen?: number }): string | null {
  const minLen = options?.minLen ?? 5;
  const maxLen = options?.maxLen ?? 60;
  if (!text || text.length < minLen) return null;

  // Split on sentence boundaries including newlines
  const clauses = text.split(/[;.!?,\n]/).filter((c) => c.trim().length > 0);
  if (clauses.length === 0) return null;

  const first = clauses[0].trim();
  if (first.length >= minLen && first.length <= maxLen) return first;

  // Too long — truncate at word boundary
  if (first.length > maxLen) {
    const truncated = first.slice(0, maxLen - 3).replace(/\s+\S*$/, "").trim();
    if (truncated.length >= minLen) return truncated;
  }

  return null;
}

/**
 * Derive a working title from transcript lines during recording.
 * Requires at least ~150 chars of content to make a meaningful guess.
 */
export function deriveTitleFromTranscript(
  transcript: Array<{ speaker: string; time: string; text: string }>,
): string | null {
  if (!transcript || transcript.length === 0) return null;

  // Concatenate all transcript text
  const allText = transcript.map((l) => l.text).join(" ").trim();
  if (allText.length < 150) return null; // Not enough content yet

  // Prefer the first speaker's opening 1-2 sentences — usually sets the topic
  const firstSpeakerLines = transcript.filter((l) => l.speaker === transcript[0].speaker);
  const openingText = firstSpeakerLines.slice(0, 3).map((l) => l.text).join(" ").trim();
  const fromOpening = deriveTitleFromText(openingText);
  if (fromOpening) return fromOpening;

  // Fallback: first substantive clause from all transcript
  return deriveTitleFromText(allText);
}

/**
 * Generate a date-based fallback title when nothing else works.
 * Always returns a meaningful string, never empty.
 */
export function generateDateTitle(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `Meeting — ${dateStr}, ${timeStr}`;
}

/**
 * Derive title from calendar event when the meeting overlaps with a scheduled event.
 */
export function deriveTitleFromCalendar(
  calendarEvents: Array<{ title: string; start: number; end: number }>,
  meetingStartMs: number,
): string | null {
  const match = calendarEvents.find(
    (evt) => meetingStartMs >= evt.start - 5 * 60 * 1000 && meetingStartMs <= evt.end + 5 * 60 * 1000,
  );
  if (match && match.title && !isGenericTitle(match.title)) return match.title;
  return null;
}
