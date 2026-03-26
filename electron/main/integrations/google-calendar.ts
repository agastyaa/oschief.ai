/**
 * Google Calendar API — fetch upcoming events.
 * Uses raw HTTP via netFetch for proxy/cert compatibility.
 */
import { netFetch } from '../cloud/net-request'

/** Derive a human-readable name from an email address (e.g., "john.doe@acme.com" → "John Doe"). */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || email
  return local
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

export interface GoogleCalendarAttendee {
  email: string
  name?: string
  responseStatus?: string  // "accepted" | "declined" | "tentative" | "needsAction"
  self?: boolean
}

export interface GoogleCalendarEvent {
  id: string
  title: string
  start: string       // ISO timestamp
  end: string         // ISO timestamp
  joinLink?: string
  location?: string
  description?: string
  isAllDay: boolean
  attendees?: GoogleCalendarAttendee[]
}

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export interface GoogleCalendarFetchRange {
  /** Days before now to include (default 30). */
  daysPast?: number
  /** Days after now to include (default 30). */
  daysAhead?: number
}

/**
 * Fetch calendar events from Google Calendar.
 * Default window: 30 days past through 30 days ahead.
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId = 'primary',
  range: GoogleCalendarFetchRange = {}
): Promise<{ ok: boolean; events: GoogleCalendarEvent[]; error?: string }> {
  const daysPast = range.daysPast ?? 30
  const daysAhead = range.daysAhead ?? 30
  const now = new Date()
  const past = new Date(now.getTime() - daysPast * 24 * 60 * 60 * 1000)
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

  const params = new URLSearchParams({
    timeMin: past.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  })

  const { statusCode, data } = await netFetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  )

  if (statusCode === 401) {
    return { ok: false, events: [], error: 'Token expired — please re-authenticate' }
  }
  if (statusCode !== 200) {
    return { ok: false, events: [], error: `Google Calendar API error: HTTP ${statusCode}` }
  }

  const result = JSON.parse(data)
  const events: GoogleCalendarEvent[] = (result.items || []).map((item: any) => {
    const isAllDay = !!item.start?.date && !item.start?.dateTime
    const start = item.start?.dateTime || item.start?.date || ''
    const end = item.end?.dateTime || item.end?.date || ''

    // Extract meeting link from conferenceData or description
    let joinLink: string | undefined
    if (item.conferenceData?.entryPoints?.length) {
      const videoEntry = item.conferenceData.entryPoints.find(
        (ep: any) => ep.entryPointType === 'video'
      )
      if (videoEntry) joinLink = videoEntry.uri
    }
    if (!joinLink && item.hangoutLink) {
      joinLink = item.hangoutLink
    }
    if (!joinLink) {
      // Try to find meeting URLs in description or location
      const urlPattern = /https?:\/\/[^\s<>"]+(?:zoom\.us|teams\.microsoft|meet\.google|webex)[^\s<>"]+/i
      const descMatch = (item.description || '').match(urlPattern)
      const locMatch = (item.location || '').match(urlPattern)
      joinLink = descMatch?.[0] || locMatch?.[0]
    }

    // Extract attendees — fallback to email prefix when displayName is missing
    const attendees: GoogleCalendarAttendee[] = (item.attendees || [])
      .filter((a: any) => a.email)
      .map((a: any) => ({
        email: a.email,
        name: a.displayName || nameFromEmail(a.email),
        responseStatus: a.responseStatus,
        self: a.self || false,
      }))

    return {
      id: item.id,
      title: item.summary || 'Untitled Event',
      start,
      end,
      joinLink,
      location: item.location,
      description: item.description,
      isAllDay,
      attendees: attendees.length > 0 ? attendees : undefined,
    }
  })

  return { ok: true, events }
}
