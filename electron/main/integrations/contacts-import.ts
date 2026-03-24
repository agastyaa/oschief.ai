/**
 * Contacts Import
 *
 * Import contacts from VCF (vCard) files or Google People API.
 * Bootstraps the people graph with names, emails, companies, and roles.
 *
 * Supports:
 * - VCF file import (universal — works with Google, Outlook, iCloud, any contact app)
 * - Google People API (if contacts scope is available)
 */

import { readFileSync } from 'fs'
import { upsertPerson } from '../memory/people-store'

export interface ImportedContact {
  name: string
  email?: string
  company?: string
  role?: string
}

export interface ImportResult {
  total: number
  imported: number
  skipped: number  // already existed (matched by email)
  errors: number
}

// ── VCF Parser ──────────────────────────────────────────────────────

/**
 * Parse a VCF (vCard) file and extract contacts.
 * Handles vCard 2.1, 3.0, and 4.0 formats.
 */
export function parseVCF(content: string): ImportedContact[] {
  const contacts: ImportedContact[] = []
  const cards = content.split('BEGIN:VCARD')

  for (const card of cards) {
    if (!card.includes('END:VCARD')) continue

    let name: string | undefined
    let email: string | undefined
    let company: string | undefined
    let role: string | undefined

    const lines = card.split(/\r?\n/)
    for (const rawLine of lines) {
      // Handle line folding (continuation lines starting with space/tab)
      const line = rawLine.replace(/^\s+/, '')

      // FN (formatted name) — preferred
      if (line.startsWith('FN:') || line.startsWith('FN;')) {
        name = extractValue(line)
      }

      // N (structured name) — fallback if no FN
      if (!name && (line.startsWith('N:') || line.startsWith('N;'))) {
        const parts = extractValue(line).split(';')
        const lastName = parts[0]?.trim()
        const firstName = parts[1]?.trim()
        if (firstName || lastName) {
          name = [firstName, lastName].filter(Boolean).join(' ')
        }
      }

      // EMAIL
      if (line.startsWith('EMAIL') && line.includes(':')) {
        const val = extractValue(line).toLowerCase().trim()
        if (val.includes('@')) email = val
      }

      // ORG (organization)
      if (line.startsWith('ORG:') || line.startsWith('ORG;')) {
        company = extractValue(line).split(';')[0]?.trim()
      }

      // TITLE (job title)
      if (line.startsWith('TITLE:') || line.startsWith('TITLE;')) {
        role = extractValue(line)
      }
    }

    if (name && name.trim()) {
      contacts.push({
        name: name.trim(),
        email: email || undefined,
        company: company || undefined,
        role: role || undefined,
      })
    }
  }

  return contacts
}

function extractValue(line: string): string {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return ''
  return line.slice(colonIdx + 1).trim()
}

// ── Import Flow ─────────────────────────────────────────────────────

/**
 * Import contacts from a VCF file into the people graph.
 */
export function importVCFFile(filePath: string): ImportResult {
  const content = readFileSync(filePath, 'utf-8')
  const contacts = parseVCF(content)
  return importContacts(contacts)
}

/**
 * Import a list of contacts into the people graph.
 * Uses upsertPerson which handles deduplication via email + fuzzy name matching.
 */
export function importContacts(contacts: ImportedContact[]): ImportResult {
  let imported = 0
  let skipped = 0
  let errors = 0

  for (const contact of contacts) {
    try {
      const result = upsertPerson({
        name: contact.name,
        email: contact.email,
        company: contact.company,
        role: contact.role,
      })
      if (result) imported++
      else skipped++
    } catch (err) {
      console.error(`[contacts-import] Failed to import ${contact.name}:`, err)
      errors++
    }
  }

  console.log(`[contacts-import] Imported ${imported}, skipped ${skipped}, errors ${errors} from ${contacts.length} contacts`)
  return { total: contacts.length, imported, skipped, errors }
}
