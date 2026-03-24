/**
 * Microsoft Graph Calendar API — fetch upcoming events.
 */
import { netFetch } from '../cloud/net-request'

const GRAPH_CALENDAR_URL = 'https://graph.microsoft.com/v1.0/me/calendarview'

export interface MicrosoftCalendarAttendee {
  email: string
  name?: string
  type?: string  // "required" | "optional" | "resource"
  responseStatus?: string
}

export interface MicrosoftCalendarEvent {
  id: string
  title: string
  start: string      // ISO datetime
  end: string        // ISO datetime
  joinLink?: string
  location?: string
  isAllDay: boolean
  attendees?: MicrosoftCalendarAttendee[]
}

export interface MicrosoftCalendarFetchRange {
  daysPast?: number
  daysAhead?: number
}

/**
 * Fetch calendar events from Microsoft Graph API.
 * Default: 30 days past through 30 days ahead.
 */
export async function fetchMicrosoftCalendarEvents(
  accessToken: string,
  range: MicrosoftCalendarFetchRange = {}
): Promise<MicrosoftCalendarEvent[]> {
  const daysPast = range.daysPast ?? 30
  const daysAhead = range.daysAhead ?? 30
  const now = new Date()
  const start = new Date(now.getTime() - daysPast * 24 * 60 * 60 * 1000)
  const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

  const url = `${GRAPH_CALENDAR_URL}?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=100&$orderby=start/dateTime&$select=id,subject,start,end,location,isAllDay,onlineMeeting,onlineMeetingUrl,body,attendees`

  const { statusCode, data } = await netFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (statusCode !== 200) {
    throw new Error(`Microsoft Calendar API error (${statusCode}): ${data.slice(0, 200)}`)
  }

  const result = JSON.parse(data)
  const events: MicrosoftCalendarEvent[] = []

  for (const evt of result.value || []) {
    const joinLink = extractJoinLink(evt)
    // Extract attendees from Microsoft Graph response
    const attendees: MicrosoftCalendarAttendee[] = (evt.attendees || [])
      .filter((a: any) => a.emailAddress?.address)
      .map((a: any) => ({
        email: a.emailAddress.address,
        name: a.emailAddress.name || undefined,
        type: a.type || undefined,
        responseStatus: a.status?.response || undefined,
      }))

    events.push({
      id: evt.id,
      title: evt.subject || 'Untitled',
      start: evt.start?.dateTime ? new Date(evt.start.dateTime + 'Z').toISOString() : new Date().toISOString(),
      end: evt.end?.dateTime ? new Date(evt.end.dateTime + 'Z').toISOString() : new Date().toISOString(),
      joinLink,
      location: evt.location?.displayName || undefined,
      isAllDay: evt.isAllDay || false,
      attendees: attendees.length > 0 ? attendees : undefined,
    })
  }

  return events
}

/** Extract Teams/Zoom/Meet join link from event data */
function extractJoinLink(evt: any): string | undefined {
  // Primary: Teams online meeting URL
  if (evt.onlineMeeting?.joinUrl) return evt.onlineMeeting.joinUrl
  if (evt.onlineMeetingUrl) return evt.onlineMeetingUrl

  // Fallback: scan location and body for meeting URLs
  const searchText = [
    evt.location?.displayName || '',
    evt.body?.content || '',
  ].join(' ')

  const patterns = [
    /https?:\/\/[^\s<>"']*teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']*/i,
    /https?:\/\/[^\s<>"']*zoom\.us\/j\/[^\s<>"']*/i,
    /https?:\/\/meet\.google\.com\/[^\s<>"']*/i,
    /https?:\/\/[^\s<>"']*webex\.com\/[^\s<>"']*/i,
  ]

  for (const pattern of patterns) {
    const match = searchText.match(pattern)
    if (match) return match[0]
  }

  return undefined
}
