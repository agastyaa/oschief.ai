/**
 * Anonymizer
 *
 * Replaces real names with Person A, Person B, etc. before sending
 * transcripts and summaries to cloud LLMs. Only active when the
 * user enables anonymization in Settings > Privacy.
 *
 * FLOW:
 *  transcript/summary text
 *       │
 *       ▼
 *  anonymize(text, attendeeNames)
 *       │
 *       ▼
 *  "Person A said..." (names replaced, mapping stored)
 *       │
 *       ▼
 *  send to cloud LLM
 *       │
 *       ▼
 *  deanonymize(response, mapping)
 *       │
 *       ▼
 *  "Jane said..." (names restored)
 */

import { getSetting } from '../storage/database'

const LABELS = [
  'Person A', 'Person B', 'Person C', 'Person D', 'Person E',
  'Person F', 'Person G', 'Person H', 'Person I', 'Person J',
]

export interface AnonymizationMap {
  /** real name → anonymized label */
  forward: Map<string, string>
  /** anonymized label → real name */
  reverse: Map<string, string>
}

/**
 * Check if anonymization is enabled in settings.
 */
export function isAnonymizationEnabled(): boolean {
  return getSetting('privacy-anonymize-cloud') === 'true'
}

/**
 * Check if attendee names should be included in cloud prompts.
 */
export function shouldIncludeNames(): boolean {
  return getSetting('privacy-include-names') !== 'false' // default: true
}

/**
 * Build an anonymization mapping for a set of names.
 */
export function buildAnonymizationMap(names: string[]): AnonymizationMap {
  const forward = new Map<string, string>()
  const reverse = new Map<string, string>()

  const uniqueNames = [...new Set(names.filter(n => n && n.trim()))]
  for (let i = 0; i < uniqueNames.length && i < LABELS.length; i++) {
    forward.set(uniqueNames[i], LABELS[i])
    // Also map lowercase and first-name-only variants
    forward.set(uniqueNames[i].toLowerCase(), LABELS[i])
    const firstName = uniqueNames[i].split(' ')[0]
    if (firstName.length > 2) {
      forward.set(firstName, LABELS[i])
      forward.set(firstName.toLowerCase(), LABELS[i])
    }
    reverse.set(LABELS[i], uniqueNames[i])
  }

  return { forward, reverse }
}

/**
 * Replace all known names in text with their anonymized labels.
 * Sorts by name length (longest first) to avoid partial replacements.
 */
export function anonymize(text: string, map: AnonymizationMap): string {
  if (map.forward.size === 0) return text

  let result = text
  // Sort entries by key length descending (longest names first)
  const entries = [...map.forward.entries()].sort((a, b) => b[0].length - a[0].length)

  for (const [name, label] of entries) {
    // Case-insensitive word-boundary replacement
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    result = result.replace(regex, label)
  }

  return result
}

/**
 * Restore real names in LLM response from anonymized labels.
 */
export function deanonymize(text: string, map: AnonymizationMap): string {
  if (map.reverse.size === 0) return text

  let result = text
  for (const [label, name] of map.reverse.entries()) {
    result = result.replaceAll(label, name)
  }

  return result
}

/**
 * Get the configured data retention period in days.
 * Returns null for "keep everything."
 */
export function getRetentionDays(): number | null {
  const setting = getSetting('privacy-retention-days')
  if (!setting || setting === 'all') return null
  const days = parseInt(setting, 10)
  return isNaN(days) ? null : days
}
