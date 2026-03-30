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

import { spawn, execSync, ChildProcess } from 'child_process'
import { writeFileSync, unlinkSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const BINARY_NAME = 'syag-parakeet-coreml'

// --- Persistent worker process ---
// --- Persistent worker process ---
let workerProcess: ChildProcess | null = null
let workerReady = false
let workerStarting = false
let workerFailedAt = 0 // Timestamp of last worker failure — skip retries for 5 min
const WORKER_RETRY_COOLDOWN_MS = 5 * 60 * 1000
let pendingResolve: ((text: string) => void) | null = null
let pendingReject: ((err: Error) => void) | null = null
let stdoutBuffer = ''

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

/** Clean up orphaned temp WAV files from previous sessions (e.g., after crash). */
export function cleanupParakeetTempFiles(): void {
  try {
    const tmpDir = join(app.getPath('temp'), 'syag-parakeet-coreml')
    if (!existsSync(tmpDir)) return
    const files = readdirSync(tmpDir)
    const oneHourAgo = Date.now() - 3600000
    let cleaned = 0
    for (const f of files) {
      if (!f.endsWith('.wav')) continue
      try {
        const fpath = join(tmpDir, f)
        if (statSync(fpath).mtimeMs < oneHourAgo) { unlinkSync(fpath); cleaned++ }
      } catch { /* ignore */ }
    }
    if (cleaned > 0) console.log(`[parakeet-coreml] Cleaned ${cleaned} orphaned temp files`)
  } catch { /* ignore */ }
}

/**
 * Start the persistent Parakeet worker process.
 * Loads models once, then accepts WAV paths on stdin.
 */
let workerStartPromise: Promise<void> | null = null

function startWorker(): Promise<void> {
  if (workerReady) return Promise.resolve()
  // If already starting, wait for the existing startup to complete
  if (workerStarting && workerStartPromise) return workerStartPromise
  const binary = getBinaryPath()
  if (!binary) return Promise.reject(new Error('Parakeet binary not found'))

  workerStarting = true
  workerStartPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      workerStarting = false
      reject(new Error('Parakeet worker startup timed out (60s)'))
    }, 60000)

    const proc = spawn(binary, ['serve'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: getSpawnEnv(),
    })
    workerProcess = proc

    proc.stderr?.on('data', (chunk) => {
      const msg = chunk.toString().trim()
      if (msg) console.log('[parakeet-coreml:worker]', msg)
    })

    proc.on('error', (err) => {
      console.error('[parakeet-coreml:worker] Process error:', err.message)
      clearTimeout(timeout)
      killWorker()
      if (workerStarting) { workerStarting = false; workerStartPromise = null; reject(err) }
      if (pendingReject) { const r = pendingReject; pendingReject = null; pendingResolve = null; r(err) }
    })

    proc.on('close', (code) => {
      console.log('[parakeet-coreml:worker] Process exited with code', code)
      clearTimeout(timeout)
      workerProcess = null
      workerReady = false
      workerStarting = false
      workerStartPromise = null
      if (pendingReject) {
        const r = pendingReject
        pendingReject = null
        pendingResolve = null
        r(new Error(`Parakeet worker exited unexpectedly (code ${code})`))
      }
    })

    // Read stdout line-by-line. First line should be "READY".
    stdoutBuffer = ''
    proc.stdout?.on('data', (chunk) => {
      stdoutBuffer += chunk.toString()
      let newlineIdx: number
      while ((newlineIdx = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, newlineIdx)
        stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1)

        if (!workerReady && line.trim() === 'READY') {
          workerReady = true
          workerStarting = false
          workerStartPromise = null
          clearTimeout(timeout)
          console.log('[parakeet-coreml:worker] Models loaded, worker ready')
          resolve()
          continue
        }

        // Only route lines prefixed with RESULT: to pending request (ignore FluidAudio debug output)
        if (line.startsWith('RESULT:')) {
          if (pendingResolve) {
            const r = pendingResolve
            pendingResolve = null
            pendingReject = null
            r(cleanWorkerOutput(line.slice(7))) // Strip "RESULT:" prefix
          }
        } else if (line.trim()) {
          // Log unexpected stdout from FluidAudio/CoreML runtime (not an error, just debug noise)
          console.log('[parakeet-coreml:worker:stdout]', line.trim())
        }
      }
    })
  })
}

/** Strip ONNX/CoreML noise from worker output. */
function cleanWorkerOutput(raw: string): string {
  const lines = raw.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)
  const textLines: string[] = []
  for (const line of lines) {
    const msgMatch = line.match(/^Msg\s*=\s*(.*)$/i)
    if (msgMatch) {
      const content = msgMatch[1].trim()
      if (content) textLines.push(content)
    } else {
      const errStripped = line
        .replace(/E5RT encountered an STL exception[^.]*\./g, '')
        .replace(/Failed to PropagateInputTensorShapes[^.]*\./g, '')
        .replace(/std::runtime_error during type inference[^.]*\./g, '')
        .replace(/slice_by_index: zero shape error\./g, '')
        .trim()
      if (errStripped) textLines.push(errStripped)
    }
  }
  return textLines.join(' ').replace(/\s{2,}/g, ' ').trim()
}

/** Kill the persistent worker. */
export function killWorker(): void {
  if (workerProcess) {
    try { workerProcess.stdin?.write('quit\n') } catch { /* ignore */ }
    try { workerProcess.kill() } catch { /* ignore */ }
    workerProcess = null
  }
  workerReady = false
  workerStarting = false
  pendingResolve = null
  pendingReject = null
}

/** Send a WAV path to the persistent worker and get transcription. */
function transcribeViaWorker(wavPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!workerProcess || !workerReady) {
      return reject(new Error('Worker not ready'))
    }
    if (pendingResolve) {
      return reject(new Error('Worker busy — concurrent request'))
    }

    const timeout = setTimeout(() => {
      pendingResolve = null
      pendingReject = null
      reject(new Error('Parakeet worker transcription timed out (60s)'))
    }, 60000)

    pendingResolve = (text) => { clearTimeout(timeout); resolve(text) }
    pendingReject = (err) => { clearTimeout(timeout); reject(err) }

    try {
      workerProcess.stdin?.write(wavPath + '\n')
    } catch (err: any) {
      clearTimeout(timeout)
      pendingResolve = null
      pendingReject = null
      reject(new Error(`Failed to write to worker stdin: ${err.message}`))
    }
  })
}

/**
 * Transcribe a WAV buffer using CoreML Parakeet.
 * Uses persistent worker for speed; falls back to one-shot spawn if worker unavailable.
 */
export async function transcribeWithParakeetCoreML(wavBuffer: Buffer): Promise<string> {
  const binary = getBinaryPath()
  if (!binary) {
    throw new Error('CoreML Parakeet binary not found. Run the setup in Settings > AI Models first.')
  }

  // Validate WAV header
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

  // Reject < 0.8s, pad 0.8–1.5s with silence
  const dataBytes = wavBuffer.length - 44
  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8)
  const durationSec = dataBytes / bytesPerSecond
  const MIN_DURATION_SEC = 0.8
  const PAD_TARGET_SEC = 1.5

  if (durationSec < MIN_DURATION_SEC) {
    console.warn(`[parakeet-coreml] Audio too short: ${durationSec.toFixed(2)}s (need ≥${MIN_DURATION_SEC}s)`)
    return ''
  }

  let finalWavBuffer = wavBuffer
  if (durationSec < PAD_TARGET_SEC) {
    const targetDataBytes = Math.ceil(bytesPerSecond * PAD_TARGET_SEC)
    const paddingBytes = targetDataBytes - dataBytes
    console.log(`[parakeet-coreml] Padding ${durationSec.toFixed(2)}s → ${PAD_TARGET_SEC}s (+${paddingBytes}B silence)`)
    const newBuffer = Buffer.alloc(44 + targetDataBytes)
    wavBuffer.copy(newBuffer, 0, 0, 44)
    wavBuffer.copy(newBuffer, 44, 44)
    newBuffer.writeUInt32LE(newBuffer.length - 8, 4)
    newBuffer.writeUInt32LE(targetDataBytes, 40)
    finalWavBuffer = newBuffer
  }

  // Write WAV to temp file (needed by both worker and one-shot modes)
  const tmpDir = join(app.getPath('temp'), 'syag-parakeet-coreml')
  mkdirSync(tmpDir, { recursive: true })
  const wavPath = join(tmpDir, `stt-${Date.now()}.wav`)

  try {
    const { writeFile } = require('fs/promises')
    await writeFile(wavPath, finalWavBuffer)

    // Try persistent worker first (skip if it failed recently)
    if (Date.now() - workerFailedAt > WORKER_RETRY_COOLDOWN_MS) {
      try {
        await startWorker()
        const t0 = Date.now()
        const text = await transcribeViaWorker(wavPath)
        console.log(`[parakeet-coreml:worker] ${durationSec.toFixed(1)}s audio → ${Date.now() - t0}ms`)
        return text
      } catch (workerErr: any) {
        console.warn(`[parakeet-coreml] Worker failed (${workerErr.message}), using one-shot for 5 min`)
        workerFailedAt = Date.now()
        killWorker()
      }
    }

    // One-shot spawn
    const t0 = Date.now()
    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn(binary, ['transcribe', wavPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
        env: getSpawnEnv(),
      })

      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (chunk) => { stdout += chunk.toString() })
      proc.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
      proc.on('error', (err) => reject(new Error(`CoreML Parakeet failed: ${err.message}`)))
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(cleanWorkerOutput(stdout))
        } else {
          const detail = `WAV: ${sampleRate}Hz ${numChannels}ch ${bitsPerSample}bit ${finalWavBuffer.length}B`
          reject(new Error(`CoreML Parakeet exited ${code}: ${stderr.trim()} [${detail}]`))
        }
      })
    })
    console.log(`[parakeet-coreml:oneshot] ${durationSec.toFixed(1)}s audio → ${Date.now() - t0}ms`)
    return result
  } finally {
    try { unlinkSync(wavPath) } catch { /* ignore */ }
  }
}
