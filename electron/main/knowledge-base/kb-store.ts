/**
 * Knowledge Base Store
 *
 * Scans a user-selected folder of .md/.txt files, chunks them,
 * stores in SQLite, and provides BM25-style search.
 */

import { getDb } from '../storage/database'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, basename, extname } from 'path'
import { createHash } from 'crypto'

// ── Types ────────────────────────────────────────────────────────

export interface KBChunk {
  id: string
  filePath: string
  fileName: string
  chunkIndex: number
  content: string
  checksum: string
}

export interface KBSearchResult {
  chunk: KBChunk
  score: number
}

// ── Chunking ─────────────────────────────────────────────────────

const CHUNK_TARGET_WORDS = 400
const CHUNK_OVERLAP_WORDS = 60
const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.markdown'])

function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= CHUNK_TARGET_WORDS) return [text.trim()]

  const chunks: string[] = []
  let start = 0
  while (start < words.length) {
    const end = Math.min(start + CHUNK_TARGET_WORDS, words.length)
    chunks.push(words.slice(start, end).join(' '))
    if (end >= words.length) break
    start = end - CHUNK_OVERLAP_WORDS
  }
  return chunks
}

function fileChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

function generateId(): string {
  return `kb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Folder scanning ──────────────────────────────────────────────

function walkFolder(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...walkFolder(full))
      } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        results.push(full)
      }
    }
  } catch {
    // permission denied, etc.
  }
  return results
}

// ── Database operations ──────────────────────────────────────────

export function scanFolder(folderPath: string): { added: number; updated: number; removed: number; total: number } {
  const db = getDb()
  const files = walkFolder(folderPath)

  const existingChecksums = new Map<string, string>()
  const rows = db.prepare('SELECT file_path, checksum FROM kb_chunks GROUP BY file_path').all() as any[]
  for (const row of rows) existingChecksums.set(row.file_path, row.checksum)

  let added = 0
  let updated = 0
  const seenPaths = new Set<string>()

  const insertStmt = db.prepare(
    'INSERT INTO kb_chunks (id, file_path, file_name, chunk_index, content, checksum) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const deleteFileStmt = db.prepare('DELETE FROM kb_chunks WHERE file_path = ?')

  const tx = db.transaction(() => {
    for (const filePath of files) {
      seenPaths.add(filePath)
      let content: string
      try {
        content = readFileSync(filePath, 'utf-8')
      } catch { continue }

      const checksum = fileChecksum(content)
      if (existingChecksums.get(filePath) === checksum) continue

      deleteFileStmt.run(filePath)
      const chunks = chunkText(content)
      const fileName = basename(filePath)
      for (let i = 0; i < chunks.length; i++) {
        insertStmt.run(generateId(), filePath, fileName, i, chunks[i], checksum)
      }

      if (existingChecksums.has(filePath)) updated++
      else added++
    }

    // Remove chunks for deleted files
    const allPaths = db.prepare('SELECT DISTINCT file_path FROM kb_chunks').all() as any[]
    for (const row of allPaths) {
      if (!seenPaths.has(row.file_path)) {
        deleteFileStmt.run(row.file_path)
      }
    }
  })

  tx()

  const removed = [...existingChecksums.keys()].filter(p => !seenPaths.has(p)).length
  const total = (db.prepare('SELECT COUNT(*) as c FROM kb_chunks').get() as any).c

  return { added, updated, removed, total }
}

export function getChunkCount(): number {
  try {
    return (getDb().prepare('SELECT COUNT(*) as c FROM kb_chunks').get() as any).c
  } catch {
    return 0
  }
}

export function clearAllChunks(): void {
  getDb().exec('DELETE FROM kb_chunks')
}

// ── BM25-style search ────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'of', 'in', 'to', 'and', 'or', 'for',
  'on', 'at', 'by', 'with', 'from', 'as', 'be', 'was', 'were', 'been',
  'are', 'have', 'has', 'had', 'do', 'does', 'did', 'but', 'not', 'this',
  'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me',
  'my', 'your', 'his', 'her', 'our', 'their', 'what', 'which', 'who',
  'will', 'would', 'can', 'could', 'should', 'so', 'if', 'then', 'than',
  'no', 'yes', 'just', 'also', 'about', 'up', 'out', 'all', 'there',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
}

export function searchKB(query: string, topK = 5): KBSearchResult[] {
  const db = getDb()
  const allChunks = db.prepare('SELECT id, file_path, file_name, chunk_index, content, checksum FROM kb_chunks').all() as KBChunk[]
  if (allChunks.length === 0) return []

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  // Build document frequency
  const df = new Map<string, number>()
  const N = allChunks.length
  for (const chunk of allChunks) {
    const uniqueTokens = new Set(tokenize(chunk.content))
    for (const t of uniqueTokens) df.set(t, (df.get(t) ?? 0) + 1)
  }

  // BM25 params
  const k1 = 1.5
  const b = 0.75
  const avgDl = allChunks.reduce((sum, c) => sum + tokenize(c.content).length, 0) / N

  const scored: KBSearchResult[] = []

  for (const chunk of allChunks) {
    const tokens = tokenize(chunk.content)
    const dl = tokens.length
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)

    let score = 0
    for (const qt of queryTokens) {
      const termFreq = tf.get(qt) ?? 0
      if (termFreq === 0) continue
      const docFreq = df.get(qt) ?? 0
      const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1)
      score += idf * (termFreq * (k1 + 1)) / (termFreq + k1 * (1 - b + b * dl / avgDl))
    }

    if (score > 0) scored.push({ chunk, score })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}
