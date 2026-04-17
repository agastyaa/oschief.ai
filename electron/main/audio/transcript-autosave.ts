/**
 * Transcript auto-save — crash protection for live recordings.
 *
 * v2.11 R1.2 — flush interval tightened from 60s → 1s. The plan's explicit
 * tolerance is ≤1 second of transcription loss on force-quit. Recovery modal
 * only fires when computed loss > 5 seconds (sub-5s is silent).
 *
 * Draft write strategy:
 *   - `appendChunk()` buffers in memory (synchronous, cheap)
 *   - Timer fires every 1s and calls flushToDisk() (writes JSON atomically)
 *   - `finalizeDraft()` flushes one last time on graceful stop
 *
 * On next launch, `getOrphanedDrafts()` returns drafts that were never
 * finalized. Each draft carries:
 *   - `lastChunkAt`: wall-clock time of the newest transcript chunk
 *   - `flushedAt`: wall-clock time of the last on-disk flush
 * A renderer computes lossSeconds = (lastChunkAt - flushedAt), or falls back
 * to `recordingStoppedAt` heuristics. Loss >5s surfaces the recovery modal.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, renameSync } from 'fs'

export interface TranscriptDraft {
  noteId: string
  transcript: Array<{ speaker: string; text: string; time: string }>
  startedAt: string
  updatedAt: string
  /** R1.2 — ISO timestamp of the most recently appended chunk. Drives loss calc. */
  lastChunkAt: string
  /** R1.2 — ISO timestamp of the last successful flush to disk. */
  flushedAt: string
  calendarTitle?: string
}

export interface DraftRecovery {
  draft: TranscriptDraft
  /** Seconds of transcription potentially lost (lastChunkAt - flushedAt). */
  lossSeconds: number
  /** True when lossSeconds > 5 — recovery modal should fire. */
  shouldSurface: boolean
}

const FLUSH_INTERVAL_MS = 1000 // R1.2 — 1s (was 60s)
const LOSS_THRESHOLD_SECONDS = 5 // plan: sub-5s loss is silent
const draftsDir = () => join(app.getPath('userData'), 'drafts')

let activeDraft: TranscriptDraft | null = null
let flushTimer: NodeJS.Timeout | null = null
let lastFlushedChunkCount = 0

function ensureDraftsDir(): void {
  const dir = draftsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Start tracking a new recording draft */
export function startDraft(noteId: string, calendarTitle?: string): void {
  ensureDraftsDir()
  const now = nowIso()
  activeDraft = {
    noteId,
    transcript: [],
    startedAt: now,
    updatedAt: now,
    lastChunkAt: now,
    flushedAt: now,
    calendarTitle,
  }
  lastFlushedChunkCount = 0
  flushToDisk()

  if (flushTimer) clearInterval(flushTimer)
  flushTimer = setInterval(() => flushToDisk(), FLUSH_INTERVAL_MS)
}

/** Append a transcript chunk to the active draft */
export function appendChunk(chunk: { speaker: string; text: string; time: string }): void {
  if (!activeDraft) return
  const now = nowIso()
  activeDraft.transcript.push(chunk)
  activeDraft.updatedAt = now
  activeDraft.lastChunkAt = now
}

/**
 * Atomic flush: write to tmp file, then rename. Prevents partial writes from
 * torn reads during crash. No-op when nothing new since last flush (keeps
 * disk churn minimal at 1Hz).
 */
function flushToDisk(): void {
  if (!activeDraft) return
  if (activeDraft.transcript.length === lastFlushedChunkCount) return
  try {
    const filePath = join(draftsDir(), `${activeDraft.noteId}.json`)
    const tmpPath = filePath + '.tmp'
    const toWrite = { ...activeDraft, flushedAt: nowIso() }
    writeFileSync(tmpPath, JSON.stringify(toWrite, null, 2), 'utf-8')
    renameSync(tmpPath, filePath)
    activeDraft.flushedAt = toWrite.flushedAt
    lastFlushedChunkCount = activeDraft.transcript.length
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
  lastFlushedChunkCount = 0
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

/**
 * Compute recovery loss for a draft. Pure — exported for test coverage.
 * lastChunkAt > flushedAt means chunks were buffered but never made it to
 * disk. Older drafts (missing lastChunkAt/flushedAt fields) default to 0
 * loss — they pre-date R1.2 and we can't reconstruct it.
 */
export function computeRecovery(draft: TranscriptDraft): DraftRecovery {
  const last = draft.lastChunkAt ? Date.parse(draft.lastChunkAt) : NaN
  const flushed = draft.flushedAt ? Date.parse(draft.flushedAt) : NaN
  let lossSeconds = 0
  if (Number.isFinite(last) && Number.isFinite(flushed)) {
    lossSeconds = Math.max(0, (last - flushed) / 1000)
  }
  return {
    draft,
    lossSeconds: Math.round(lossSeconds * 10) / 10,
    shouldSurface: lossSeconds > LOSS_THRESHOLD_SECONDS,
  }
}

/** Check for orphaned drafts from a previous crash */
export function getOrphanedDrafts(): DraftRecovery[] {
  ensureDraftsDir()
  const results: DraftRecovery[] = []
  try {
    const files = readdirSync(draftsDir()).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(draftsDir(), file), 'utf-8')) as TranscriptDraft
        if (data.transcript && data.transcript.length > 0) {
          results.push(computeRecovery(data))
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
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      unlinkSync(join(dir, file))
    }
  } catch (err) {
    console.error('[autosave] Failed to clear drafts:', err)
  }
}
