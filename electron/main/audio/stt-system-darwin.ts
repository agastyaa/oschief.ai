/**
 * macOS System STT: uses the Speech framework via a small Swift script.
 * No API key; requires user to grant Speech Recognition in System Settings.
 */

import { spawn } from 'child_process'
import { writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { existsSync } from 'fs'

const SCRIPT_NAME = 'syag-speech-helper.swift'

function getHelperScriptPath(): string | null {
  // Packaged app: extraResources puts script at Contents/Resources/darwin/
  try {
    const resourcesPath = app.getPath('resourcesPath')
    const packaged = join(resourcesPath, 'darwin', SCRIPT_NAME)
    if (existsSync(packaged)) return packaged
  } catch {
    // resourcesPath can throw in some contexts (e.g. dev before ready); fall back to dev path
  }
  // Dev: from project root, electron/resources/darwin/
  const dev = join(app.getAppPath(), 'electron', 'resources', 'darwin', SCRIPT_NAME)
  if (existsSync(dev)) return dev
  return null
}

export async function sttSystemDarwin(wavBuffer: Buffer): Promise<string> {
  const scriptPath = getHelperScriptPath()
  if (!scriptPath) {
    throw new Error(
      'Apple Speech helper not found. On macOS the app bundle should include electron/resources/darwin/syag-speech-helper.swift.'
    )
  }

  const tmpDir = join(app.getPath('temp'), 'syag-system-stt')
  mkdirSync(tmpDir, { recursive: true })
  const wavPath = join(tmpDir, `speech-${Date.now()}.wav`)
  try {
    writeFileSync(wavPath, wavBuffer)

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn('swift', [scriptPath, wavPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (chunk) => { stdout += chunk.toString() })
      proc.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
      proc.on('error', (err) => reject(new Error(`Failed to run Apple Speech: ${err.message}`)))
      proc.on('close', (code) => {
        if (code === 0) resolve(stdout.trim())
        else reject(new Error(stderr.trim() || `Apple Speech exited with code ${code}`))
      })
    })

    return result
  } finally {
    try {
      unlinkSync(wavPath)
    } catch {
      // ignore
    }
  }
}

export function isSystemSTTAvailable(): boolean {
  if (process.platform !== 'darwin') return false
  return getHelperScriptPath() !== null
}
