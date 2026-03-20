/** Matches Settings / Onboarding account stored in localStorage. */
export const ACCOUNT_LS_KEY = "syag-account";

export interface SyagAccount {
  name?: string;
  email?: string;
  role?: string;
  roleId?: string;
  company?: string;
}

export function loadAccountFromStorage(): SyagAccount {
  try {
    const raw = localStorage.getItem(ACCOUNT_LS_KEY);
    if (raw) return JSON.parse(raw) as SyagAccount;
  } catch {
    /* ignore */
  }
  return { name: "", email: "" };
}

/** Lowercase + strip combining marks so "José" matches "Jose". */
export function normalizeForNameCompare(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * True if the user's display name appears in `text` with exact word boundaries
 * (case-insensitive). Supports multi-word names as a phrase.
 */
export function accountNameAppearsInText(nameTrimmed: string, text: string): boolean {
  const t = nameTrimmed.trim();
  if (t.length < 2) return false;
  const words = t.split(/\s+/).filter(Boolean);
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const body = escaped.length === 1 ? escaped[0] : escaped.join("\\s+");
  try {
    return new RegExp(`\\b${body}\\b`, "i").test(text);
  } catch {
    return false;
  }
}

/** Last N transcript lines as plain text for LLM context. */
export function formatRecentTranscriptForMention(
  lines: { speaker: string; time: string; text: string }[],
  maxLines = 12
): string {
  return lines
    .slice(-maxLines)
    .map((l) => `[${l.speaker}] ${l.text}`)
    .join("\n");
}
