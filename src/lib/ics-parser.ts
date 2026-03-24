export interface CalendarAttendee {
  email: string;
  name?: string;
  role?: string;  // e.g. "REQ-PARTICIPANT", "OPT-PARTICIPANT", "CHAIR"
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
  /** Extracted from DESCRIPTION, LOCATION, or URL property (Meet/Zoom/Teams join URL) */
  joinLink?: string;
  /** True when DTSTART is date-only (all-day / full-day block) */
  isAllDay?: boolean;
  /** Synced from provider/ICS vs OSChief-only block */
  source?: "synced" | "local";
  /** Linked note for local blocks */
  noteId?: string | null;
  /** Which connected calendar this event came from (e.g. google, microsoft, ics-xxx) */
  calendarFeedId?: string;
  /** Human-readable calendar name for UI */
  calendarName?: string;
  /** Meeting attendees extracted from ATTENDEE fields, Google/Microsoft API, or ICS */
  attendees?: CalendarAttendee[];
}

// ── Join-link extraction ────────────────────────────────────────────────

/** Known meeting URL patterns — checked first (priority order) */
const MEETING_URL_PATTERNS = [
  /https?:\/\/[^\s<>"']*zoom\.us\/[jw]\/[^\s<>"']*/i,
  /https?:\/\/[^\s<>"']*teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']*/i,
  /https?:\/\/meet\.google\.com\/[^\s<>"']*/i,
  /https?:\/\/[^\s<>"']*webex\.com\/[^\s<>"']*/i,
  /https?:\/\/[^\s<>"']*gotomeeting\.com\/[^\s<>"']*/i,
  /https?:\/\/[^\s<>"']*bluejeans\.com\/[^\s<>"']*/i,
  /https?:\/\/[^\s<>"']*chime\.aws\/[^\s<>"']*/i,
  /https?:\/\/[^\s<>"']*whereby\.com\/[^\s<>"']*/i,
  /https?:\/\/[^\s<>"']*around\.co\/[^\s<>"']*/i,
]

/** Fallback: any URL */
const ANY_URL_REGEX = /https?:\/\/[^\s<>"']+/i

function cleanUrlTail(url: string): string {
  return url.replace(/[)\],;]+$/, '')
}

function extractJoinLink(text: string): string | undefined {
  // Priority: known meeting platforms first
  for (const pattern of MEETING_URL_PATTERNS) {
    const match = text.match(pattern)
    if (match) return cleanUrlTail(match[0])
  }
  // Fallback: any URL
  const match = text.match(ANY_URL_REGEX)
  return match ? cleanUrlTail(match[0]) : undefined
}

// ── RRULE types & parsing ───────────────────────────────────────────────

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

interface RRuleParts {
  freq: Freq
  interval: number
  byDay?: string[]        // ['MO', 'WE', 'FR']
  byMonthDay?: number[]   // [1, 15]
  until?: Date
  count?: number
}

const DAY_NAMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

function parseRRule(rrule: string): RRuleParts | null {
  const parts: Record<string, string> = {}
  for (const segment of rrule.split(';')) {
    const eq = segment.indexOf('=')
    if (eq === -1) continue
    parts[segment.slice(0, eq).toUpperCase()] = segment.slice(eq + 1)
  }
  const freq = parts.FREQ as Freq | undefined
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null
  return {
    freq,
    interval: parts.INTERVAL ? parseInt(parts.INTERVAL, 10) || 1 : 1,
    byDay: parts.BYDAY?.split(',').map(d => d.trim().toUpperCase()),
    byMonthDay: parts.BYMONTHDAY?.split(',').map(Number).filter(n => !isNaN(n)),
    until: parts.UNTIL ? parseICSDate(parts.UNTIL) : undefined,
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : undefined,
  }
}

// ── RRULE expansion ─────────────────────────────────────────────────────

/** Maximum occurrences we'll generate per RRULE (safety cap) */
const MAX_OCCURRENCES_PER_RULE = 1000

function expandRRule(
  dtstart: Date,
  durationMs: number,
  rule: RRuleParts,
  windowStart: Date,
  windowEnd: Date,
): Date[] {
  const effectiveEnd = rule.until && rule.until < windowEnd ? rule.until : windowEnd
  const maxCount = rule.count ?? MAX_OCCURRENCES_PER_RULE

  switch (rule.freq) {
    case 'DAILY':
      return expandDaily(dtstart, rule.interval, effectiveEnd, windowStart, maxCount)
    case 'WEEKLY':
      return rule.byDay && rule.byDay.length > 0
        ? expandWeeklyByDay(dtstart, rule.interval, rule.byDay, effectiveEnd, windowStart, maxCount)
        : expandDaily(dtstart, rule.interval * 7, effectiveEnd, windowStart, maxCount)
    case 'MONTHLY':
      return expandMonthly(dtstart, rule.interval, rule.byMonthDay, effectiveEnd, windowStart, maxCount)
    case 'YEARLY':
      return expandYearly(dtstart, rule.interval, effectiveEnd, windowStart, maxCount)
  }
}

function expandDaily(
  dtstart: Date, intervalDays: number, end: Date, windowStart: Date, maxCount: number,
): Date[] {
  const results: Date[] = []
  let totalCount = 0
  const cursor = new Date(dtstart)
  while (cursor <= end && totalCount < maxCount) {
    totalCount++
    if (cursor >= windowStart) results.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + intervalDays)
  }
  return results
}

function expandWeeklyByDay(
  dtstart: Date, interval: number, byDay: string[], end: Date, windowStart: Date, maxCount: number,
): Date[] {
  const results: Date[] = []
  const dayIndices = byDay
    .map(d => DAY_NAMES.indexOf(d as typeof DAY_NAMES[number]))
    .filter(i => i >= 0)
    .sort((a, b) => a - b)
  if (dayIndices.length === 0) return results

  // Find the start of dtstart's week (Sunday)
  const weekStart = new Date(dtstart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(dtstart.getHours(), dtstart.getMinutes(), dtstart.getSeconds(), dtstart.getMilliseconds())

  let totalCount = 0
  while (weekStart <= end && totalCount < maxCount) {
    for (const dayIdx of dayIndices) {
      const occ = new Date(weekStart)
      occ.setDate(occ.getDate() + dayIdx)
      if (occ < dtstart) continue
      if (occ > end) break
      totalCount++
      if (totalCount > maxCount) break
      if (occ >= windowStart) results.push(new Date(occ))
    }
    weekStart.setDate(weekStart.getDate() + interval * 7)
  }
  return results
}

function expandMonthly(
  dtstart: Date, interval: number, byMonthDay: number[] | undefined, end: Date, windowStart: Date, maxCount: number,
): Date[] {
  const results: Date[] = []
  let totalCount = 0
  const days = byMonthDay && byMonthDay.length > 0 ? byMonthDay : [dtstart.getDate()]
  const cursor = new Date(dtstart)
  // Start from the first day of dtstart's month
  cursor.setDate(1)
  while (cursor <= end && totalCount < maxCount) {
    for (const day of days) {
      const occ = new Date(cursor)
      occ.setDate(day)
      occ.setHours(dtstart.getHours(), dtstart.getMinutes(), dtstart.getSeconds(), dtstart.getMilliseconds())
      // Verify the month didn't overflow (e.g. Feb 31 → Mar 3)
      if (occ.getMonth() !== cursor.getMonth()) continue
      if (occ < dtstart) continue
      if (occ > end) break
      totalCount++
      if (totalCount > maxCount) break
      if (occ >= windowStart) results.push(new Date(occ))
    }
    cursor.setMonth(cursor.getMonth() + interval)
  }
  return results
}

function expandYearly(
  dtstart: Date, interval: number, end: Date, windowStart: Date, maxCount: number,
): Date[] {
  const results: Date[] = []
  let totalCount = 0
  const cursor = new Date(dtstart)
  while (cursor <= end && totalCount < maxCount) {
    totalCount++
    if (cursor >= windowStart) results.push(new Date(cursor))
    cursor.setFullYear(cursor.getFullYear() + interval)
  }
  return results
}

// ── EXDATE matching ─────────────────────────────────────────────────────

function isExcluded(date: Date, exdates: Date[]): boolean {
  const ms = date.getTime()
  return exdates.some(exd => {
    const exMs = exd.getTime()
    // Exact match within 1-second tolerance
    if (Math.abs(ms - exMs) < 1000) return true
    // Date-only comparison (for date-only EXDATE on timed events)
    return (
      date.getFullYear() === exd.getFullYear() &&
      date.getMonth() === exd.getMonth() &&
      date.getDate() === exd.getDate()
    )
  })
}

// ── Main parser ─────────────────────────────────────────────────────────

/** Internal raw event with RRULE metadata */
interface RawEvent {
  id: string
  title: string
  start: Date
  end: Date
  location?: string
  description?: string
  url?: string
  isAllDay: boolean
  rrule?: string
  exdates: Date[]
  recurrenceId?: Date
  attendees?: CalendarAttendee[]
}

/**
 * Parse ICS content string into CalendarEvent array.
 * Recurring events (RRULE) are expanded within the given time window.
 * @param windowStart Defaults to 7 days ago
 * @param windowEnd Defaults to 30 days from now
 */
export function parseICS(
  icsContent: string,
  windowStart?: Date,
  windowEnd?: Date,
): CalendarEvent[] {
  const now = new Date()
  const wStart = windowStart ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const wEnd = windowEnd ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const lines = unfoldLines(icsContent)
  const rawEvents: RawEvent[] = []

  let inEvent = false
  let current: Partial<RawEvent> = {}

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      current = { exdates: [] }
    } else if (line === 'END:VEVENT' && inEvent) {
      inEvent = false
      if (current.title && current.start) {
        rawEvents.push({
          id: current.id || crypto.randomUUID(),
          title: current.title,
          start: current.start,
          end: current.end || current.start,
          location: current.location,
          description: current.description,
          url: current.url,
          isAllDay: current.isAllDay ?? false,
          rrule: current.rrule,
          exdates: current.exdates ?? [],
          recurrenceId: current.recurrenceId,
          attendees: current.attendees,
        })
      }
    } else if (inEvent) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const fullProp = line.slice(0, colonIdx)
      const key = fullProp.split(';')[0].toUpperCase()
      const value = line.slice(colonIdx + 1)
      // Extract TZID from property params (e.g. DTSTART;TZID=America/New_York)
      const tzid = extractTZID(fullProp)

      switch (key) {
        case 'SUMMARY':
          current.title = unescapeICS(value)
          break
        case 'DTSTART': {
          const clean = value.replace(/[^0-9TZ]/g, '')
          current.isAllDay = clean.length <= 8
          current.start = parseICSDate(value, tzid)
          break
        }
        case 'DTEND':
          current.end = parseICSDate(value, tzid)
          break
        case 'LOCATION':
          current.location = unescapeICS(value)
          break
        case 'DESCRIPTION':
          current.description = unescapeICS(value)
          break
        case 'UID':
          current.id = value
          break
        case 'URL':
          current.url = unescapeICS(value)
          break
        case 'RRULE':
          current.rrule = value
          break
        case 'EXDATE':
          if (!current.exdates) current.exdates = []
          // EXDATE can also carry TZID: EXDATE;TZID=America/New_York:20260316T100000
          for (const d of value.split(',')) {
            const trimmed = d.trim()
            if (trimmed) current.exdates.push(parseICSDate(trimmed, tzid))
          }
          break
        case 'RECURRENCE-ID':
          current.recurrenceId = parseICSDate(value, tzid)
          break
        case 'ATTENDEE': {
          // Parse: ATTENDEE;CN=Jane Doe;ROLE=REQ-PARTICIPANT:mailto:jane@acme.com
          const email = value.replace(/^mailto:/i, '').trim().toLowerCase()
          if (email && email.includes('@')) {
            const cnMatch = fullProp.match(/CN=([^;:]+)/i)
            const roleMatch = fullProp.match(/ROLE=([^;:]+)/i)
            if (!current.attendees) current.attendees = []
            current.attendees.push({
              email,
              name: cnMatch ? unescapeICS(cnMatch[1].replace(/^"(.*)"$/, '$1')) : undefined,
              role: roleMatch ? roleMatch[1] : undefined,
            })
          }
          break
        }
        case 'ORGANIZER': {
          // Parse: ORGANIZER;CN=Boss Name:mailto:boss@acme.com
          const orgEmail = value.replace(/^mailto:/i, '').trim().toLowerCase()
          if (orgEmail && orgEmail.includes('@')) {
            const cnMatch = fullProp.match(/CN=([^;:]+)/i)
            if (!current.attendees) current.attendees = []
            current.attendees.push({
              email: orgEmail,
              name: cnMatch ? unescapeICS(cnMatch[1].replace(/^"(.*)"$/, '$1')) : undefined,
              role: 'CHAIR',
            })
          }
          break
        }
      }
    }
  }

  // Separate into buckets
  const regular: RawEvent[] = []
  const recurring: RawEvent[] = []
  const modifications = new Map<string, Map<number, RawEvent>>()  // uid -> recurrenceIdMs -> modifiedEvent

  for (const evt of rawEvents) {
    if (evt.recurrenceId) {
      // Modified instance of a recurring event — keyed by UID
      const uid = evt.id.replace(/_\d+$/, '')  // strip any suffix
      if (!modifications.has(uid)) modifications.set(uid, new Map())
      modifications.get(uid)!.set(evt.recurrenceId.getTime(), evt)
    } else if (evt.rrule) {
      recurring.push(evt)
    } else {
      regular.push(evt)
    }
  }

  // Build final event list
  const events: CalendarEvent[] = []

  // Regular (non-recurring) events — pass through
  for (const evt of regular) {
    events.push(buildCalendarEvent(evt))
  }

  // Expand recurring events
  for (const evt of recurring) {
    const rule = parseRRule(evt.rrule!)
    if (!rule) {
      // Unparseable RRULE — treat as regular event
      events.push(buildCalendarEvent(evt))
      continue
    }

    const durationMs = evt.end.getTime() - evt.start.getTime()
    const occurrences = expandRRule(evt.start, durationMs, rule, wStart, wEnd)

    for (const occStart of occurrences) {
      // Skip cancelled occurrences (EXDATE)
      if (isExcluded(occStart, evt.exdates)) continue

      // Check for modified instance (RECURRENCE-ID)
      const mods = modifications.get(evt.id)
      const mod = mods?.get(occStart.getTime())
      if (mod) {
        events.push(buildCalendarEvent(mod, `${evt.id}_${occStart.getTime()}`))
      } else {
        const occEnd = new Date(occStart.getTime() + durationMs)
        events.push({
          id: `${evt.id}_${occStart.getTime()}`,
          title: evt.title,
          start: occStart,
          end: occEnd,
          location: evt.location,
          description: evt.description,
          joinLink: extractJoinLink(evt.description ?? '') || extractJoinLink(evt.location ?? '') || extractJoinLink(evt.url ?? ''),
          isAllDay: evt.isAllDay,
          attendees: evt.attendees,
        })
      }
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function buildCalendarEvent(evt: RawEvent, idOverride?: string): CalendarEvent {
  const desc = evt.description ?? ''
  const loc = evt.location ?? ''
  const url = evt.url ?? ''
  return {
    id: idOverride ?? evt.id,
    title: evt.title,
    start: evt.start,
    end: evt.end,
    location: evt.location,
    description: evt.description,
    joinLink: extractJoinLink(desc) || extractJoinLink(loc) || extractJoinLink(url),
    isAllDay: evt.isAllDay,
    attendees: evt.attendees,
  }
}

// ── Utilities ───────────────────────────────────────────────────────────

function unfoldLines(text: string): string[] {
  // ICS spec: lines starting with space/tab are continuations
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

/**
 * Parse an ICS date string into a JS Date.
 * Supports: 20250101T120000Z (UTC), 20250101T120000 (local or with TZID), 20250101 (date-only).
 * When a tzid is provided, the time is interpreted in that timezone and converted to proper UTC.
 */
export function parseICSDate(value: string, tzid?: string): Date {
  // Handle formats: 20250101T120000Z or 20250101T120000 or 20250101
  const clean = value.replace(/[^0-9TZ]/g, '')
  const y = parseInt(clean.slice(0, 4))
  const m = parseInt(clean.slice(4, 6)) - 1
  const d = parseInt(clean.slice(6, 8))
  if (clean.length <= 8) return new Date(y, m, d)
  const h = parseInt(clean.slice(9, 11))
  const min = parseInt(clean.slice(11, 13))
  const s = parseInt(clean.slice(13, 15)) || 0
  if (clean.endsWith('Z')) return new Date(Date.UTC(y, m, d, h, min, s))

  // If we have a TZID, convert from that timezone to proper local time
  if (tzid) {
    const iana = resolveTimezone(tzid)
    if (iana) return dateFromTimezone(y, m, d, h, min, s, iana)
  }

  // No timezone info → treat as local time (matches pre-existing behavior)
  return new Date(y, m, d, h, min, s)
}

/**
 * Convert a "wall clock" time in a named IANA timezone to a JS Date (which is always UTC internally).
 * Uses Intl.DateTimeFormat to discover the UTC offset for the given timezone at the given moment.
 */
function dateFromTimezone(y: number, m: number, d: number, h: number, min: number, s: number, iana: string): Date {
  try {
    // Build a rough UTC estimate so we can query the correct offset (handles DST transitions)
    const roughUtc = Date.UTC(y, m, d, h, min, s)

    // Use Intl.DateTimeFormat to get the offset of the target timezone at that moment
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false,
    })

    // Format the rough UTC time in the target timezone to get the parts
    const parts = fmt.formatToParts(new Date(roughUtc))
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0')

    const tzY = get('year')
    const tzM = get('month') - 1
    const tzD = get('day')
    let tzH = get('hour')
    if (tzH === 24) tzH = 0 // midnight edge case in some locales
    const tzMin = get('minute')
    const tzS = get('second')

    // The offset is: what we wanted (wall clock) minus what the timezone shows for roughUtc
    // offsetMs = (desired wall time) - (what roughUtc looks like in the timezone)
    const desiredMs = Date.UTC(y, m, d, h, min, s)
    const tzShowsMs = Date.UTC(tzY, tzM, tzD, tzH, tzMin, tzS)
    const offsetMs = desiredMs - tzShowsMs

    // Correct UTC time = roughUtc + offset
    // (because roughUtc is h:min:s UTC, but we want h:min:s in the *target* timezone)
    return new Date(roughUtc + offsetMs)
  } catch {
    // If Intl fails (invalid timezone), fall back to local time
    return new Date(y, m, d, h, min, s)
  }
}

// ── Timezone resolution ─────────────────────────────────────────────────

/**
 * Windows timezone names → IANA mapping.
 * Outlook / Exchange ICS feeds often use Windows-style names like "Eastern Standard Time".
 */
const WINDOWS_TO_IANA: Record<string, string> = {
  'eastern standard time': 'America/New_York',
  'us eastern standard time': 'America/Indianapolis',
  'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver',
  'us mountain standard time': 'America/Phoenix',
  'pacific standard time': 'America/Los_Angeles',
  'alaskan standard time': 'America/Anchorage',
  'hawaiian standard time': 'Pacific/Honolulu',
  'atlantic standard time': 'America/Halifax',
  'newfoundland standard time': 'America/St_Johns',
  'greenwich standard time': 'Atlantic/Reykjavik',
  'gmt standard time': 'Europe/London',
  'w. europe standard time': 'Europe/Berlin',
  'romance standard time': 'Europe/Paris',
  'central european standard time': 'Europe/Warsaw',
  'central europe standard time': 'Europe/Budapest',
  'e. europe standard time': 'Europe/Chisinau',
  'fle standard time': 'Europe/Kiev',
  'gtb standard time': 'Europe/Bucharest',
  'russian standard time': 'Europe/Moscow',
  'turkey standard time': 'Europe/Istanbul',
  'israel standard time': 'Asia/Jerusalem',
  'arabic standard time': 'Asia/Baghdad',
  'arab standard time': 'Asia/Riyadh',
  'iran standard time': 'Asia/Tehran',
  'arabian standard time': 'Asia/Dubai',
  'pakistan standard time': 'Asia/Karachi',
  'india standard time': 'Asia/Kolkata',
  'sri lanka standard time': 'Asia/Colombo',
  'nepal standard time': 'Asia/Kathmandu',
  'central asia standard time': 'Asia/Almaty',
  'bangladesh standard time': 'Asia/Dhaka',
  'se asia standard time': 'Asia/Bangkok',
  'china standard time': 'Asia/Shanghai',
  'singapore standard time': 'Asia/Singapore',
  'taipei standard time': 'Asia/Taipei',
  'w. australia standard time': 'Australia/Perth',
  'tokyo standard time': 'Asia/Tokyo',
  'korea standard time': 'Asia/Seoul',
  'cen. australia standard time': 'Australia/Adelaide',
  'aus central standard time': 'Australia/Darwin',
  'e. australia standard time': 'Australia/Brisbane',
  'aus eastern standard time': 'Australia/Sydney',
  'new zealand standard time': 'Pacific/Auckland',
  'fiji standard time': 'Pacific/Fiji',
  'tonga standard time': 'Pacific/Tongatapu',
  'samoa standard time': 'Pacific/Apia',
  'utc': 'UTC',
  'sa pacific standard time': 'America/Bogota',
  'sa eastern standard time': 'America/Cayenne',
  'sa western standard time': 'America/La_Paz',
  'e. south america standard time': 'America/Sao_Paulo',
  'argentina standard time': 'America/Buenos_Aires',
  'venezuela standard time': 'America/Caracas',
  'mexico standard time': 'America/Mexico_City',
  'canada central standard time': 'America/Regina',
  'south africa standard time': 'Africa/Johannesburg',
  'egypt standard time': 'Africa/Cairo',
  'e. africa standard time': 'Africa/Nairobi',
  'w. central africa standard time': 'Africa/Lagos',
}

/**
 * Resolve a timezone identifier to a valid IANA timezone.
 * Handles IANA names directly, Windows-style names, and common aliases.
 */
function resolveTimezone(tzid: string): string | null {
  if (!tzid) return null
  const cleaned = tzid.replace(/^"(.*)"$/, '$1').trim()
  if (!cleaned) return null

  // Check if it's already a valid IANA timezone by trying Intl
  try {
    Intl.DateTimeFormat(undefined, { timeZone: cleaned })
    return cleaned
  } catch {
    // Not a valid IANA name — try Windows mapping
  }

  const lower = cleaned.toLowerCase()
  const mapped = WINDOWS_TO_IANA[lower]
  if (mapped) return mapped

  // Try partial match (some feeds use abbreviated forms)
  for (const [winName, iana] of Object.entries(WINDOWS_TO_IANA)) {
    if (lower.includes(winName) || winName.includes(lower)) return iana
  }

  return null
}

/**
 * Extract TZID parameter from a property string like "DTSTART;TZID=America/New_York"
 */
function extractTZID(propString: string): string | undefined {
  const match = propString.match(/TZID=([^;:]+)/i)
  return match ? match[1] : undefined
}

function unescapeICS(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}
