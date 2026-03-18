/**
 * Read-only route handlers for the Agent API.
 * All data comes from SQLite — no writes, no mutations.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { getAllNotes, getNote } from '../storage/database'
import { app } from 'electron'

const API_VERSION = '1.1.0'

// ── Helpers ─────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: any): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  })
  res.end(json)
}

function parseUrl(req: IncomingMessage): { pathname: string; query: URLSearchParams } {
  const url = new URL(req.url ?? '/', 'http://localhost')
  return { pathname: url.pathname, query: url.searchParams }
}

// ── Route dispatch ──────────────────────────────────────────────────

export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed', message: 'This API is read-only. Only GET requests are accepted.' })
    return
  }

  const { pathname, query } = parseUrl(req)

  if (pathname === '/v1/health') return handleHealth(res)
  if (pathname === '/v1/notes') return handleListNotes(res, query)

  const noteMatch = pathname.match(/^\/v1\/notes\/([^/]+)$/)
  if (noteMatch) return handleGetNote(res, noteMatch[1])

  const transcriptMatch = pathname.match(/^\/v1\/notes\/([^/]+)\/transcript$/)
  if (transcriptMatch) return handleGetTranscript(res, transcriptMatch[1])

  const actionItemsMatch = pathname.match(/^\/v1\/notes\/([^/]+)\/action-items$/)
  if (actionItemsMatch) return handleGetActionItems(res, actionItemsMatch[1])

  sendJson(res, 404, { error: 'Not Found', message: `No route for ${pathname}` })
}

// ── Handlers ────────────────────────────────────────────────────────

function handleHealth(res: ServerResponse): void {
  sendJson(res, 200, {
    ok: true,
    version: API_VERSION,
    app: app.getName(),
  })
}

function handleListNotes(res: ServerResponse, query: URLSearchParams): void {
  let notes = getAllNotes()

  const q = query.get('q')?.toLowerCase()
  if (q) {
    notes = notes.filter(n =>
      n.title?.toLowerCase().includes(q) ||
      n.summary?.overview?.toLowerCase().includes(q) ||
      n.personalNotes?.toLowerCase().includes(q)
    )
  }

  const limit = Math.min(parseInt(query.get('limit') ?? '100', 10), 500)
  const offset = parseInt(query.get('offset') ?? '0', 10)
  const total = notes.length
  notes = notes.slice(offset, offset + limit)

  sendJson(res, 200, {
    notes: notes.map(n => ({
      id: n.id,
      title: n.title,
      date: n.date,
      time: n.time,
      duration: n.duration,
      timeRange: n.timeRange,
      folderId: n.folderId,
      summary: n.summary ? { overview: n.summary.overview } : null,
    })),
    total,
    limit,
    offset,
  })
}

function handleGetNote(res: ServerResponse, id: string): void {
  const note = getNote(id)
  if (!note) {
    sendJson(res, 404, { error: 'Not Found', message: `Note ${id} not found` })
    return
  }

  sendJson(res, 200, {
    id: note.id,
    title: note.title,
    date: note.date,
    time: note.time,
    duration: note.duration,
    timeRange: note.timeRange,
    folderId: note.folderId,
    personalNotes: note.personalNotes,
    summary: note.summary,
    coachingMetrics: note.coachingMetrics ?? null,
  })
}

function handleGetTranscript(res: ServerResponse, id: string): void {
  const note = getNote(id)
  if (!note) {
    sendJson(res, 404, { error: 'Not Found', message: `Note ${id} not found` })
    return
  }

  sendJson(res, 200, {
    noteId: id,
    transcript: (note.transcript ?? []).map((t: any) => ({
      speaker: t.speaker,
      time: t.time,
      text: t.text,
    })),
  })
}

function handleGetActionItems(res: ServerResponse, id: string): void {
  const note = getNote(id)
  if (!note) {
    sendJson(res, 404, { error: 'Not Found', message: `Note ${id} not found` })
    return
  }

  const items = note.summary?.actionItems ?? note.summary?.nextSteps ?? []
  sendJson(res, 200, {
    noteId: id,
    actionItems: items.map((item: any) => ({
      text: item.text,
      assignee: item.assignee,
      done: item.done ?? false,
      dueDate: item.dueDate ?? null,
      priority: item.priority ?? null,
    })),
  })
}
