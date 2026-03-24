/**
 * Meeting Prep Brief Generator
 *
 * Generates a concise, contextual brief before a meeting:
 * who you're meeting, what you discussed last time, open
 * commitments, and suggested talking points.
 *
 * Uses context-assembler for data + LLM for distillation.
 *
 * FLOW:
 *  CalendarContext detects meeting in 5min
 *       │
 *       ▼
 *  assembleContext(attendees, title)
 *       │
 *       ▼
 *  routeLLM(brief prompt + context)
 *       │
 *       ▼
 *  { brief, attendees, commitments, projects }
 */

import { assembleContext, type MeetingContext } from './context-assembler'
import { routeLLM } from '../cloud/router'

export interface PrepBrief {
  summary: string          // 3-5 line brief
  attendees: string[]      // people names
  openCommitments: Array<{
    text: string
    owner: string
    isOverdue: boolean
  }>
  projects: Array<{ name: string; meetingCount: number }>
  meetingTitle?: string
  generatedAt: string
}

const BRIEF_PROMPT = `You are a chief of staff preparing a brief before a meeting. Given context about the attendees (previous meetings, open commitments, related projects), write a concise 3-5 line prep brief.

Format: A few short, direct sentences. No bullet points. No headers. Just the key things to know before walking in.

Example: "You last met Sarah on March 15 about the Q3 budget review. You still owe her the revised forecast from that conversation. The ACME project has had 4 meetings this month — last decision was to delay the launch by 2 weeks. Watch for any updates on the timeline."

Be specific, reference real data from the context. If there's nothing notable, say so briefly.`

/**
 * Generate a prep brief for an upcoming meeting.
 * Returns null if no useful context exists (cold start).
 */
export async function generatePrepBrief(
  attendeeNames: string[],
  attendeeEmails: string[],
  eventTitle: string | undefined,
  model: string
): Promise<PrepBrief | null> {
  // Assemble raw context
  const context = await assembleContext(attendeeNames, attendeeEmails, eventTitle)

  // Check if there's enough data to make a useful brief
  const hasData = context.previousMeetings.length > 0 ||
    context.openCommitments.length > 0 ||
    context.projects.length > 0

  if (!hasData) return null

  // Build context text for LLM
  const contextParts: string[] = []

  if (eventTitle) contextParts.push(`Meeting: "${eventTitle}"`)

  if (context.previousMeetings.length > 0) {
    contextParts.push('Previous meetings:')
    for (const pm of context.previousMeetings) {
      for (const m of pm.meetings.slice(0, 3)) {
        contextParts.push(`  - ${pm.personName}: "${m.title}" on ${m.date}`)
      }
    }
  }

  if (context.openCommitments.length > 0) {
    contextParts.push('Open commitments:')
    for (const c of context.openCommitments) {
      const overdue = c.isOverdue ? ' (OVERDUE)' : ''
      contextParts.push(`  - ${c.owner}: ${c.text}${c.dueDate ? ` due ${c.dueDate}` : ''}${overdue}`)
    }
  }

  if (context.projects.length > 0) {
    contextParts.push('Related projects:')
    for (const p of context.projects) {
      contextParts.push(`  - ${p.name} (${p.meetingCount} meetings, ${p.status})`)
    }
  }

  // Include recent Gmail threads with attendees (if Gmail is connected)
  try {
    const { getSetting } = await import('../storage/database')
    const gmailToken = getSetting('google-access-token')
    if (gmailToken && attendeeEmails.length > 0) {
      const { fetchGmailThreads } = await import('../integrations/google-gmail')
      const result = await fetchGmailThreads(gmailToken, attendeeEmails, 3)
      if (result.ok && result.threads.length > 0) {
        contextParts.push('Recent email threads with attendees:')
        for (const t of result.threads) {
          contextParts.push(`  - "${t.subject}" (${t.date}): ${t.snippet}`)
        }
      }
    }
  } catch {
    // Gmail not connected or error — skip silently
  }

  // Generate brief via LLM
  let summary: string
  try {
    const response = await routeLLM(
      [
        { role: 'system', content: BRIEF_PROMPT },
        { role: 'user', content: contextParts.join('\n') },
      ],
      model
    )
    summary = response.trim()
  } catch (err) {
    console.error('[prep-brief] LLM call failed:', err)
    // Fallback: construct a basic brief without LLM
    summary = buildFallbackBrief(context)
  }

  return {
    summary,
    attendees: context.previousMeetings.map(pm => pm.personName),
    openCommitments: context.openCommitments.slice(0, 5).map(c => ({
      text: c.text,
      owner: c.owner,
      isOverdue: c.isOverdue,
    })),
    projects: context.projects.map(p => ({ name: p.name, meetingCount: p.meetingCount })),
    meetingTitle: eventTitle,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Build a basic brief without LLM (fallback when LLM fails).
 */
function buildFallbackBrief(context: MeetingContext): string {
  const parts: string[] = []

  if (context.previousMeetings.length > 0) {
    const latest = context.previousMeetings[0]
    const lastMeeting = latest.meetings[0]
    parts.push(`Last met ${latest.personName} on ${lastMeeting.date} — "${lastMeeting.title}".`)
  }

  const overdue = context.openCommitments.filter(c => c.isOverdue)
  if (overdue.length > 0) {
    parts.push(`You have ${overdue.length} overdue commitment${overdue.length > 1 ? 's' : ''}.`)
  }

  if (context.projects.length > 0) {
    parts.push(`Active project: ${context.projects[0].name}.`)
  }

  return parts.join(' ') || 'No prior context found for this meeting.'
}
