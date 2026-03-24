/**
 * CoreML Parakeet STT — uses FluidAudio's CoreML conversion of NVIDIA Parakeet TDT 0.6B v2.
 *
 * Architecture:
 *   Electron main process → spawn Swift CLI binary → CoreML inference on ANE/CPU → text on stdout
 *
 * The Swift binary is built from electron/resources/darwin/parakeet-coreml/ (Swift Package).
 * On first use, it downloads ~600MB of CoreML model weights from HuggingFace.
 * Subsequent runs load from ~/Library/Application Support/Syag/models/parakeet-coreml/.
 *
 * Performance: ~110x RTF on M4 Pro (1 min audio ≈ 0.5s). English-only, 6% WER.
 */

import { spawn, execSync } from 'child_process'
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const BINARY_NAME = 'syag-parakeet-coreml'

/**
 * Find the built Swift binary.
 * Checks: packaged app resources → dev build output → not found.
 */
function getBinaryPath(): string | null {
  // Packaged app: extraResources/darwin/
  if (process.resourcesPath) {
    const packaged = join(process.resourcesPath, 'darwin', BINARY_NAME)
    if (existsSync(packaged)) return packaged
  }

  // Dev: built binary in the Swift package's .build directory
  const devPaths = [
    join(app.getAppPath(), 'electron', 'resources', 'darwin', 'parakeet-coreml', '.build', 'release', BINARY_NAME),
    join(app.getAppPath(), 'electron', 'resources', 'darwin', 'parakeet-coreml', '.build', 'debug', BINARY_NAME),
    join(process.cwd(), 'electron', 'resources', 'darwin', 'parakeet-coreml', '.build', 'release', BINARY_NAME),
    join(process.cwd(), 'electron', 'resources', 'darwin', 'parakeet-coreml', '.build', 'debug', BINARY_NAME),
  ]

  for (const p of devPaths) {
    if (existsSync(p)) return p
  }

  return null
}

/**
 * Build the Swift binary from source (dev only).
 * Returns the path to the built binary, or null if build fails.
 */
export async function buildParakeetCoreML(): Promise<{ ok: boolean; binaryPath?: string; error?: string }> {
  const packageDir = join(process.cwd(), 'electron', 'resources', 'darwin', 'parakeet-coreml')
  if (!existsSync(join(packageDir, 'Package.swift'))) {
    // Try from app path
    const altDir = join(app.getAppPath(), 'electron', 'resources', 'darwin', 'parakeet-coreml')
    if (!existsSync(join(altDir, 'Package.swift'))) {
      return { ok: false, error: 'Package.swift not found' }
    }
  }

  return new Promise((resolve) => {
    const proc = spawn('swift', ['build', '-c', 'release'], {
      cwd: packageDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
    proc.on('error', (err) => resolve({ ok: false, error: `Swift build failed: ${err.message}` }))
    proc.on('close', (code) => {
      if (code === 0) {
        const binaryPath = join(packageDir, '.build', 'release', BINARY_NAME)
        resolve({ ok: true, binaryPath })
      } else {
        resolve({ ok: false, error: `Swift build exited ${code}: ${stderr.slice(-500)}` })
      }
    })
  })
}

/**
 * Check if CoreML Parakeet is available (binary exists + models downloaded).
 */
export async function isParakeetCoreMLAvailable(): Promise<boolean> {
  const binary = getBinaryPath()
  if (!binary) return false

  try {
    const result = execSync(`"${binary}" check`, { timeout: 5000, stdio: 'pipe' })
    return result.toString().trim() === 'ok'
  } catch {
    return false
  }
}

/**
 * Download CoreML models (~600MB). Shows progress on stderr.
 */
export async function downloadParakeetCoreMLModels(): Promise<{ ok: boolean; error?: string }> {
  let binary = getBinaryPath()

  // If binary doesn't exist, try building it first
  if (!binary) {
    console.log('[parakeet-coreml] Binary not found, building...')
    const buildResult = await buildParakeetCoreML()
    if (!buildResult.ok) return { ok: false, error: `Build failed: ${buildResult.error}` }
    binary = buildResult.binaryPath!
  }

  return new Promise((resolve) => {
    const proc = spawn(binary!, ['download'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600000, // 10 min for large download
    })

    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString() })
    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
      console.log('[parakeet-coreml]', chunk.toString().trim())
    })
    proc.on('error', (err) => resolve({ ok: false, error: err.message }))
    proc.on('close', (code) => {
      if (code === 0 && stdout.trim() === 'ok') {
        resolve({ ok: true })
      } else {
        resolve({ ok: false, error: stderr.slice(-300) || `Exit code ${code}` })
      }
    })
  })
}

/**
 * Transcribe a WAV buffer using CoreML Parakeet.
 * Returns the transcribed text.
 */
export async function transcribeWithParakeetCoreML(wavBuffer: Buffer): Promise<string> {
  const binary = getBinaryPath()
  if (!binary) {
    throw new Error('CoreML Parakeet binary not found. Run the setup in Settings > AI Models first.')
  }

  const tmpDir = join(app.getPath('temp'), 'syag-parakeet-coreml')
  mkdirSync(tmpDir, { recursive: true })
  const wavPath = join(tmpDir, `stt-${Date.now()}.wav`)

  try {
    writeFileSync(wavPath, wavBuffer)

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn(binary, ['transcribe', wavPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000, // 60s timeout per chunk
      })

      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (chunk) => { stdout += chunk.toString() })
      proc.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
      proc.on('error', (err) => reject(new Error(`CoreML Parakeet failed: ${err.message}`)))
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim())
        } else {
          reject(new Error(`CoreML Parakeet exited ${code}: ${stderr.trim()}`))
        }
      })
    })

    return result
  } finally {
    try { unlinkSync(wavPath) } catch { /* ignore */ }
  }
}
