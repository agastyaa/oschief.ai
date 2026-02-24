import { getModelPath } from './manager'
import { routeLLM } from '../cloud/router'
import { getTemplate, detectMeetingType, type MeetingSummary, type MeetingTemplate } from './templates'

// ─── Two-Pass Summarization Prompts ─────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `Extract structured data from this meeting. Output valid JSON only.

{
  "attendees": ["names/labels"],
  "topics": [
    {"name": "Specific subject (not generic)", "points": ["fact or statement"], "decisions": ["what was decided"], "speakers": ["who"]}
  ],
  "action_items": [
    {"task": "what", "owner": "who", "deadline": "when or null", "priority": "high|medium|low"}
  ],
  "unresolved": ["open question"],
  "notable_quotes": [{"speaker": "who", "text": "exact words"}]
}

RULES:
- Topic names: SPECIFIC ("Q3 Launch Timeline", not "Updates" or "Discussion")
- Extract implicit actions: "I'll send that" = action item for that speaker
- Extract implicit decisions: "Let's go with A" = decision under that topic
- Merge personal notes into relevant topics
- Be thorough but factual — no interpretation
- DO NOT HALLUCINATE: Include only what is stated or clearly implied in the transcript or personal notes. Do not invent attendees, topics, actions, or quotes.

Valid JSON only.`

function buildSynthesisSystemPrompt(template: MeetingTemplate, customPrompt?: string): string {
  // Industry-standard template prompt first; then user's custom prompt for this template (additive).
  const templateInstructions = [template.additionalPrompt, customPrompt].filter(Boolean).join('\n\n')
  return `You are Syag, a concise meeting note writer. Output valid JSON only.

{
  "title": "5-8 word title",
  "meetingType": "${template.id}",
  "attendees": ["Name"],
  "overview": "One sentence of context.",
  "discussionTopics": [
    {"topic": "Specific Name", "summary": "- Point 1\\n- Point 2\\n- Decision: X", "speakers": ["Name"]}
  ],
  "actionItems": [
    {"text": "Task — Person", "assignee": "Person", "dueDate": "when or null", "priority": "high|medium|low", "done": false}
  ],
  "questionsAndOpenItems": ["Open question"]
}

STRICT RULES:
- TOPIC-FIRST structure. Each topic = heading + 2-5 bullet points.
- Each bullet: ONE line, ONE idea, max 15 words. No prose, no paragraphs, no sub-bullets.
- Decisions INSIDE their topic: "- Decision: we chose X". No separate decisions array.
- Overview: exactly 1 sentence. Context only, not a summary of everything.
- Action items: "[Task] — [Person]" format. One line each.
- Topic names must be SPECIFIC ("Q3 Launch Plan", not "Updates").
- Omit empty arrays entirely. Omit questionsAndOpenItems if none.
- Weave personal notes into relevant topics.

DO NOT:
- Use generic names ("Discussion", "Miscellaneous", "Other Topics")
- Include filler ("The team discussed...", "It was mentioned that...")
- Repeat the same info across topics
- Write more than 5 bullets per topic
- Include keyQuotes unless truly memorable (max 1)
- Hallucinate: only include information from the extracted data or personal notes; do not invent facts, names, or dates.
${templateInstructions ? '\n' + templateInstructions : ''}

Valid JSON only.`
}

const CHAT_SYSTEM_PROMPT = `You are Syag, an AI assistant that helps users understand and query their meeting notes. You have access to the user's notes and transcripts. Be concise, helpful, and reference specific meetings when relevant.

When the user's message is a structured request (e.g. "Summarize the last 5 minutes...", "Draft a follow-up email...", "List only the decisions...", "My action items"), follow that instruction and format exactly: use the requested structure, bullets, **Name** — task, email style, etc.

Response format (Syag-style: concise and scannable):
- Lead with the answer. Use short paragraphs or bullet lists. Use **bold** for key terms only.
- Use markdown: "## Topic" for sections, "- item" for lists. One line per bullet when possible.
- Code or identifiers: use \`inline code\`. Do not include timestamps (e.g. 0:21) in your answers.
- Keep responses short and scannable: 2–4 bullets per topic, no long walls of text. Prefer bullets over paragraphs.`

// ─── General template (single-pass markdown) ────────────────────────────────

export type SummarizeMetadata = {
  title?: string
  date?: string
  duration?: string
  attendees?: string[]
  calendarDescription?: string
  userName?: string
  userRole?: string
  userFocusAreas?: string
  userOrg?: string
}

function fillGeneralPrompt(templatePrompt: string, transcriptText: string, personalNotes: string, metadata?: SummarizeMetadata): string {
  const dateStr = metadata?.date ?? new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  const attendeesStr = metadata?.attendees?.length ? metadata.attendees.join(', ') : '—'
  return templatePrompt
    .replace(/\{\{meeting_title\}\}/g, metadata?.title ?? 'This meeting')
    .replace(/\{\{date\}\}/g, dateStr)
    .replace(/\{\{duration\}\}/g, metadata?.duration ?? '—')
    .replace(/\{\{attendees\}\}/g, attendeesStr)
    .replace(/\{\{calendar_description\}\}/g, metadata?.calendarDescription ?? '—')
    .replace(/\{\{user_name\}\}/g, metadata?.userName ?? '—')
    .replace(/\{\{user_role\}\}/g, metadata?.userRole ?? '—')
    .replace(/\{\{user_focus_areas\}\}/g, metadata?.userFocusAreas ?? '—')
    .replace(/\{\{user_org\}\}/g, metadata?.userOrg ?? '—')
    .replace(/\{\{raw_notes\}\}/g, personalNotes || '(none)')
    .replace(/\{\{transcript\}\}/g, transcriptText)
}

function buildGeneralUserInput(transcriptText: string, personalNotes: string, _metadata?: SummarizeMetadata): string {
  return 'Generate the enhanced meeting notes following the format in your instructions.'
}

function parseGeneralMarkdownSummary(response: string, template: MeetingTemplate): MeetingSummary {
  const lines = response.split(/\r?\n/)
  let title = 'Meeting Notes'
  let overview = ''
  const discussionTopics: MeetingSummary['discussionTopics'] = []
  const decisions: string[] = []
  const actionItems: MeetingSummary['actionItems'] = []

  // First non-empty line = title (with optional " — Date" suffix for backward compatibility)
  const firstNonEmptyIdx = lines.findIndex(l => l.trim() !== '')
  const firstLine = firstNonEmptyIdx >= 0 ? lines[firstNonEmptyIdx].trim() : ''
  if (firstLine) {
    const titleMatch = firstLine.match(/^(.+?)\s*[—-]\s*.+$/)
    title = titleMatch ? titleMatch[1].trim() : firstLine
  }

  // TL;DR: either "TL;DR" label + following bullet lines (new format), or "TL;DR: content" on one line (legacy)
  let tldrBlockEnd = 0
  const tldrIdx = lines.findIndex(l => /^(\*\*)?TL;DR(\*\*)?\s*:?\s*/i.test(l.trim()))
  if (tldrIdx >= 0) {
    tldrBlockEnd = tldrIdx + 1
    const tldrLine = lines[tldrIdx].trim()
    const afterLabel = tldrLine.replace(/^(\*\*)?TL;DR(\*\*)?\s*:?\s*/i, '').trim()
    if (afterLabel) {
      overview = afterLabel
    } else {
      const tldrBullets: string[] = []
      for (let i = tldrIdx + 1; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        if (!trimmed) break
        if (trimmed.startsWith('-')) {
          tldrBullets.push(trimmed.replace(/^-\s*/, '').trim())
          tldrBlockEnd = i + 1
        } else {
          break
        }
      }
      overview = tldrBullets.join('\n')
    }
  }

  // Next Steps section (**Next Steps** or "Next Steps") — lines like "**Name** — do XYZ (by Friday)"
  const nextStepsIdx = lines.findIndex(l => /\*\*Next\s+Steps\*\*/i.test(l) || /^Next\s+Steps\s*$/i.test(l.trim()))
  const actionItemsIdx = lines.findIndex(l => /^Action\s+Item(s)?\s*$/i.test(l.trim()))
  const keyDecisionsIdx = lines.findIndex(l => /^Key\s+Decision(s)?\s*$/i.test(l.trim()))

  const stepsSectionIdx = nextStepsIdx >= 0 ? nextStepsIdx : actionItemsIdx
  if (stepsSectionIdx >= 0) {
    const sectionEnd = keyDecisionsIdx >= 0 && keyDecisionsIdx > stepsSectionIdx ? keyDecisionsIdx : lines.length
    for (let i = stepsSectionIdx + 1; i < sectionEnd; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('---')) continue
      // **Name** — task (by date) format
      const boldNameMatch = trimmed.match(/^\*\*([^*]+)\*\*\s*[—-]\s*(.+)$/)
      if (boldNameMatch) {
        const assignee = boldNameMatch[1].trim()
        const rest = boldNameMatch[2].trim()
        const byMatch = rest.match(/^(.+?)\s*\(by\s+(.+?)\)\s*$/i)
        const text = byMatch ? byMatch[1].trim() : rest
        const dueDate = byMatch ? byMatch[2].trim() : undefined
        actionItems.push({ text, assignee, dueDate, priority: 'medium', done: false })
        continue
      }
      // "Name:" on its own → next lines are their tasks (legacy)
      if (/^[A-Za-z][^:*]*:\s*$/.test(trimmed)) {
        let currentAssignee = trimmed.replace(/:$/, '').trim()
        for (let j = i + 1; j < sectionEnd; j++) {
          const nextLine = lines[j].trim()
          if (!nextLine || nextLine.startsWith('**') && nextLine.includes(' — ')) break
          const byMatch = nextLine.match(/^(.+?)\s*[—-]\s*by\s+(.+)$/i)
          const task = byMatch ? byMatch[1].trim() : nextLine.replace(/^-\s*/, '')
          const dueDate = byMatch ? byMatch[2].trim() : undefined
          actionItems.push({ text: task, assignee: currentAssignee, dueDate, priority: 'medium', done: false })
          i = j
        }
        continue
      }
      // "- **Name** — task" or "- task"
      if (trimmed.startsWith('-')) {
        const inner = trimmed.slice(1).trim()
        const boldMatch = inner.match(/^\*\*([^*]+)\*\*\s*[—-]\s*(.+)$/)
        if (boldMatch) {
          actionItems.push({
            text: boldMatch[2].trim(),
            assignee: boldMatch[1].trim(),
            dueDate: undefined,
            priority: 'medium',
            done: false,
          })
        }
      }
    }
  }

  // Key Decisions section (allow "Key Decision" singular too)
  if (keyDecisionsIdx >= 0) {
    for (let i = keyDecisionsIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      if (/^Action\s+Item(s)?\s*$/i.test(line) || /\*\*Next\s+Steps\*\*/.test(line)) break
      if (/^\[.+\]$/.test(line) || line.startsWith('-')) {
        decisions.push(line.replace(/^-\s*/, '').trim())
      } else {
        decisions.push(line)
      }
    }
  }

  // Topic sections: blocks between TL;DR and Next Steps / Action Items / Key Decisions, with bold **Topic** or # heading and bullets
  const topicEndIdx = Math.min(
    keyDecisionsIdx >= 0 ? keyDecisionsIdx : lines.length,
    stepsSectionIdx >= 0 ? stepsSectionIdx : lines.length
  )
  const isSectionHeader = (s: string) => /^Key\s+Decision(s)?$/i.test(s) || /^Action\s+Item(s)?$/i.test(s) || /\*\*Next\s+Steps\*\*/i.test(s)
  const topicStart = tldrBlockEnd > 0 ? tldrBlockEnd : 1
  const topicBlock: string[] = []
  for (let i = topicStart; i < topicEndIdx; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trim() === '---') {
      if (topicBlock.length > 0) {
        const rawFirst = topicBlock[0].trim()
        const topicName = rawFirst.replace(/^#+\s*/, '').replace(/\*+/g, '').trim()
        const summary = topicBlock.slice(1).filter(Boolean).map(l => (l.startsWith('-') || l.startsWith('→') ? l : `- ${l}`)).join('\n')
        if (topicName && !isSectionHeader(topicName)) {
          discussionTopics.push({ topic: topicName, summary: summary || '-', speakers: [] })
        }
        topicBlock.length = 0
      }
    } else {
      topicBlock.push(line)
    }
  }
  if (topicBlock.length > 0) {
    const rawFirst = topicBlock[0].trim()
    const topicName = rawFirst.replace(/^#+\s*/, '').replace(/\*+/g, '').trim()
    const summary = topicBlock.slice(1).filter(Boolean).map(l => (l.startsWith('-') || l.startsWith('→') ? l : `- ${l}`)).join('\n')
    if (topicName && !isSectionHeader(topicName)) {
      discussionTopics.push({ topic: topicName, summary: summary || '-', speakers: [] })
    }
  }

  return {
    title,
    meetingType: template.id,
    attendees: [],
    overview: overview || response.slice(0, 300),
    decisions,
    discussionTopics,
    actionItems,
    questionsAndOpenItems: [],
    followUps: [],
    keyQuotes: [],
  }
}

// ─── Summarize ──────────────────────────────────────────────────────────────

export async function summarize(
  transcript: any[],
  personalNotes: string,
  model: string,
  meetingTemplateId?: string,
  customPrompt?: string,
  metadata?: SummarizeMetadata
): Promise<MeetingSummary> {
  const transcriptText = transcript.map(t => `[${t.time}] ${t.speaker}: ${t.text}`).join('\n')

  const templateId = meetingTemplateId || detectMeetingType(transcriptText, personalNotes)
  const template = getTemplate(templateId)

  if (template.id === 'general') {
    const systemPrompt = fillGeneralPrompt(template.additionalPrompt, transcriptText, personalNotes, metadata)
    const systemWithCustom = customPrompt ? `${systemPrompt}\n\n${customPrompt}` : systemPrompt
    const userInput = buildGeneralUserInput(transcriptText, personalNotes, metadata)
    if (model.startsWith('local:')) {
      return summarizeWithLocal(transcriptText, personalNotes, model.replace('local:', ''), template, customPrompt, true, metadata)
    }
    const response = await routeLLM(
      [
        { role: 'system', content: systemWithCustom },
        { role: 'user', content: userInput },
      ],
      model
    )
    return parseGeneralMarkdownSummary(response, template)
  }

  if (model.startsWith('local:')) {
    return summarizeWithLocal(transcriptText, personalNotes, model.replace('local:', ''), template, customPrompt, false)
  }

  const extractionInput = `## Transcript\n${transcriptText}\n\n## Personal Notes\n${personalNotes || '(none)'}`

  const extractedData = await routeLLM(
    [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: extractionInput },
    ],
    model
  )

  const synthesisInput = `## Extracted Data\n${extractedData}\n\n## Personal Notes\n${personalNotes || '(none)'}\n\nWrite concise meeting notes.`

  const finalSummary = await routeLLM(
    [
      { role: 'system', content: buildSynthesisSystemPrompt(template, customPrompt) },
      { role: 'user', content: synthesisInput },
    ],
    model
  )

  return parseMeetingSummary(finalSummary, template)
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export async function chat(
  messages: any[],
  context: any,
  model: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const systemMessage = context?.notes
    ? `${CHAT_SYSTEM_PROMPT}\n\nContext from user's notes:\n${context.notes}`
    : CHAT_SYSTEM_PROMPT

  const llmMessages = [
    { role: 'system', content: systemMessage },
    ...messages.map((m: any) => ({ role: m.role, content: m.text || m.content })),
  ]

  if (model.startsWith('local:')) {
    return chatWithLocal(llmMessages, model.replace('local:', ''), onChunk)
  }

  return routeLLM(llmMessages, model, onChunk)
}

// ─── Local Model Fallbacks ──────────────────────────────────────────────────

async function summarizeWithLocal(
  transcriptText: string,
  personalNotes: string,
  modelId: string,
  template: MeetingTemplate,
  customPrompt?: string,
  useGeneralPass?: boolean,
  metadata?: SummarizeMetadata
): Promise<MeetingSummary> {
  const modelPath = getModelPath(modelId)
  if (!modelPath) {
    throw new Error(`Model not downloaded: ${modelId}`)
  }

  try {
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp')

    const llama = await getLlama()
    const model = await llama.loadModel({ modelPath })
    const ctx = await model.createContext()
    const session = new LlamaChatSession({ contextSequence: ctx.getSequence() })

    let prompt: string
    if (useGeneralPass && template.id === 'general') {
      const systemPrompt = fillGeneralPrompt(template.additionalPrompt, transcriptText, personalNotes, metadata)
      const systemWithCustom = customPrompt ? `${systemPrompt}\n\n${customPrompt}` : systemPrompt
      prompt = `${systemWithCustom}\n\n${buildGeneralUserInput(transcriptText, personalNotes, metadata)}`
    } else {
      prompt = `${buildSynthesisSystemPrompt(template, customPrompt)}

## Meeting Transcript
${transcriptText}

## Personal Notes
${personalNotes || '(none)'}

Generate a structured meeting summary as JSON.`
    }

    const response = await session.prompt(prompt, {
      maxTokens: 2048,
      temperature: 0.3,
    })

    await model.dispose()
    if (useGeneralPass && template.id === 'general') {
      return parseGeneralMarkdownSummary(response, template)
    }
    return parseMeetingSummary(response, template)
  } catch (err: any) {
    if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      throw new Error('node-llama-cpp is not installed. Install it with: npm install node-llama-cpp')
    }
    throw err
  }
}

async function chatWithLocal(
  messages: any[],
  modelId: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const modelPath = getModelPath(modelId)
  if (!modelPath) {
    throw new Error(`Model not downloaded: ${modelId}`)
  }

  try {
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp')

    const llama = await getLlama()
    const model = await llama.loadModel({ modelPath })
    const ctx = await model.createContext()
    const session = new LlamaChatSession({ contextSequence: ctx.getSequence() })

    const systemContent = messages.find(m => m.role === 'system')?.content || ''
    const userMessages = messages.filter(m => m.role !== 'system')
    const lastMessage = userMessages[userMessages.length - 1]?.content || ''

    const prompt = systemContent
      ? `${systemContent}\n\nUser: ${lastMessage}`
      : lastMessage

    let fullResponse = ''

    if (onChunk) {
      await session.prompt(prompt, {
        maxTokens: 2048,
        temperature: 0.7,
        onTextChunk: (text: string) => {
          fullResponse += text
          onChunk({ text, done: false })
        },
      })
      onChunk({ text: '', done: true })
    } else {
      fullResponse = await session.prompt(prompt, {
        maxTokens: 2048,
        temperature: 0.7,
      })
    }

    await model.dispose()
    return fullResponse
  } catch (err: any) {
    if (err.code === 'MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      throw new Error('node-llama-cpp is not installed. Install it with: npm install node-llama-cpp')
    }
    throw err
  }
}

// ─── Response Parsing ───────────────────────────────────────────────────────

function parseMeetingSummary(response: string, template: MeetingTemplate): MeetingSummary {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])

      // Extract inline decisions from topic bullets into the decisions array for backward compat
      const inlineDecisions: string[] = []
      const topics = Array.isArray(parsed.discussionTopics)
        ? parsed.discussionTopics.map((t: any) => {
            const summary = t.summary || t.description || ''
            // Pull out "- Decision: ..." lines for the decisions array too
            const lines = summary.split('\n')
            for (const line of lines) {
              const match = line.match(/^-\s*Decision:\s*(.+)/i)
              if (match) inlineDecisions.push(match[1].trim())
            }
            return {
              topic: t.topic || t.name || 'Topic',
              summary,
              speakers: Array.isArray(t.speakers) ? t.speakers : [],
            }
          })
        : []

      return {
        title: parsed.title || 'Meeting Notes',
        meetingType: parsed.meetingType || template.id,
        attendees: Array.isArray(parsed.attendees) ? parsed.attendees : [],
        overview: parsed.overview || '',
        decisions: Array.isArray(parsed.decisions)
          ? parsed.decisions
          : inlineDecisions,
        discussionTopics: topics,
        actionItems: Array.isArray(parsed.actionItems)
          ? parsed.actionItems.map((a: any) => ({
              text: a.text || a.task || a.description || String(a),
              assignee: a.assignee || a.owner || 'You',
              dueDate: a.dueDate || a.deadline || undefined,
              priority: ['high', 'medium', 'low'].includes(a.priority) ? a.priority : 'medium',
              done: a.done ?? false,
            }))
          : [],
        questionsAndOpenItems: Array.isArray(parsed.questionsAndOpenItems)
          ? parsed.questionsAndOpenItems
          : Array.isArray(parsed.questions) ? parsed.questions : [],
        followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
        keyQuotes: Array.isArray(parsed.keyQuotes)
          ? parsed.keyQuotes.map((q: any) => ({
              speaker: q.speaker || 'Unknown',
              text: q.text || q.quote || String(q),
            }))
          : [],
      }
    }
  } catch (err) {
    console.error('Failed to parse summary JSON:', err)
  }

  return {
    title: 'Meeting Notes',
    meetingType: template.id,
    attendees: [],
    overview: response.slice(0, 500),
    decisions: [],
    discussionTopics: [],
    actionItems: [{ text: 'Review generated summary', assignee: 'You', priority: 'medium', done: false }],
    questionsAndOpenItems: [],
    followUps: [],
    keyQuotes: [],
  }
}
