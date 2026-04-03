/**
 * Google Gmail API — fetch recent email threads with people in the graph.
 *
 * Used by prep briefs to surface "Jane emailed you yesterday about X"
 * and by OSChief Chat for cross-channel context.
 *
 * Only reads — never sends, deletes, or modifies emails.
 */

import { netFetch } from '../cloud/net-request'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export interface GmailThread {
  id: string
  subject: string
  snippet: string
  from: string
  date: string
  messageCount: number
  toAddresses?: string[]
}

/**
 * Fetch recent email threads involving specific people.
 * @param accessToken Google OAuth access token (must have gmail.readonly scope)
 * @param emailAddresses Filter to threads involving these addresses
 * @param maxResults Max threads to return (default 10)
 */
export async function fetchGmailThreads(
  accessToken: string,
  emailAddresses: string[],
  maxResults = 10
): Promise<{ ok: boolean; threads: GmailThread[]; error?: string }> {
  try {
    // Build search query: emails from/to any of the specified addresses
    const query = emailAddresses.length > 0
      ? emailAddresses.map(e => `from:${e} OR to:${e}`).join(' OR ')
      : 'newer_than:7d'

    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults),
    })

    const { statusCode, data } = await netFetch(
      `${GMAIL_API}/threads?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (statusCode === 401) {
      return { ok: false, threads: [], error: 'Gmail token expired — please re-authenticate Google in Settings' }
    }
    if (statusCode === 403) {
      return { ok: false, threads: [], error: 'Gmail access not granted — reconnect Google with email permissions' }
    }
    if (statusCode !== 200) {
      return { ok: false, threads: [], error: `Gmail API error: HTTP ${statusCode}` }
    }

    let result: any
    try { result = JSON.parse(data) } catch { return { ok: false, threads: [], error: 'Malformed Gmail API response' } }
    if (!result.threads?.length) return { ok: true, threads: [] }

    // Fetch thread details (subject, snippet, from) for top threads
    const threads: GmailThread[] = []
    for (const t of result.threads.slice(0, maxResults)) {
      try {
        const detail = await fetchThreadDetail(accessToken, t.id)
        if (detail) threads.push(detail)
      } catch {
        // Skip failed thread fetches
      }
    }

    return { ok: true, threads }
  } catch (err: any) {
    console.error('[google-gmail] Fetch failed:', err)
    return { ok: false, threads: [], error: err.message }
  }
}

async function fetchThreadDetail(accessToken: string, threadId: string): Promise<GmailThread | null> {
  const { statusCode, data } = await netFetch(
    `${GMAIL_API}/threads/${threadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (statusCode !== 200) return null

  let thread: any
  try { thread = JSON.parse(data) } catch { return null }
  const firstMessage = thread.messages?.[0]
  if (!firstMessage) return null

  const headers = firstMessage.payload?.headers || []
  const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)'
  const from = headers.find((h: any) => h.name === 'From')?.value || ''
  const date = headers.find((h: any) => h.name === 'Date')?.value || ''

  return {
    id: threadId,
    subject,
    snippet: thread.messages[thread.messages.length - 1]?.snippet || firstMessage.snippet || '',
    from,
    date,
    messageCount: thread.messages?.length || 1,
  }
}

/**
 * Fetch all recent Gmail threads (not filtered by email address).
 * Used by mail-store.ts for bulk sync into local cache.
 * @param accessToken Google OAuth access token
 * @param daysPast Number of days to look back (default 14)
 * @param maxResults Max threads to return (default 50)
 */
export async function fetchAllRecentGmailThreads(
  accessToken: string,
  daysPast = 14,
  maxResults = 50
): Promise<{ ok: boolean; threads: GmailThread[]; error?: string }> {
  try {
    const params = new URLSearchParams({
      q: `newer_than:${daysPast}d`,
      maxResults: String(maxResults),
    })

    const { statusCode, data } = await netFetch(
      `${GMAIL_API}/threads?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (statusCode === 401) {
      return { ok: false, threads: [], error: 'Gmail token expired — please re-authenticate Google in Settings' }
    }
    if (statusCode === 403) {
      return { ok: false, threads: [], error: 'Gmail access not granted — reconnect Google with email permissions' }
    }
    if (statusCode !== 200) {
      return { ok: false, threads: [], error: `Gmail API error: HTTP ${statusCode}` }
    }

    let result: any
    try { result = JSON.parse(data) } catch { return { ok: false, threads: [], error: 'Malformed Gmail API response' } }
    if (!result.threads?.length) return { ok: true, threads: [] }

    const threads: GmailThread[] = []
    for (const t of result.threads.slice(0, maxResults)) {
      try {
        const detail = await fetchThreadDetailFull(accessToken, t.id)
        if (detail) threads.push(detail)
      } catch {
        // Skip failed thread fetches
      }
    }

    return { ok: true, threads }
  } catch (err: any) {
    console.error('[google-gmail] Bulk fetch failed:', err)
    return { ok: false, threads: [], error: err.message }
  }
}

/**
 * Fetch thread detail including To addresses (for person matching).
 */
async function fetchThreadDetailFull(accessToken: string, threadId: string): Promise<GmailThread | null> {
  const { statusCode, data } = await netFetch(
    `${GMAIL_API}/threads/${threadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=To`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (statusCode !== 200) return null

  let thread: any
  try { thread = JSON.parse(data) } catch { return null }
  const firstMessage = thread.messages?.[0]
  if (!firstMessage) return null

  const headers = firstMessage.payload?.headers || []
  const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(no subject)'
  const from = headers.find((h: any) => h.name === 'From')?.value || ''
  const date = headers.find((h: any) => h.name === 'Date')?.value || ''
  const to = headers.find((h: any) => h.name === 'To')?.value || ''

  // Parse To addresses
  const toAddresses = to.split(',').map((a: string) => {
    const match = a.match(/<([^>]+)>/)
    return match ? match[1].trim() : a.trim()
  }).filter(Boolean)

  return {
    id: threadId,
    subject,
    snippet: thread.messages[thread.messages.length - 1]?.snippet || firstMessage.snippet || '',
    from,
    date,
    messageCount: thread.messages?.length || 1,
    toAddresses,
  }
}

/**
 * Fetch recent emails as context for prep briefs.
 * Returns a formatted text string summarizing recent email threads
 * with specified people.
 */
export async function fetchGmailContextForPeople(
  accessToken: string,
  emailAddresses: string[]
): Promise<string> {
  if (emailAddresses.length === 0) return ''

  const result = await fetchGmailThreads(accessToken, emailAddresses, 5)
  if (!result.ok || result.threads.length === 0) return ''

  const lines = ['Recent email threads:']
  for (const t of result.threads) {
    const fromName = t.from.split('<')[0].trim().replace(/"/g, '')
    lines.push(`  - ${fromName}: "${t.subject}" — ${t.snippet.slice(0, 100)}`)
  }

  return lines.join('\n')
}
