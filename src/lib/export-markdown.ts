import type { SavedNote } from '@/contexts/NotesContext'
import type { SummaryData } from '@/components/EditableSummary'

/** Convert simple HTML (from Tiptap) to markdown. Handles common block/inline elements. */
function htmlToMarkdown(html: string): string {
  if (!html || !html.includes('<')) return html // plain text passthrough
  let md = html
    // Block elements first
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (_, c) => c.split('\n').map((l: string) => `> ${l.replace(/<\/?p[^>]*>/gi, '').trim()}`).filter(Boolean).join('\n') + '\n')
    .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n')
    // Lists — convert <li> items then strip wrapper tags
    .replace(/<li[^>]*><p[^>]*>(.*?)<\/p><\/li>/gi, '- $1\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[ou]l[^>]*>/gi, '\n')
    // Task list items
    .replace(/- <label><input[^>]*checked[^>]*><\/label>\s*/gi, '- [x] ')
    .replace(/- <label><input[^>]*><\/label>\s*/gi, '- [ ] ')
    // Inline
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~')
    // Paragraphs and breaks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gis, '$1\n\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Clean up entities
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return md
}

// ── Shared markdown body (used by noteToMarkdown + vault writer) ────────

/**
 * Build the markdown body sections from a note.
 * Returns an array of section strings (summary, key points, transcript, etc.)
 * without title or metadata — the caller adds those.
 */
export function buildMarkdownBody(note: SavedNote): string[] {
  const parts: string[] = []
  const summary = note.summary as SummaryData | null

  if (summary) {
    if (summary.overview) {
      parts.push('## Summary')
      parts.push(summary.overview)
    }

    if (summary.keyPoints?.length) {
      parts.push('## Key Points')
      parts.push(summary.keyPoints.map(kp => `- ${kp}`).join('\n'))
    }

    if (summary.discussionTopics?.length) {
      parts.push('## Discussion Topics')
      for (const topic of summary.discussionTopics) {
        parts.push(`### ${topic.topic}`)
        if (topic.speakers?.length) parts.push(`*Speakers: ${topic.speakers.join(', ')}*`)
        if (topic.summary) parts.push(topic.summary)
      }
    }

    if (summary.decisions?.length) {
      parts.push('## Decisions')
      parts.push(summary.decisions.map(d => `- ${d}`).join('\n'))
    }

    const actionItems = summary.actionItems || summary.nextSteps
    if (actionItems?.length) {
      parts.push('## Action Items')
      parts.push(actionItems.map(ai => {
        const check = ai.done ? '[x]' : '[ ]'
        const assignee = ai.assignee && ai.assignee !== 'Unassigned' ? ` — ${ai.assignee}` : ''
        const due = (ai as any).dueDate ? ` (by ${(ai as any).dueDate})` : ''
        const priority = (ai as any).priority && (ai as any).priority !== 'medium' ? ` [${(ai as any).priority}]` : ''
        return `- ${check} ${ai.text}${assignee}${due}${priority}`
      }).join('\n'))
    }

    if (summary.questionsAndOpenItems?.length) {
      parts.push('## Open Questions')
      parts.push(summary.questionsAndOpenItems.map(q => `- ${q}`).join('\n'))
    }

    if (summary.followUps?.length) {
      parts.push('## Follow-Ups')
      parts.push(summary.followUps.map(f => `- ${f}`).join('\n'))
    }

    if (summary.keyQuotes?.length) {
      parts.push('## Key Quotes')
      parts.push(summary.keyQuotes.map(q => `> "${q.text}" — *${q.speaker}*`).join('\n\n'))
    }
  }

  if (note.personalNotes?.trim()) {
    parts.push('## Personal Notes')
    parts.push(htmlToMarkdown(note.personalNotes.trim()))
  }

  // Transcript excluded from default export — too verbose for sharing.
  // Use includeTranscript option or noteToMarkdownFull() for full export.

  return parts
}

// ── Full note → Markdown ────────────────────────────────────────────────

/**
 * Convert a SavedNote into a complete Markdown document.
 * Handles all optional summary fields gracefully.
 */
export function noteToMarkdown(note: SavedNote): string {
  const parts: string[] = []

  // Title
  parts.push(`# ${note.title || 'Untitled Meeting'}`)

  // Metadata line
  const meta: string[] = []
  if (note.date) meta.push(`**Date:** ${note.date}`)
  if (note.duration && note.duration !== '0:00') meta.push(`**Duration:** ${note.duration}`)
  if (note.timeRange) meta.push(`**Time:** ${note.timeRange}`)
  if (meta.length > 0) parts.push(meta.join(' | '))

  parts.push(...buildMarkdownBody(note))

  return parts.join('\n\n')
}

// ── Section-level exports ───────────────────────────────────────────────

/** Export just the overview section as markdown */
export function overviewToMarkdown(summary: SummaryData): string {
  return summary.overview || ''
}

/** Export discussion topics as markdown */
export function topicsToMarkdown(summary: SummaryData): string {
  if (!summary.discussionTopics?.length) return ''
  return summary.discussionTopics.map(topic => {
    const lines = [`### ${topic.topic}`]
    if (topic.speakers?.length) lines.push(`*Speakers: ${topic.speakers.join(', ')}*`)
    if (topic.summary) lines.push(topic.summary)
    return lines.join('\n')
  }).join('\n\n')
}

/** Export key points as markdown */
export function keyPointsToMarkdown(summary: SummaryData): string {
  if (!summary.keyPoints?.length) return ''
  return summary.keyPoints.map(kp => `- ${kp}`).join('\n')
}

/** Export decisions as markdown */
export function decisionsToMarkdown(summary: SummaryData): string {
  if (!summary.decisions?.length) return ''
  return summary.decisions.map(d => `- ${d}`).join('\n')
}

/** Export action items as markdown */
export function actionItemsToMarkdown(summary: SummaryData): string {
  const items = summary.actionItems || summary.nextSteps
  if (!items?.length) return ''
  return items.map(ai => {
    const check = ai.done ? '[x]' : '[ ]'
    const assignee = ai.assignee && ai.assignee !== 'Unassigned' ? ` — ${ai.assignee}` : ''
    const due = (ai as any).dueDate ? ` (by ${(ai as any).dueDate})` : ''
    return `- ${check} ${ai.text}${assignee}${due}`
  }).join('\n')
}

/** Export key quotes as markdown */
export function keyQuotesToMarkdown(summary: SummaryData): string {
  if (!summary.keyQuotes?.length) return ''
  return summary.keyQuotes.map(q => `> "${q.text}" — *${q.speaker}*`).join('\n\n')
}

/** Export open questions as markdown */
export function questionsToMarkdown(summary: SummaryData): string {
  if (!summary.questionsAndOpenItems?.length) return ''
  return summary.questionsAndOpenItems.map(q => `- ${q}`).join('\n')
}

/** Export follow-ups as markdown */
export function followUpsToMarkdown(summary: SummaryData): string {
  if (!summary.followUps?.length) return ''
  return summary.followUps.map(f => `- ${f}`).join('\n')
}
