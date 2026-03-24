/**
 * Project Markdown Generator
 *
 * Creates and updates projects/{Name}.md files in the Obsidian vault.
 * Same merge strategy as people-md.ts: preserve user edits, only append new meeting backlinks.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getVaultPath } from './vault-config'

interface ProjectData {
  name: string
  description?: string | null
  status?: string
}

interface MeetingLink {
  date: string
  title: string
}

/**
 * Create or update a project's markdown file in the vault.
 */
export function updateProjectMd(project: ProjectData, meeting: MeetingLink): void {
  const vaultPath = getResolvedVaultPath()
  if (!vaultPath) return

  const projectsDir = join(vaultPath, 'projects')
  const filePath = join(projectsDir, `${sanitizeName(project.name)}.md`)

  if (!existsSync(projectsDir)) {
    mkdirSync(projectsDir, { recursive: true })
  }

  const meetingWikilink = `[[${meeting.date} ${sanitizeName(meeting.title)}]]`

  if (existsSync(filePath)) {
    mergeIntoExisting(filePath, project, meetingWikilink)
  } else {
    createNew(filePath, project, meetingWikilink)
  }
}

function createNew(filePath: string, project: ProjectData, meetingWikilink: string): void {
  const lines: string[] = []
  lines.push('---')
  lines.push(`name: "${escapeFrontmatter(project.name)}"`)
  if (project.status) lines.push(`status: ${project.status}`)
  if (project.description) lines.push(`description: "${escapeFrontmatter(project.description)}"`)
  lines.push('tags: [project, syag]')
  lines.push('---')
  lines.push('')
  lines.push('## Meetings')
  lines.push(`- ${meetingWikilink}`)
  lines.push('')
  writeFileSync(filePath, lines.join('\n'), 'utf-8')
}

function mergeIntoExisting(filePath: string, project: ProjectData, meetingWikilink: string): void {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  // Check if link already exists (idempotent)
  if (lines.some(line => line.includes(meetingWikilink))) return

  // Find ## Meetings section
  const meetingsIdx = lines.findIndex(line => line.trim() === '## Meetings')

  if (meetingsIdx >= 0) {
    let insertIdx = meetingsIdx + 1
    while (insertIdx < lines.length) {
      const line = lines[insertIdx].trim()
      if (line.startsWith('## ') && line !== '## Meetings') break
      if (line.startsWith('- ') || line === '') { insertIdx++; continue }
      break
    }
    lines.splice(insertIdx, 0, `- ${meetingWikilink}`)
  } else {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') lines.push('')
    lines.push('## Meetings')
    lines.push(`- ${meetingWikilink}`)
    lines.push('')
  }

  writeFileSync(filePath, lines.join('\n'), 'utf-8')
}

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
