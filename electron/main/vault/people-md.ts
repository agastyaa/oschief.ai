/**
 * People Markdown Generator
 *
 * Creates and updates people/{Name}.md files in the Obsidian vault.
 * Merge strategy: preserve user edits, only append new meeting backlinks.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { getVaultPath } from './vault-config'

interface PersonData {
  name: string
  email?: string | null
  company?: string | null
  role?: string | null
}

interface MeetingLink {
  date: string
  title: string
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Create or update a person's markdown file in the vault.
 * Preserves any user-added content — only updates frontmatter and appends
 * new meeting backlinks to the ## Meetings section.
 */
export function updatePersonMd(person: PersonData, meeting: MeetingLink): void {
  const vaultPath = getResolvedVaultPath()
  if (!vaultPath) return

  const peopleDir = join(vaultPath, 'people')
  const filePath = join(peopleDir, `${sanitizeName(person.name)}.md`)

  // Ensure people/ directory exists
  if (!existsSync(peopleDir)) {
    mkdirSync(peopleDir, { recursive: true })
  }

  const meetingWikilink = buildMeetingWikilink(meeting)

  if (existsSync(filePath)) {
    mergeIntoExisting(filePath, person, meetingWikilink)
  } else {
    createNew(filePath, person, meetingWikilink)
  }
}

/**
 * Update people markdown files for all attendees of a meeting.
 */
export function updatePeopleMdForNote(
  people: PersonData[],
  meeting: MeetingLink
): void {
  for (const person of people) {
    try {
      updatePersonMd(person, meeting)
    } catch (err) {
      console.error(`[people-md] Failed to update ${person.name}:`, err)
    }
  }
}

// ── Create New ──────────────────────────────────────────────────────

function createNew(filePath: string, person: PersonData, meetingWikilink: string): void {
  const lines: string[] = []

  // YAML frontmatter
  lines.push('---')
  lines.push(`name: "${escapeFrontmatter(person.name)}"`)
  if (person.email) lines.push(`email: "${escapeFrontmatter(person.email)}"`)
  if (person.company) lines.push(`company: "${escapeFrontmatter(person.company)}"`)
  if (person.role) lines.push(`role: "${escapeFrontmatter(person.role)}"`)
  lines.push('tags: [person, oschief]')
  lines.push('---')
  lines.push('')

  // Meetings section
  lines.push('## Meetings')
  lines.push(`- ${meetingWikilink}`)
  lines.push('')

  writeFileSync(filePath, lines.join('\n'), 'utf-8')
}

// ── Merge Into Existing ─────────────────────────────────────────────

function mergeIntoExisting(filePath: string, person: PersonData, meetingWikilink: string): void {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  // Update frontmatter values (preserve structure, update fields)
  const updated = updateFrontmatter(lines, person)

  // Find or create ## Meetings section and append backlink
  const result = appendMeetingLink(updated, meetingWikilink)

  writeFileSync(filePath, result.join('\n'), 'utf-8')
}

/**
 * Update frontmatter values without clobbering user additions.
 * Only updates name/email/company/role if they differ.
 */
function updateFrontmatter(lines: string[], person: PersonData): string[] {
  const result = [...lines]
  let inFrontmatter = false
  let fmEnd = -1

  for (let i = 0; i < result.length; i++) {
    if (result[i].trim() === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true
        continue
      } else {
        fmEnd = i
        break
      }
    }

    if (inFrontmatter) {
      // Update specific fields if person data is available
      if (person.email && result[i].startsWith('email:')) {
        result[i] = `email: "${escapeFrontmatter(person.email)}"`
      }
      if (person.company && result[i].startsWith('company:')) {
        result[i] = `company: "${escapeFrontmatter(person.company)}"`
      }
      if (person.role && result[i].startsWith('role:')) {
        result[i] = `role: "${escapeFrontmatter(person.role)}"`
      }
    }
  }

  // Add missing frontmatter fields before closing ---
  if (fmEnd > 0) {
    const fmContent = result.slice(0, fmEnd).join('\n')
    const toInsert: string[] = []

    if (person.email && !fmContent.includes('email:')) {
      toInsert.push(`email: "${escapeFrontmatter(person.email)}"`)
    }
    if (person.company && !fmContent.includes('company:')) {
      toInsert.push(`company: "${escapeFrontmatter(person.company)}"`)
    }
    if (person.role && !fmContent.includes('role:')) {
      toInsert.push(`role: "${escapeFrontmatter(person.role)}"`)
    }

    if (toInsert.length > 0) {
      result.splice(fmEnd, 0, ...toInsert)
    }
  }

  return result
}

/**
 * Find the ## Meetings section and append a new wikilink.
 * If the section doesn't exist, append it at the end.
 * Never duplicates an existing link.
 */
function appendMeetingLink(lines: string[], meetingWikilink: string): string[] {
  const result = [...lines]

  // Check if this link already exists anywhere
  if (result.some(line => line.includes(meetingWikilink))) {
    return result // Idempotent — already linked
  }

  // Find ## Meetings section
  const meetingsIdx = result.findIndex(line => line.trim() === '## Meetings')

  if (meetingsIdx >= 0) {
    // Find the end of the meetings list (next ## heading or EOF)
    let insertIdx = meetingsIdx + 1
    while (insertIdx < result.length) {
      const line = result[insertIdx].trim()
      if (line.startsWith('## ') && line !== '## Meetings') break
      if (line.startsWith('- ') || line === '') {
        insertIdx++
        continue
      }
      break
    }
    // Insert before the next section or at end of list
    result.splice(insertIdx, 0, `- ${meetingWikilink}`)
  } else {
    // No ## Meetings section — append at end
    // Ensure a blank line before the new section
    if (result.length > 0 && result[result.length - 1].trim() !== '') {
      result.push('')
    }
    result.push('## Meetings')
    result.push(`- ${meetingWikilink}`)
    result.push('')
  }

  return result
}

// ── Helpers ─────────────────────────────────────────────────────────

function getResolvedVaultPath(): string | null {
  const vaultPath = getVaultPath()
  if (!vaultPath) return null
  return vaultPath.startsWith('~') ? vaultPath.replace('~', homedir()) : vaultPath
}

function sanitizeName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim()
}

function escapeFrontmatter(value: string): string {
  return value.replace(/"/g, '\\"')
}

function buildMeetingWikilink(meeting: MeetingLink): string {
  const safeTitle = meeting.title.replace(/[/\\?%*:|"<>]/g, '-')
  return `[[${meeting.date} ${safeTitle}]]`
}
