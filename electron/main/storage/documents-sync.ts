import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'fs'

const SYAG_DOCS_FOLDER = 'Syag meeting notes'

function getRoot(): string {
  return join(app.getPath('documents'), SYAG_DOCS_FOLDER)
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim() || 'Unnamed'
}

function getDirForFolder(folderId: string | null, folders: { id: string; name: string }[]): string {
  const root = getRoot()
  if (!folderId) return root
  const folder = folders.find((f) => f.id === folderId)
  if (!folder) return root
  return join(root, sanitizeFolderName(folder.name))
}

function getFilePath(noteId: string, folderId: string | null, folders: { id: string; name: string }[]): string {
  return join(getDirForFolder(folderId, folders), `${noteId}.md`)
}

function noteToMarkdown(note: {
  title: string
  date: string
  time: string
  duration: string
  personalNotes?: string
  summary?: { overview: string; keyPoints?: string[]; nextSteps?: { text: string; assignee: string; done: boolean }[]; actionItems?: { text: string; assignee: string; done: boolean }[] } | null
}): string {
  const lines: string[] = [
    `# ${(note.title || 'Meeting notes').trim()}`,
    '',
    `**Date:** ${note.date} · **Time:** ${note.time} · **Duration:** ${note.duration}`,
    '',
  ]
  if (note.personalNotes?.trim()) {
    lines.push('## My notes', '', note.personalNotes.trim(), '')
  }
  if (note.summary) {
    lines.push('## Meeting overview', '', note.summary.overview || '', '')
    if (note.summary.keyPoints?.length) {
      lines.push('## Key points', '')
      note.summary.keyPoints.forEach((p) => lines.push(`- ${p}`))
      lines.push('')
    }
    const steps = note.summary.nextSteps ?? note.summary.actionItems ?? []
    if (steps.length) {
      lines.push('## Next steps', '')
      steps.forEach((s: { text: string; assignee: string; done: boolean }) => {
        const mark = s.done ? '✓' : '○'
        lines.push(`- ${mark} ${s.text} — ${s.assignee}`)
      })
      lines.push('')
    }
  }
  return lines.join('\n')
}

/**
 * Write or overwrite a summarized note to Documents/Syag meeting notes.
 * Subfolder mirrors the app folder (if any). No folder = root of "Syag meeting notes".
 */
export function upsertNoteToDocuments(note: any, folders: { id: string; name: string }[]): void {
  if (!note?.summary) return
  const dir = getDirForFolder(note.folderId ?? null, folders)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${note.id}.md`)
  writeFileSync(path, noteToMarkdown(note), 'utf8')
}

/**
 * Move a note's file when its folder changes in the app.
 */
export function moveNoteInDocuments(
  noteId: string,
  oldFolderId: string | null,
  newFolderId: string | null,
  folders: { id: string; name: string }[]
): void {
  const oldPath = getFilePath(noteId, oldFolderId, folders)
  const newPath = getFilePath(noteId, newFolderId, folders)
  if (oldPath === newPath) return
  if (!existsSync(oldPath)) return
  const newDir = getDirForFolder(newFolderId, folders)
  mkdirSync(newDir, { recursive: true })
  renameSync(oldPath, newPath)
}

/**
 * Remove a note's file when the note is deleted.
 */
export function removeNoteFromDocuments(
  noteId: string,
  folderId: string | null,
  folders: { id: string; name: string }[]
): void {
  const path = getFilePath(noteId, folderId, folders)
  if (existsSync(path)) unlinkSync(path)
}

/**
 * Sync all summarized notes to Documents (e.g. on first run or repair).
 * Creates "Syag meeting notes" and subfolders, writes only notes that have a summary.
 */
export function syncAllSummarizedNotesToDocuments(
  notes: any[],
  folders: { id: string; name: string }[]
): void {
  for (const note of notes) {
    if (note?.summary) upsertNoteToDocuments(note, folders)
  }
}
