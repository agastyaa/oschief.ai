/**
 * Apple Foundation Models (on-device) bridge.
 * Spawns the Swift helper that reads JSON from stdin and writes response to stdout.
 * No API key; requires macOS 26+ (Tahoe) and Apple Silicon.
 */

import { spawn } from 'child_process'
import { join } from 'path'
import { app } from 'electron'
import { existsSync } from 'fs'

const HELPER_NAME = 'syag-apple-llm.swift'

function getHelperPath(): string | null {
  if (process.resourcesPath) {
    const packaged = join(process.resourcesPath, 'darwin', HELPER_NAME)
    if (existsSync(packaged)) return packaged
  }
  try {
    const packaged = join(app.getPath('resourcesPath'), 'darwin', HELPER_NAME)
    if (existsSync(packaged)) return packaged
  } catch {
    // resourcesPath can throw in some contexts (e.g. dev before ready)
  }
  const dev = join(app.getAppPath(), 'electron', 'resources', 'darwin', HELPER_NAME)
  if (existsSync(dev)) return dev
  // Dev: main process runs from out/main/, repo root is ../..
  const fromMain = join(__dirname, '..', '..', 'electron', 'resources', 'darwin', HELPER_NAME)
  if (existsSync(fromMain)) return fromMain
  // Dev: process cwd is project root (e.g. npm run dev)
  const fromCwd = join(process.cwd(), 'electron', 'resources', 'darwin', HELPER_NAME)
  if (existsSync(fromCwd)) return fromCwd
  return null
}

export function isAppleFoundationAvailable(): boolean {
  if (process.platform !== 'darwin') return false
  const path = getHelperPath()
  if (!path) return false
  return true
}

/**
 * Check if Apple Foundation Models are available (helper exists and reports success).
 * Call the helper with { "check": true } and exit 0 = available.
 */
export async function checkAppleFoundationAvailable(): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  const helperPath = getHelperPath()
  if (!helperPath) return false
  try {
    const result = await new Promise<{ ok: boolean; stderr: string }>((resolve) => {
      const proc = spawn('swift', [helperPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      proc.stdin?.end(JSON.stringify({ check: true }))
      let stderr = ''
      proc.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
      proc.on('error', () => resolve({ ok: false, stderr: 'Failed to run swift' }))
      proc.on('close', (code) => resolve({ ok: code === 0, stderr }))
    })
    return result.ok
  } catch {
    return false
  }
}

export async function chatApple(
  messages: { role: string; content: string }[],
  _modelName: string,
  onChunk?: (chunk: { text: string; done: boolean }) => void
): Promise<string> {
  const helperPath = getHelperPath()
  if (!helperPath) {
    throw new Error(
      'Apple Foundation helper not found. Requires macOS 26+ (Tahoe) and Apple Silicon. The app bundle should include electron/resources/darwin/syag-apple-llm.swift.'
    )
  }

  const input = JSON.stringify({
    messages,
    stream: Boolean(onChunk),
  })

  return new Promise((resolve, reject) => {
    const proc = spawn('swift', [helperPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdin?.write(input, (err) => {
      if (err) reject(err)
      else proc.stdin?.end()
    })

    let lineBuffer = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      const s = chunk.toString()
      if (onChunk) {
        lineBuffer += s
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const obj = JSON.parse(trimmed) as { text?: string; done?: boolean }
            if (obj.text != null) {
              stdout += obj.text
              onChunk({ text: obj.text, done: false })
            }
            if (obj.done === true) onChunk({ text: '', done: true })
          } catch {
            if (trimmed.length > 0) {
              stdout += trimmed + '\n'
              onChunk({ text: trimmed + '\n', done: false })
            }
          }
        }
      } else {
        stdout += s
      }
    })

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    proc.on('error', (err) => {
      reject(new Error(`Apple Foundation Models: ${err.message}`))
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        const msg = stderr.trim() || `Helper exited with code ${code}`
        reject(
          new Error(
            msg.includes('macOS 26') || msg.includes('Tahoe') || msg.includes('not available')
              ? `Apple Foundation requires macOS 26+ (Tahoe) and Apple Silicon. ${msg}`
              : msg
          )
        )
      }
    })
  })
}
