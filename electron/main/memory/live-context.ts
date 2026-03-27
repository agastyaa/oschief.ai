/**
 * Live Context — Mid-Meeting Entity Extraction
 *
 * Runs a lightweight LLM call on recent transcript text to detect
 * people, topics, projects, and nascent commitments in real-time.
 * Results are fuzzy-matched against the existing memory graph.
 */

import { routeLLM } from '../cloud/router'
import { resolveSelectedAIModel } from '../models/model-resolver'
import { getDb } from '../storage/database'
import { findBestMatch } from './fuzzy-match'

export interface LiveEntities {
  people: string[]
  topics: string[]
  commitments: string[]
  project: string | null
}

export interface LiveContextResult {
  matchedPeople: Array<{
    name: string
    id: string
    company: string | null
    role: string | null
    recentMeetings: Array<{ id: string; title: string; date: string }>
    openCommitments: Array<{ text: string; dueDate: string | null }>
  }>
  matchedProjects: Array<{
    id: string
    name: string
    status: string
    recentDecisions: Array<{ text: string; date: string }>
  }>
  detectedCommitments: string[]
  detectedTopics: string[]
}

const EXTRACT_SYSTEM = `You extract structured data from a meeting transcript excerpt. Return ONLY valid JSON, no markdown.

{
  "people": ["First Last", ...],
  "topics": ["topic phrase", ...],
  "commitments": ["someone will do something by when", ...],
  "project": "project name or null"
}

Rules:
- people: proper names mentioned (not "you", "me", "they" — only real names like "Sarah Chen", "Mike")
- topics: 1-3 key discussion themes (concise phrases)
- commitments: action items where someone promised to do something (include who + what + deadline if mentioned)
- project: if a specific project/product name is discussed, return it; otherwise null
- Be precise. Only extract what's explicitly stated in the text.`

/**
 * Extract entities from recent transcript text using a fast LLM call.
 */
export async function extractLiveEntities(recentTranscript: string): Promise<LiveEntities | null> {
  const model = resolveSelectedAIModel()
  if (!model || !recentTranscript.trim()) return null

  try {
    const response = await routeLLM(
      [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: `Extract entities from this meeting excerpt:\n\n${recentTranscript.slice(0, 4000)}` },
      ],
      model
    )

    const cleaned = response.replace(/```json?\n?/gi, '').replace(/```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return {
      people: Array.isArray(parsed.people) ? parsed.people.filter((p: any) => typeof p === 'string' && p.length > 1) : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.filter((t: any) => typeof t === 'string').slice(0, 5) : [],
      commitments: Array.isArray(parsed.commitments) ? parsed.commitments.filter((c: any) => typeof c === 'string') : [],
      project: typeof parsed.project === 'string' ? parsed.project : null,
    }
  } catch (err) {
    console.error('[live-context] Entity extraction failed:', err)
    return null
  }
}

/**
 * Extract entities from transcript and enrich by matching against the memory graph.
 * Returns matched people with their history, matched projects with decisions,
 * and raw detected commitments/topics.
 */
export async function extractAndEnrich(recentTranscript: string): Promise<LiveContextResult> {
  const empty: LiveContextResult = { matchedPeople: [], matchedProjects: [], detectedCommitments: [], detectedTopics: [] }

  const entities = await extractLiveEntities(recentTranscript)
  if (!entities) return empty

  const db = getDb()
  const result: LiveContextResult = {
    matchedPeople: [],
    matchedProjects: [],
    detectedCommitments: entities.commitments,
    detectedTopics: entities.topics,
  }

  // Fuzzy-match people against the people store
  if (entities.people.length > 0) {
    const allPeople = db.prepare(`
      SELECT id, name, email, company, role FROM people
    `).all() as any[]

    for (const name of entities.people) {
      const match = findBestMatch(name, allPeople, (p: any) => p.name, 0.6)
      if (!match) continue

      const person = match.item
      // Fetch recent meetings for this person
      const meetings = db.prepare(`
        SELECT n.id, n.title, n.date FROM notes n
        JOIN note_people np ON np.note_id = n.id
        WHERE np.person_id = ?
        ORDER BY n.date DESC LIMIT 3
      `).all(person.id) as any[]

      // Fetch open commitments involving this person
      const commitments = db.prepare(`
        SELECT text, due_date as dueDate FROM commitments
        WHERE status = 'open' AND (assignee_id = ? OR owner = ?)
        ORDER BY due_date ASC LIMIT 3
      `).all(person.id, person.name.toLowerCase()) as any[]

      result.matchedPeople.push({
        name: person.name,
        id: person.id,
        company: person.company,
        role: person.role,
        recentMeetings: meetings,
        openCommitments: commitments,
      })
    }
  }

  // Match project names against project store
  const projectNames = [entities.project, ...entities.topics].filter(Boolean) as string[]
  if (projectNames.length > 0) {
    const allProjects = db.prepare(`
      SELECT id, name, status FROM projects WHERE status IN ('active', 'suggested')
    `).all() as any[]

    const seen = new Set<string>()
    for (const pName of projectNames) {
      const match = findBestMatch(pName, allProjects, (p: any) => p.name, 0.5)
      if (!match || seen.has(match.item.id)) continue
      seen.add(match.item.id)

      const project = match.item
      const decisions = db.prepare(`
        SELECT text, date FROM decisions
        WHERE project_id = ?
        ORDER BY created_at DESC LIMIT 3
      `).all(project.id) as any[]

      result.matchedProjects.push({
        id: project.id,
        name: project.name,
        status: project.status,
        recentDecisions: decisions,
      })
    }
  }

  return result
}
