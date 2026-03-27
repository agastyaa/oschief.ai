/**
 * Entity Extraction Engine
 * 
 * Runs automatically after meeting summarization to extract:
 * - People mentioned/attending
 * - Commitments (promises, action items, deadlines)
 * - Topics/themes discussed
 * 
 * Populates the Memory Layer tables for cross-meeting intelligence.
 */

import { routeLLM } from '../cloud/router'
import { getDb } from '../storage/database'
import { randomUUID } from 'crypto'

// Types for extraction results
export interface ExtractedEntities {
  people: Array<{
    name: string
    email?: string
    company?: string
    role?: string
    relationship?: string
  }>
  commitments: Array<{
    text: string
    owner: string  // 'you' or person name
    assignee?: string  // person name
    dueDate?: string  // ISO date or natural language
  }>
  topics: string[]  // topic labels
  project?: string  // primary project discussed
  decisions?: Array<{
    text: string
    context?: string
  }>
}

const EXTRACTION_PROMPT = `You are an entity extraction system. Given a meeting summary and transcript excerpt, extract structured data.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "people": [
    {"name": "Full Name", "email": "email@example.com", "company": "Company", "role": "Job Title", "relationship": "colleague|client|vendor|manager|report|skip-level|external"}
  ],
  "commitments": [
    {"text": "What was promised", "owner": "you|Person Name", "assignee": "Person Name or null", "dueDate": "2024-03-20 or by Friday or null"}
  ],
  "topics": ["Topic 1", "Topic 2"],
  "project": "Project Name or null",
  "decisions": [
    {"text": "What was decided", "context": "Brief context for the decision or null"}
  ]
}

Rules:
- For people: extract everyone mentioned by name. If email is available from context, include it. Infer company/role from context when clear.
- For commitments: extract any promise, action item, follow-up, or deliverable. "I'll send the report" = owner: "you". "Sarah will prepare the deck" = owner: "Sarah", assignee: "Sarah".
- For topics: extract 2-5 high-level themes (e.g., "Q3 Budget", "Hiring Pipeline", "Product Roadmap"). Be specific, not generic.
- For project: identify the primary project or work stream discussed. Use the most specific name (e.g., "ACME Enterprise Tier" not "project"). If no clear project, set to null.
- For decisions: extract any agreed-upon decision, resolution, or conclusion. Include brief context if available. If none, return empty array.
- Use "you" for the meeting recorder/note-taker. Use actual names for others.
- If a due date is mentioned (even implicitly like "by end of week" or "before the next standup"), include it.
- Do NOT include the meeting recorder as a person entry (they are implicit).
- Return empty arrays if nothing found for a category. Return null for project if none detected.`

/**
 * Extract entities from a meeting summary and transcript.
 * Retries once on JSON parse failure with a simpler prompt.
 */
export async function extractEntities(
  summary: any,
  transcript: Array<{ speaker: string; time: string; text: string }>,
  model: string,
  calendarAttendees?: string[]
): Promise<ExtractedEntities> {
  // Build the context for extraction
  const summaryText = buildSummaryText(summary)
  const transcriptExcerpt = transcript
    .slice(-50)  // Last 50 lines for context
    .map(t => `[${t.speaker}] ${t.text}`)
    .join('\n')
  
  const attendeeContext = calendarAttendees?.length
    ? `\nCalendar attendees (emails): ${calendarAttendees.join(', ')}`
    : ''

  const userMessage = `Meeting Summary:\n${summaryText}\n\nTranscript (last portion):\n${transcriptExcerpt}${attendeeContext}`

  try {
    const response = await routeLLM(
      [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: userMessage },
      ],
      model
    )
    
    return parseExtractionResponse(response)
  } catch (err) {
    console.error('[entity-extractor] First attempt failed:', err)
    
    // Retry with simpler prompt (includes project + decisions fields)
    try {
      const simplePrompt = `Extract people names, action items, discussion topics, project name, and decisions from this meeting summary. Return JSON: {"people": [{"name": "..."}], "commitments": [{"text": "...", "owner": "you"}], "topics": ["..."], "project": "name or null", "decisions": [{"text": "..."}]}\n\n${summaryText}`
      const response = await routeLLM(
        [{ role: 'user', content: simplePrompt }],
        model
      )
      return parseExtractionResponse(response)
    } catch (retryErr) {
      console.error('[entity-extractor] Retry failed:', retryErr)
      return { people: [], commitments: [], topics: [], decisions: [] }
    }
  }
}

function buildSummaryText(summary: any): string {
  const parts: string[] = []
  if (summary.overview) parts.push(`Overview: ${summary.overview}`)
  if (summary.keyPoints?.length) parts.push(`Key Points:\n${summary.keyPoints.map((p: string) => `- ${p}`).join('\n')}`)
  if (summary.decisions?.length) parts.push(`Decisions:\n${summary.decisions.map((d: string) => `- ${d}`).join('\n')}`)
  if (summary.actionItems?.length) {
    parts.push(`Action Items:\n${summary.actionItems.map((ai: any) => {
      const assignee = ai.assignee && ai.assignee !== 'Unassigned' ? ` (assigned to ${ai.assignee})` : ''
      const due = ai.dueDate ? ` [due: ${ai.dueDate}]` : ''
      return `- ${ai.text}${assignee}${due}`
    }).join('\n')}`)
  }
  if (summary.discussionTopics?.length) {
    parts.push(`Discussion Topics:\n${summary.discussionTopics.map((t: any) => {
      const speakers = t.speakers?.length ? ` (${t.speakers.join(', ')})` : ''
      return `- ${t.topic}${speakers}: ${t.summary || ''}`
    }).join('\n')}`)
  }
  if (summary.keyQuotes?.length) {
    parts.push(`Key Quotes:\n${summary.keyQuotes.map((q: any) => `- "${q.text}" — ${q.speaker}`).join('\n')}`)
  }
  return parts.join('\n\n')
}

function parseExtractionResponse(response: string): ExtractedEntities {
  // Try to find JSON in the response (handle markdown code blocks)
  let jsonStr = response.trim()
  
  // Strip markdown code block if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) jsonStr = jsonMatch[1].trim()
  
  // Try to find JSON object
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]
  
  try {
    const parsed = JSON.parse(jsonStr)
    return {
      people: Array.isArray(parsed.people) ? parsed.people.filter((p: any) => p?.name) : [],
      commitments: Array.isArray(parsed.commitments) ? parsed.commitments.filter((c: any) => c?.text) : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.filter((t: any) => typeof t === 'string' && t.trim()) : [],
      project: typeof parsed.project === 'string' && parsed.project.trim() ? parsed.project.trim() : undefined,
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((d: any) => d?.text) : [],
    }
  } catch {
    console.error('[entity-extractor] JSON parse failed for:', jsonStr.slice(0, 200))
    return { people: [], commitments: [], topics: [], decisions: [] }
  }
}

/**
 * Process extracted entities into the memory database.
 * Call this after extractEntities() returns.
 */
export async function storeExtractedEntities(
  noteId: string,
  entities: ExtractedEntities,
  calendarAttendees?: Array<{ name?: string; email?: string }>,
  calendarTitle?: string
): Promise<{ peopleCount: number; commitmentCount: number; topicCount: number; projectId?: string; decisionCount: number }> {
  // Lazy import stores to avoid circular deps
  const { upsertPerson, linkPersonToNote } = await import('./people-store')
  const { addCommitment, normalizeDueDate } = await import('./commitment-store')
  const { upsertTopic, linkTopicToNote } = await import('./topic-store')
  const { upsertProject, linkProjectToNote, parseProjectFromCalendarTitle } = await import('./project-store')
  const { addDecision, linkDecisionToPeople } = await import('./decision-store')

  let peopleCount = 0
  let commitmentCount = 0
  let topicCount = 0
  let decisionCount = 0
  let projectId: string | undefined

  // Map of name -> personId for commitment/decision linking
  const nameToPersonId: Record<string, string> = {}

  // Wrap all entity writes in a single transaction for atomicity and performance
  // (SQLite batches writes into a single disk flush)
  getDb().transaction(() => {
    // 1. Process people
    for (const p of entities.people) {
      try {
        let email = p.email
        if (!email && calendarAttendees?.length) {
          const attendee = calendarAttendees.find(
            a => a.name && a.name.toLowerCase().includes(p.name.toLowerCase())
          )
          if (attendee?.email) email = attendee.email
        }

        const person = upsertPerson({
          name: p.name,
          email: email || undefined,
          company: p.company,
          role: p.role,
          relationship: p.relationship,
        })

        if (person) {
          linkPersonToNote(noteId, person.id, 'attendee')
          nameToPersonId[p.name.toLowerCase()] = person.id
          peopleCount++
        }
      } catch (err) {
        console.error(`[entity-extractor] Failed to store person ${p.name}:`, err)
      }
    }

    // 2. Process project (calendar title takes priority over LLM-extracted)
    try {
      const calendarProject = calendarTitle ? parseProjectFromCalendarTitle(calendarTitle) : null
      const projectName = calendarProject || entities.project
      if (projectName) {
        const project = upsertProject(projectName)
        if (project) {
          linkProjectToNote(noteId, project.id)
          projectId = project.id
        }
      }
    } catch (err) {
      console.error('[entity-extractor] Failed to store project:', err)
    }

    // 3. Process commitments
    for (const c of entities.commitments) {
      try {
        let assigneeId: string | undefined
        if (c.assignee) {
          assigneeId = nameToPersonId[c.assignee.toLowerCase()]
        }

        // Normalize natural language dates to ISO format
        const rawDueDate = c.dueDate || undefined
        const normalizedDueDate = rawDueDate ? (normalizeDueDate(rawDueDate) ?? rawDueDate) : undefined

        addCommitment({
          noteId,
          text: c.text,
          owner: c.owner || 'you',
          assigneeId,
          dueDate: normalizedDueDate,
          projectId,
        })
        commitmentCount++
      } catch (err) {
        console.error(`[entity-extractor] Failed to store commitment:`, err)
      }
    }

    // 4. Process decisions
    for (const d of entities.decisions || []) {
      try {
        const decision = addDecision({
          noteId,
          projectId,
          text: d.text,
          context: d.context,
        })
        if (decision) {
          // Link all meeting attendees to the decision
          const personIds = Object.values(nameToPersonId)
          if (personIds.length > 0) {
            linkDecisionToPeople(decision.id, personIds)
          }
          decisionCount++
        }
      } catch (err) {
        console.error('[entity-extractor] Failed to store decision:', err)
      }
    }

    // 5. Process topics
    for (const label of entities.topics) {
      try {
        const topic = upsertTopic(label)
        if (topic) {
          linkTopicToNote(noteId, topic.id)
          topicCount++
        }
      } catch (err) {
        console.error(`[entity-extractor] Failed to store topic ${label}:`, err)
      }
    }
  })()

  console.log(`[entity-extractor] Stored entities for note ${noteId}: ${peopleCount} people, ${commitmentCount} commitments, ${topicCount} topics, project=${projectId ? 'yes' : 'no'}, ${decisionCount} decisions`)
  return { peopleCount, commitmentCount, topicCount, projectId, decisionCount }
}
