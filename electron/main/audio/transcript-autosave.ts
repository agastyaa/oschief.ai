/**
 * Transcript auto-save — crash protection for live recordings.
 * Writes draft transcript to disk every 60s so if the app crashes mid-recording,
 * the transcript can be recovered on next launch.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs'

export interface TranscriptDraft {
  noteId: string
  transcript: Array<{ speaker: string; text: string; time: string }>
  startedAt: string
  updatedAt: string
  calendarTitle?: string
}

const FLUSH_INTERVAL_MS = 60_000 // 60 seconds
const draftsDir = () => join(app.getPath('userData'), 'drafts')

let activeDraft: TranscriptDraft | null = null
let flushTimer: NodeJS.Timeout | null = null

function ensureDraftsDir(): void {
  const dir = draftsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** Start tracking a new recording draft */
export function startDraft(noteId: string, calendarTitle?: string): void {
  ensureDraftsDir()
  activeDraft = {
    noteId,
    transcript: [],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    calendarTitle,
  }
  flushToDisk()

  // Auto-flush every 60s
  if (flushTimer) clearInterval(flushTimer)
  flushTimer = setInterval(() => flushToDisk(), FLUSH_INTERVAL_MS)
}

/** Append a transcript chunk to the active draft */
export function appendChunk(chunk: { speaker: string; text: string; time: string }): void {
  if (!activeDraft) return
  activeDraft.transcript.push(chunk)
  activeDraft.updatedAt = new Date().toISOString()
}

/** Flush current draft to disk */
function flushToDisk(): void {
  if (!activeDraft) return
  try {
    const filePath = join(draftsDir(), `${activeDraft.noteId}.json`)
    writeFileSync(filePath, JSON.stringify(activeDraft, null, 2), 'utf-8')
  } catch (err) {
    console.error('[autosave] Failed to flush transcript draft:', err)
  }
}

/** Stop tracking — flush final state and clear timer */
export function finalizeDraft(): void {
  flushToDisk()
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  activeDraft = null
}

/** Delete draft after successful note save */
export function deleteDraft(noteId: string): void {
  try {
    const filePath = join(draftsDir(), `${noteId}.json`)
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch (err) {
    console.error('[autosave] Failed to delete draft:', err)
  }
}

/** Check for orphaned drafts from a previous crash */
export function getOrphanedDrafts(): TranscriptDraft[] {
  ensureDraftsDir()
  const results: TranscriptDraft[] = []
  try {
    const files = readdirSync(draftsDir()).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(draftsDir(), file), 'utf-8')) as TranscriptDraft
        if (data.transcript && data.transcript.length > 0) {
          results.push(data)
        }
      } catch {
        // Corrupt draft — skip
      }
    }
  } catch {
    // No drafts dir
  }
  return results
}

/** Delete all orphaned drafts (after user dismisses recovery) */
export function clearAllDrafts(): void {
  try {
    const dir = draftsDir()
    if (!existsSync(dir)) return
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      unlinkSync(join(dir, file))
    }
  } catch (err) {
    console.error('[autosave] Failed to clear drafts:', err)
  }
}
