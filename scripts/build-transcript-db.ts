#!/usr/bin/env npx tsx
/**
 * Build the Lenny's Podcast transcript FTS5 database.
 *
 * Usage:
 *   npx tsx scripts/build-transcript-db.ts [transcripts-dir] [output-path]
 *
 * Defaults:
 *   transcripts-dir: /tmp/lenny-transcripts/episodes
 *   output-path:     resources/lenny-transcripts.db
 */

import { readdirSync, readFileSync, existsSync, mkdirSync, unlinkSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const CHUNK_WORDS = 500
const OVERLAP_WORDS = 50

// ── Parse YAML frontmatter (simple, no dep) ─────────────────────────────

function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }

  const meta: Record<string, any> = {}
  let currentKey = ''
  let inArray = false

  for (const line of match[1].split('\n')) {
    if (inArray) {
      if (line.startsWith('- ')) {
        if (!Array.isArray(meta[currentKey])) meta[currentKey] = []
        meta[currentKey].push(line.slice(2).trim().replace(/^['"]|['"]$/g, ''))
        continue
      }
      inArray = false
    }

    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/)
    if (kvMatch) {
      currentKey = kvMatch[1]
      const val = kvMatch[2].trim()
      if (val === '' || val === '|') {
        inArray = true
        meta[currentKey] = []
      } else {
        meta[currentKey] = val.replace(/^['"]|['"]$/g, '')
      }
    }
  }

  return { meta, body: match[2] }
}

// ── Chunk text into ~CHUNK_WORDS word segments with overlap ─────────────

function chunkText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= CHUNK_WORDS) return [words.join(' ')]

  const chunks: string[] = []
  let start = 0
  while (start < words.length) {
    const end = Math.min(start + CHUNK_WORDS, words.length)
    chunks.push(words.slice(start, end).join(' '))
    start = end - OVERLAP_WORDS
    if (start + OVERLAP_WORDS >= words.length) break
  }
  return chunks
}

// ── Strip speaker timestamps for cleaner FTS ────────────────────────────

function cleanTranscriptBody(body: string): string {
  let cleaned = body.replace(/^#+\s+.*$/gm, '')
  // "Shreyas Doshi (00:04:14):" → "Shreyas Doshi:"
  cleaned = cleaned.replace(/^([A-Z][^(]*)\(\d{2}:\d{2}:\d{2}\):/gm, '$1:')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
  return cleaned
}

function escSQL(s: string): string {
  return s.replace(/'/g, "''")
}

// ── Main ────────────────────────────────────────────────────────────────

function main() {
  const transcriptsDir = process.argv[2] || '/tmp/lenny-transcripts/episodes'
  const outputPath = process.argv[3] || join(__dirname, '..', 'resources', 'lenny-transcripts.db')

  if (!existsSync(transcriptsDir)) {
    console.error(`Transcripts directory not found: ${transcriptsDir}`)
    console.error('Clone https://github.com/ChatPRD/lennys-podcast-transcripts.git first')
    process.exit(1)
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  if (existsSync(outputPath)) unlinkSync(outputPath)

  // Build SQL statements
  const sqlParts: string[] = []

  sqlParts.push(`
    CREATE TABLE episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest TEXT NOT NULL,
      title TEXT NOT NULL,
      youtube_url TEXT,
      publish_date TEXT,
      duration TEXT,
      keywords TEXT
    );

    CREATE TABLE passages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL REFERENCES episodes(id),
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE passages_fts USING fts5(
      text,
      content='passages',
      content_rowid='id'
    );

    CREATE TRIGGER passages_ai AFTER INSERT ON passages BEGIN
      INSERT INTO passages_fts(rowid, text) VALUES (new.id, new.text);
    END;
  `)

  const guests = readdirSync(transcriptsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()

  let episodeCount = 0
  let passageCount = 0

  sqlParts.push('BEGIN TRANSACTION;')

  for (const guestDir of guests) {
    const transcriptPath = join(transcriptsDir, guestDir, 'transcript.md')
    if (!existsSync(transcriptPath)) continue

    const raw = readFileSync(transcriptPath, 'utf-8')
    const { meta, body } = parseFrontmatter(raw)

    const guest = meta.guest || guestDir.replace(/-/g, ' ')
    const title = meta.title || guest
    const youtubeUrl = meta.youtube_url || ''
    const publishDate = meta.publish_date || ''
    const duration = meta.duration || ''
    const keywords = Array.isArray(meta.keywords) ? meta.keywords.join(', ') : (meta.keywords || '')

    episodeCount++

    sqlParts.push(
      `INSERT INTO episodes (guest, title, youtube_url, publish_date, duration, keywords) VALUES ('${escSQL(guest)}', '${escSQL(title)}', '${escSQL(youtubeUrl)}', '${escSQL(publishDate)}', '${escSQL(duration)}', '${escSQL(keywords)}');`
    )

    const cleaned = cleanTranscriptBody(body)
    const chunks = chunkText(cleaned)

    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].trim().length < 50) continue
      sqlParts.push(
        `INSERT INTO passages (episode_id, chunk_index, text) VALUES (${episodeCount}, ${i}, '${escSQL(chunks[i])}');`
      )
      passageCount++
    }
  }

  sqlParts.push('COMMIT;')
  sqlParts.push(`INSERT INTO passages_fts(passages_fts) VALUES('optimize');`)

  const sql = sqlParts.join('\n')

  // Pipe to sqlite3
  execFileSync('sqlite3', [outputPath], { input: sql, maxBuffer: 100 * 1024 * 1024 })

  const size = statSync(outputPath).size
  console.log(`✅ Built ${outputPath}`)
  console.log(`   ${episodeCount} episodes, ${passageCount} passages`)
  console.log(`   ${(size / 1024 / 1024).toFixed(1)} MB`)
}

main()
