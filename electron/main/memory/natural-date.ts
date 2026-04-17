/**
 * P2 — natural-language due-date extraction.
 *
 * LLM extractors return `dueDate` as raw human-readable strings: "by Friday",
 * "EOW", "ASAP", "tomorrow", "next week", "2026-05-01". The commitment store
 * needs an ISO date string to sort, filter, and surface overdue state. This
 * module parses the common patterns deterministically so we never hit the LLM
 * for something as trivial as "this Friday."
 *
 * Covered forms (case-insensitive, tolerant of surrounding prepositions):
 *   - "ASAP", "immediately"               → today
 *   - "today"                             → today
 *   - "tomorrow"                          → today + 1d
 *   - "EOD", "end of day"                 → today
 *   - "EOW", "end of week", "by EOW"      → Friday of this week
 *   - "next week"                         → Monday of next week
 *   - "by Friday", "Friday", "this Friday"→ next Friday (today if already Friday)
 *   - "next Friday"                       → Friday of next week
 *   - "in N days"                         → today + N days
 *   - "in N weeks"                        → today + N*7 days
 *   - "MM/DD", "M/D"                      → that date in the current year
 *   - "YYYY-MM-DD"                        → passthrough after validation
 *   - "Month Day[, Year]"                 → parsed (March 20, 2026 / Mar 20)
 *
 * Returns `null` when the input is empty, "null", "none", or unparseable.
 * Returns ISO date `YYYY-MM-DD` (no time component) on success.
 *
 * All functions accept an optional `now` for deterministic testing — defaults
 * to the current date.
 */

const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const

const MONTH_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const r = startOfDay(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Returns the next occurrence of `weekday` (0=Sun..6=Sat). If today is that
 *  weekday, returns today. */
function nextWeekday(now: Date, weekday: number): Date {
  const today = startOfDay(now)
  const delta = (weekday - today.getDay() + 7) % 7
  return addDays(today, delta)
}

function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^by\s+/, '')
    .replace(/^due\s+/, '')
    .replace(/^on\s+/, '')
    .replace(/[.!?]+$/, '')
    .trim()
}

/**
 * Parse a natural-language due-date phrase. Returns ISO date `YYYY-MM-DD` or
 * null when unparseable. Never throws.
 */
export function parseNaturalDate(input: unknown, now: Date = new Date()): string | null {
  if (!input || typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower === 'null' || lower === 'none' || lower === 'unknown' || lower === 'n/a') return null

  // Already ISO?
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const [_, y, m, d] = isoMatch
    const mn = Number(m), dn = Number(d)
    if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return null
    const dt = new Date(Number(y), mn - 1, dn)
    if (Number.isNaN(dt.getTime())) return null
    // Reject JS overflow (e.g., Feb 31 → Mar 3). The ISO input must match.
    if (dt.getMonth() !== mn - 1 || dt.getDate() !== dn) return null
    return toIso(dt)
  }

  const text = normalize(raw)

  // Relative: today/tomorrow/yesterday
  if (text === 'today' || text === 'eod' || text === 'end of day' || text === 'end-of-day') {
    return toIso(startOfDay(now))
  }
  if (text === 'tomorrow' || text === 'tmrw' || text === 'tmr') {
    return toIso(addDays(now, 1))
  }
  if (text === 'yesterday') {
    return toIso(addDays(now, -1))
  }
  if (text === 'asap' || text === 'immediately' || text === 'right away' || text === 'urgent') {
    return toIso(startOfDay(now))
  }

  // End of week / next week
  if (text === 'eow' || text === 'end of week' || text === 'end-of-week' || text === 'this week') {
    // Friday = 5 on JS weekday index
    return toIso(nextWeekday(now, 5))
  }
  if (text === 'next week') {
    // Monday of next week
    const today = startOfDay(now)
    const offset = ((8 - today.getDay()) % 7) || 7
    return toIso(addDays(today, offset))
  }
  if (text === 'next month') {
    const d = startOfDay(now)
    return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  // in N days / weeks
  const inDaysMatch = text.match(/^in\s+(\d+)\s+days?$/)
  if (inDaysMatch) return toIso(addDays(now, Number(inDaysMatch[1])))
  const inWeeksMatch = text.match(/^in\s+(\d+)\s+weeks?$/)
  if (inWeeksMatch) return toIso(addDays(now, Number(inWeeksMatch[1]) * 7))

  // weekday names: "friday", "next friday", "this friday"
  const weekdayMatch = text.match(/^(?:next\s+|this\s+)?([a-z]+)$/)
  if (weekdayMatch) {
    const idx = WEEKDAYS.findIndex((w) => w === weekdayMatch[1])
    if (idx >= 0) {
      if (text.startsWith('next ')) {
        // Monday if today is <= Monday, else Monday+7
        const next = nextWeekday(now, idx)
        // If today IS that weekday, "next X" means one week later
        if (next.getTime() === startOfDay(now).getTime()) return toIso(addDays(next, 7))
        // If "next X" but the next occurrence is within this week, bump one week
        const delta = (idx - now.getDay() + 7) % 7
        if (delta > 0 && delta < 7) return toIso(addDays(next, 7))
        return toIso(next)
      }
      return toIso(nextWeekday(now, idx))
    }
  }

  // MM/DD or M/D (assume current year; if that's already past, next year)
  const slashMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/)
  if (slashMatch) {
    const m = Number(slashMatch[1])
    const d = Number(slashMatch[2])
    let y = slashMatch[3] ? Number(slashMatch[3]) : now.getFullYear()
    if (y < 100) y += 2000
    if (m < 1 || m > 12 || d < 1 || d > 31) return null
    const candidate = new Date(y, m - 1, d)
    if (!slashMatch[3] && candidate < startOfDay(now)) {
      candidate.setFullYear(y + 1)
    }
    return toIso(candidate)
  }

  // "March 20" / "March 20 2026" / "Mar 20"
  const monthDayMatch = text.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/)
  if (monthDayMatch) {
    const monthName = monthDayMatch[1]
    const day = Number(monthDayMatch[2])
    const yr = monthDayMatch[3] ? Number(monthDayMatch[3]) : now.getFullYear()
    let monthIdx = MONTH_NAMES.findIndex((m) => m === monthName)
    if (monthIdx < 0) monthIdx = MONTH_SHORT.findIndex((m) => m === monthName)
    if (monthIdx >= 0 && day >= 1 && day <= 31) {
      const candidate = new Date(yr, monthIdx, day)
      if (!monthDayMatch[3] && candidate < startOfDay(now)) {
        candidate.setFullYear(yr + 1)
      }
      return toIso(candidate)
    }
  }

  return null
}
