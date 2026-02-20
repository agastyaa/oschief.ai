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
${templateInstructions ? '\n' + templateInstructions : ''}

Valid JSON only.`
}

const CHAT_SYSTEM_PROMPT = `You are Syag, an AI assistant that helps users understand and query their meeting notes. You have access to the user's notes and transcripts. Be concise, helpful, and reference specific meetings when relevant.`

// ─── Summarize ──────────────────────────────────────────────────────────────

export async function summarize(
  transcript: any[],
  personalNotes: string,
  model: string,
  meetingTemplateId?: string,
  customPrompt?: string
): Promise<MeetingSummary> {
  const transcriptText = transcript.map(t => `[${t.time}] ${t.speaker}: ${t.text}`).join('\n')

  const templateId = meetingTemplateId || detectMeetingType(transcriptText, personalNotes)
  const template = getTemplate(templateId)

  if (model.startsWith('local:')) {
    return summarizeWithLocal(transcriptText, personalNotes, model.replace('local:', ''), template, customPrompt)
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
  customPrompt?: string
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

    // Single pass for local models (smaller context window)
    const prompt = `${buildSynthesisSystemPrompt(template, customPrompt)}

## Meeting Transcript
${transcriptText}

## Personal Notes
${personalNotes || '(none)'}

Generate a structured meeting summary as JSON.`

    const response = await session.prompt(prompt, {
      maxTokens: 2048,
      temperature: 0.3,
    })

    await model.dispose()
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
