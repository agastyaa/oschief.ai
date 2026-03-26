/**
 * CoreML Parakeet STT — uses FluidAudio's CoreML conversion of NVIDIA Parakeet TDT 0.6B v2.
 *
 * Architecture:
 *   Electron main process → spawn Swift CLI binary → CoreML inference on ANE/CPU → text on stdout
 *
 * The Swift binary is built from electron/resources/darwin/parakeet-coreml/ (Swift Package).
 * On first use, it downloads ~600MB of CoreML model weights from HuggingFace.
 * Subsequent runs load from ~/Library/Application Support/OSChief/models/parakeet-coreml/.
 *
 * Performance: ~110x RTF on M4 Pro (1 min audio ≈ 0.5s). English-only, 6% WER.
 */

import { spawn, execSync } from 'child_process'
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const BINARY_NAME = 'syag-parakeet-coreml'

/** Get bundled Parakeet model dir from extraResources (if models are shipped with the app). */
function getBundledModelDir(): string | null {
  if (process.resourcesPath) {
    const bundled = join(process.resourcesPath, 'darwin', 'models', 'parakeet-coreml')
    if (existsSync(join(bundled, '.models-ready'))) return bundled
  }
  return null
}

/** Build env object with PARAKEET_MODEL_DIR if bundled models exist. */
function getSpawnEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env as Record<string, string> }
  const bundled = getBundledModelDir()
  if (bundled) env.PARAKEET_MODEL_DIR = bundled
  return env
}

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
  // In packaged app, the binary should already be in extraResources — can't build from asar
  if (app.isPackaged) {
    const packaged = join(process.resourcesPath, 'darwin', BINARY_NAME)
    if (existsSync(packaged)) {
      return { ok: true, binaryPath: packaged }
    }
    return { ok: false, error: 'Parakeet CoreML binary not found in packaged app. Reinstall the app to fix this.' }
  }

  // Dev: try app path first, then cwd fallback
  const candidates = [
    // extraResources path (also available in dev when resources are copied)
    ...(process.resourcesPath ? [join(process.resourcesPath, 'darwin', 'parakeet-coreml')] : []),
    join(app.getAppPath(), 'electron', 'resources', 'darwin', 'parakeet-coreml'),
    join(process.cwd(), 'electron', 'resources', 'darwin', 'parakeet-coreml'),
  ]
  const packageDir = candidates.find(d => existsSync(join(d, 'Package.swift')))
  if (!packageDir) {
    return { ok: false, error: `Package.swift not found (tried: ${candidates.join(', ')})` }
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
    const result = execSync(`"${binary}" check`, { timeout: 5000, stdio: 'pipe', env: getSpawnEnv() })
    return result.toString().trim() === 'ok'
  } catch {
    return false
  }
}

/**
 * Download CoreML models (~600MB). Shows progress on stderr.
 */
export async function downloadParakeetCoreMLModels(): Promise<{ ok: boolean; error?: string }> {
  // Skip download if bundled models exist
  if (getBundledModelDir()) {
    console.log('[parakeet-coreml] Bundled models detected, skipping download')
    return { ok: true }
  }

  let binary = getBinaryPath()

  // If binary doesn't exist, try building it first
  if (!binary) {
    console.log('[parakeet-coreml] Binary not found, building...')
    const buildResult = await buildParakeetCoreML()
    if (!buildResult.ok || !buildResult.binaryPath) return { ok: false, error: `Build failed: ${buildResult.error}` }
    binary = buildResult.binaryPath
  }

  if (!binary) return { ok: false, error: 'No binary path after build' }

  return new Promise((resolve) => {
    const proc = spawn(binary, ['download'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600000, // 10 min for large download
      env: getSpawnEnv(),
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

  // Validate WAV header before writing to disk
  if (wavBuffer.length < 44) {
    throw new Error('Invalid WAV buffer: too small for header')
  }
  const riffTag = wavBuffer.toString('ascii', 0, 4)
  const waveTag = wavBuffer.toString('ascii', 8, 12)
  if (riffTag !== 'RIFF' || waveTag !== 'WAVE') {
    throw new Error(`Invalid WAV header: expected RIFF/WAVE, got ${riffTag}/${waveTag}`)
  }
  const sampleRate = wavBuffer.readUInt32LE(24)
  const numChannels = wavBuffer.readUInt16LE(22)
  const bitsPerSample = wavBuffer.readUInt16LE(34)
  console.log(`[parakeet-coreml] WAV: ${sampleRate}Hz, ${numChannels}ch, ${bitsPerSample}bit, ${wavBuffer.length} bytes`)

  // Parakeet expects 16kHz mono 16-bit PCM, minimum 1 second
  if (sampleRate !== 16000) {
    console.warn(`[parakeet-coreml] Unexpected sample rate: ${sampleRate}Hz (expected 16000)`)
  }
  // FluidAudio requires minimum audio length — lowered to 0.8s to catch short utterances ("yes", "got it")
  const dataBytes = wavBuffer.length - 44
  const minDataBytes = sampleRate * numChannels * (bitsPerSample / 8) * 0.8 // 0.8 second minimum
  if (dataBytes < minDataBytes) {
    console.warn(`[parakeet-coreml] Audio too short for Parakeet: ${(dataBytes / (sampleRate * numChannels * (bitsPerSample / 8))).toFixed(2)}s (need ≥0.8s)`)
    return '' // Return empty instead of crashing
  }

  const tmpDir = join(app.getPath('temp'), 'syag-parakeet-coreml')
  mkdirSync(tmpDir, { recursive: true })
  const wavPath = join(tmpDir, `stt-${Date.now()}.wav`)

  try {
    const { writeFile } = require('fs/promises')
    await writeFile(wavPath, wavBuffer)

    // Verify file was written correctly
    const { statSync: fstatSync } = require('fs')
    const writtenSize = fstatSync(wavPath).size
    if (writtenSize !== wavBuffer.length) {
      throw new Error(`WAV file size mismatch: wrote ${writtenSize}, expected ${wavBuffer.length}`)
    }

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn(binary, ['transcribe', wavPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000, // 60s timeout per chunk
        env: getSpawnEnv(),
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
          // Include WAV details in error for debugging
          const detail = `WAV: ${sampleRate}Hz ${numChannels}ch ${bitsPerSample}bit ${wavBuffer.length}B`
          reject(new Error(`CoreML Parakeet exited ${code}: ${stderr.trim()} [${detail}]`))
        }
      })
    })

    return result
  } finally {
    try { unlinkSync(wavPath) } catch { /* ignore */ }
  }
}
