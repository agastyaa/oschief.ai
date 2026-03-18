/**
 * Read-Only Agent API — Unix domain socket HTTP server.
 *
 * Listens on ~/Library/Application Support/Syag/syag.sock (macOS).
 * Auth via Bearer token stored in keychain.
 * All endpoints are read-only.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomBytes } from 'crypto'
import { handleRequest } from './routes'

let server: Server | null = null
let socketPath: string = ''

export function getSocketPath(): string {
  if (!socketPath) socketPath = join(app.getPath('userData'), 'syag.sock')
  return socketPath
}

// ── Token management ────────────────────────────────────────────────

function keychainPath(): string {
  const dir = join(app.getPath('userData'), 'secure')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'keychain.enc')
}

function loadKeychain(): Record<string, string> {
  const path = keychainPath()
  if (!existsSync(path)) return {}
  try {
    const encrypted = readFileSync(path)
    return JSON.parse(safeStorage.decryptString(encrypted))
  } catch {
    return {}
  }
}

function saveKeychain(data: Record<string, string>): void {
  writeFileSync(keychainPath(), safeStorage.encryptString(JSON.stringify(data)))
}

export function getApiToken(): string | null {
  return loadKeychain()['api-token'] ?? null
}

export function generateApiToken(): string {
  const token = randomBytes(32).toString('hex')
  const chain = loadKeychain()
  chain['api-token'] = token
  saveKeychain(chain)
  return token
}

export function deleteApiToken(): void {
  const chain = loadKeychain()
  delete chain['api-token']
  saveKeychain(chain)
}

// ── Auth middleware ──────────────────────────────────────────────────

function authenticate(req: IncomingMessage): boolean {
  const token = getApiToken()
  if (!token) return false
  const auth = req.headers['authorization']
  if (!auth?.startsWith('Bearer ')) return false
  return auth.slice(7) === token
}

function sendJson(res: ServerResponse, status: number, body: any): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  })
  res.end(json)
}

// ── Server lifecycle ────────────────────────────────────────────────

function cleanupSocket(): void {
  const sock = getSocketPath()
  if (existsSync(sock)) {
    try { unlinkSync(sock) } catch { /* ignore */ }
  }
}

export function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) { resolve(); return }

    cleanupSocket()

    server = createServer((req, res) => {
      if (!authenticate(req)) {
        sendJson(res, 401, { error: 'Unauthorized', message: 'Missing or invalid Bearer token' })
        return
      }

      try {
        handleRequest(req, res)
      } catch (err) {
        console.error('[api] Unhandled error:', err)
        sendJson(res, 500, { error: 'Internal Server Error' })
      }
    })

    server.on('error', (err) => {
      console.error('[api] Server error:', err)
      reject(err)
    })

    const sock = getSocketPath()
    server.listen(sock, () => {
      console.log(`[api] Agent API listening on ${sock}`)
      resolve()
    })
  })
}

export function stopApiServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) { resolve(); return }
    server.close(() => {
      server = null
      cleanupSocket()
      resolve()
    })
  })
}

export function isApiRunning(): boolean {
  return server !== null && server.listening
}
