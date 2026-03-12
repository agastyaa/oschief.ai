/**
 * Google Calendar API — fetch upcoming events.
 * Uses raw HTTP via netFetch for proxy/cert compatibility.
 */
import { netFetch } from '../cloud/net-request'

export interface GoogleCalendarEvent {
  id: string
  title: string
  start: string       // ISO timestamp
  end: string         // ISO timestamp
  joinLink?: string
  location?: string
  description?: string
  isAllDay: boolean
}

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

/**
 * Fetch upcoming calendar events from Google Calendar.
 * Returns events from now to 7 days ahead.
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId = 'primary',
  daysAhead = 7
): Promise<{ ok: boolean; events: GoogleCalendarEvent[]; error?: string }> {
  const now = new Date()
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
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

    return {
      id: item.id,
      title: item.summary || 'Untitled Event',
      start,
      end,
      joinLink,
      location: item.location,
      description: item.description,
      isAllDay,
    }
  })

  return { ok: true, events }
}
