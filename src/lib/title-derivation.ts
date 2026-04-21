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

// Pleasantries / greetings that show up as the first spoken clause but never
// describe what the meeting is actually about. Skip past them when deriving
// a title from transcript text so you don't end up with titles like "Yeah we
// did so both mobile and" or "Hey how are you doing today."
//
// Two tiers:
//   FULL_PREFIXES  — clause STARTS with this phrase + continues with any
//     words; e.g. "Hey how are you doing today" is all pleasantry regardless
//     of what follows.
//   BARE_FILLERS   — only a pleasantry when the clause is essentially JUST
//     this word ("Um." / "So" / "Yeah"). When followed by substantive
//     content ("So let's talk about the roadmap") the clause is real — do
//     NOT skip it. Heuristic: bare filler = clause <= 3 words AND first
//     word is in the filler set.
const FULL_PREFIXES: readonly RegExp[] = [
  /^(hi|hey|hello|yo)\b/i,
  /^(good\s+(morning|afternoon|evening))\b/i,
  /^(how('?s| are|'?s it))\b/i,
  /^(thanks for|thank you for)\b/i,
  /^(nice to (meet|see))\b/i,
  /^(can you hear me|am i audible)\b/i,
];
const BARE_FILLER_WORDS = new Set([
  'yeah', 'yep', 'yes', 'no', 'ok', 'okay', 'sure', 'right',
  'alright', 'cool', 'so', 'um', 'uh', 'well',
]);

function isPleasantry(clause: string): boolean {
  const normalized = clause.trim();
  if (normalized.length === 0) return true;
  if (FULL_PREFIXES.some((rx) => rx.test(normalized))) return true;
  // Short clauses starting with a filler word are skipped. Long clauses
  // starting with one (e.g. "So let's walk through the roadmap") are kept.
  const words = normalized.split(/\s+/);
  if (words.length <= 3) {
    const first = words[0].toLowerCase().replace(/[^a-z]/g, '');
    if (BARE_FILLER_WORDS.has(first)) return true;
  }
  return false;
}

/**
 * Strip leading filler words ("Yeah we did so ...", "Um so the form ...") so
 * a substantive clause's title doesn't lead with conversational filler. Only
 * the first 1-3 filler words are stripped; the rest of the clause is kept
 * intact.
 */
function stripLeadingFillers(clause: string): string {
  let cur = clause.trim();
  for (let i = 0; i < 3; i++) {
    const m = cur.match(/^([A-Za-z']+)(\s+)(.+)$/);
    if (!m) break;
    const first = m[1].toLowerCase().replace(/[^a-z]/g, '');
    if (!BARE_FILLER_WORDS.has(first)) break;
    cur = m[3].trim();
  }
  return cur || clause.trim();
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
  const clauses = text.split(/[;.!?,\n]/).map((c) => c.trim()).filter((c) => c.length > 0);
  if (clauses.length === 0) return null;

  // Skip past pleasantry openers — they never describe the meeting topic.
  // "Hey how are you today, so let's talk about the roadmap" → "so let's
  // talk about the roadmap" is a better title than "Hey how are you today".
  // Then strip any leading filler words ("so", "um", "yeah") so the title
  // starts on real content.
  let idx = 0;
  while (idx < clauses.length && isPleasantry(clauses[idx])) idx++;
  const rawCandidate = (clauses[idx] ?? clauses[0]).trim();
  const candidate = stripLeadingFillers(rawCandidate);

  if (candidate.length >= minLen && candidate.length <= maxLen) return candidate;

  // Too long — truncate at word boundary
  if (candidate.length > maxLen) {
    const truncated = candidate.slice(0, maxLen - 3).replace(/\s+\S*$/, "").trim();
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
