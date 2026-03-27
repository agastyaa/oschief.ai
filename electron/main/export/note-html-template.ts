interface NoteData {
  title: string
  date: string
  duration: string
  timeRange?: string
  personalNotes: string
  transcript: { speaker: string; time: string; text: string }[]
  summary: {
    overview: string
    keyPoints?: string[]
    discussionTopics?: { topic: string; summary: string; speakers: string[] }[]
    decisions?: string[]
    actionItems?: { text: string; assignee: string; done: boolean; dueDate?: string; priority?: string }[]
    nextSteps?: { text: string; assignee: string; done: boolean; dueDate?: string }[]
    questionsAndOpenItems?: string[]
    followUps?: string[]
    keyQuotes?: { speaker: string; text: string }[]
  } | null
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Generate a self-contained HTML document from note data.
 * Includes all styles inline for PDF rendering.
 */
export function noteToHtml(note: NoteData): string {
  const sections: string[] = []

  // Metadata
  const meta: string[] = []
  if (note.date) meta.push(esc(note.date))
  if (note.duration && note.duration !== '0:00') meta.push(esc(note.duration))
  if (note.timeRange) meta.push(esc(note.timeRange))

  const summary = note.summary

  if (summary) {
    if (summary.overview) {
      sections.push(`<div class="section"><p class="overview">${esc(summary.overview)}</p></div>`)
    }

    if (summary.keyPoints?.length) {
      sections.push(`<div class="section"><h2>Key Points</h2><ul>${summary.keyPoints.map(kp => `<li>${esc(kp)}</li>`).join('')}</ul></div>`)
    }

    if (summary.discussionTopics?.length) {
      let topicsHtml = '<div class="section"><h2>Discussion Topics</h2>'
      for (const topic of summary.discussionTopics) {
        topicsHtml += `<h3>${esc(topic.topic)}</h3>`
        if (topic.speakers?.length) {
          topicsHtml += `<p class="speakers">Speakers: ${esc(topic.speakers.join(', '))}</p>`
        }
        const lines = topic.summary.split('\n').map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean)
        if (lines.length) {
          topicsHtml += `<ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
        }
      }
      topicsHtml += '</div>'
      sections.push(topicsHtml)
    }

    if (summary.decisions?.length) {
      sections.push(`<div class="section"><h2>Decisions</h2><ul class="decisions">${summary.decisions.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>`)
    }

    const actionItems = summary.actionItems || summary.nextSteps
    if (actionItems?.length) {
      let html = '<div class="section"><h2>Action Items</h2><div class="actions">'
      for (const ai of actionItems) {
        const check = ai.done ? '☑' : '☐'
        const assignee = ai.assignee && ai.assignee !== 'Unassigned' ? `<span class="assignee">${esc(ai.assignee)}</span> — ` : ''
        const due = (ai as any).dueDate ? ` <span class="due">(by ${esc((ai as any).dueDate)})</span>` : ''
        const cls = ai.done ? ' class="done"' : ''
        html += `<div class="action-item"${cls}><span class="check">${check}</span> ${assignee}${esc(ai.text)}${due}</div>`
      }
      html += '</div></div>'
      sections.push(html)
    }

    if (summary.questionsAndOpenItems?.length) {
      sections.push(`<div class="section"><h2>Open Questions</h2><ul>${summary.questionsAndOpenItems.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>`)
    }

    if (summary.followUps?.length) {
      sections.push(`<div class="section"><h2>Follow-Ups</h2><ul>${summary.followUps.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>`)
    }

    if (summary.keyQuotes?.length) {
      let html = '<div class="section"><h2>Key Quotes</h2>'
      for (const q of summary.keyQuotes) {
        html += `<blockquote>"${esc(q.text)}" <cite>— ${esc(q.speaker)}</cite></blockquote>`
      }
      html += '</div>'
      sections.push(html)
    }
  }

  if (note.personalNotes?.trim()) {
    sections.push(`<div class="section"><h2>Personal Notes</h2><div class="personal">${esc(note.personalNotes).replace(/\n/g, '<br>')}</div></div>`)
  }

  // Transcript excluded from default export — summary is what gets shared.

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; padding: 40px 50px; line-height: 1.5; font-size: 13px; }
  h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .section { margin-bottom: 20px; }
  h2 { font-size: 16px; font-weight: 600; margin-bottom: 8px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  h3 { font-size: 14px; font-weight: 600; margin: 8px 0 4px; }
  .overview { font-size: 14px; font-weight: 500; }
  .speakers { font-size: 11px; color: #888; font-style: italic; margin-bottom: 4px; }
  ul { padding-left: 20px; margin-bottom: 4px; }
  li { margin-bottom: 3px; }
  ul.decisions li { list-style-type: "▸ "; }
  .action-item { padding: 3px 0; padding-left: 4px; }
  .action-item.done { color: #999; text-decoration: line-through; }
  .action-item .check { margin-right: 4px; }
  .action-item .assignee { font-weight: 600; color: #555; }
  .action-item .due { color: #888; font-size: 12px; }
  blockquote { border-left: 3px solid #ddd; padding: 4px 12px; margin: 6px 0; font-style: italic; color: #444; }
  blockquote cite { font-style: normal; color: #888; font-size: 12px; }
  .personal { color: #333; white-space: pre-wrap; }
  .transcript-line { font-size: 12px; margin-bottom: 6px; line-height: 1.4; }
  .transcript-line .ts { color: #999; font-size: 11px; }
  .transcript-section { page-break-before: always; }
</style>
</head>
<body>
<h1>${esc(note.title || 'Untitled Meeting')}</h1>
${meta.length > 0 ? `<p class="meta">${meta.join(' &nbsp;|&nbsp; ')}</p>` : ''}
${sections.join('\n')}
</body>
</html>`
}
