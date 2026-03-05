import { spawn, execSync } from 'child_process'
import { writeFileSync, unlinkSync, existsSync, chmodSync, mkdirSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getModelPath, getModelsDir } from './manager'
import https from 'https'
import http from 'http'
import { createWriteStream } from 'fs'

const WHISPER_CPP_VERSION = 'v1.8.3'
const WHISPER_CPP_SOURCE_URL = `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_CPP_VERSION}.tar.gz`

let whisperBinaryPath: string | null = null
let isInstallingBinary = false
let previousContext = ''

export interface WordTimestamp {
  word: string
  start: number
  end: number
}

export interface STTResult {
  text: string
  words: WordTimestamp[]
}

export function resetContext(): void {
  previousContext = ''
}

export function getContext(): string {
  return previousContext
}

function getBinDir(): string {
  const dir = join(getModelsDir(), 'bin')
  mkdirSync(dir, { recursive: true })
  return dir
}

function findWhisperBinary(): string | null {
  if (whisperBinaryPath && existsSync(whisperBinaryPath)) return whisperBinaryPath

  const binDir = getBinDir()
  const localCandidates = [
    join(binDir, 'whisper-cli'),
    join(binDir, 'main'),
    join(binDir, 'whisper'),
  ]

  for (const candidate of localCandidates) {
    if (existsSync(candidate)) {
      whisperBinaryPath = candidate
      return candidate
    }
  }

  try {
    const brewPath = execSync('which whisper-cli 2>/dev/null || which whisper-cpp 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim()
    if (brewPath && existsSync(brewPath)) {
      whisperBinaryPath = brewPath
      return brewPath
    }
  } catch {}

  const brewCandidates = [
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
    '/opt/homebrew/bin/whisper-cpp',
    '/usr/local/bin/whisper-cpp',
  ]
  for (const candidate of brewCandidates) {
    if (existsSync(candidate)) {
      whisperBinaryPath = candidate
      return candidate
    }
  }

  return null
}

export async function ensureWhisperBinary(): Promise<string> {
  const existing = findWhisperBinary()
  if (existing) return existing

  if (isInstallingBinary) {
    throw new Error('Whisper CLI is being installed, please wait...')
  }

  isInstallingBinary = true

  try {
    const builtPath = await tryBuildFromSource()
    if (builtPath) {
      whisperBinaryPath = builtPath
      return builtPath
    }

    throw new Error(
      'Could not install whisper-cli automatically. ' +
      'Please install it via Homebrew: brew install whisper-cpp'
    )
  } finally {
    isInstallingBinary = false
  }
}

/** Fire-and-forget: ensure whisper CLI is ready (e.g. after downloading a whisper model). */
export function ensureWhisperBinaryInBackground(): void {
  ensureWhisperBinary()
    .then(() => console.log('[STT] Whisper CLI ready'))
    .catch((err) => console.warn('[STT] Whisper CLI setup failed:', err.message))
}

async function tryBuildFromSource(): Promise<string | null> {
  const hasMake = commandExists('make')
  const hasCMake = commandExists('cmake')
  const hasCC = commandExists('cc') || commandExists('clang')

  if (!hasCC || (!hasMake && !hasCMake)) {
    console.log('Build tools not found, trying Homebrew install...')
    return tryHomebrewInstall()
  }

  const tmpDir = join(app.getPath('temp'), 'syag-whisper-build')
  mkdirSync(tmpDir, { recursive: true })

  const tarPath = join(tmpDir, 'whisper.tar.gz')
  const srcDir = join(tmpDir, `whisper.cpp-${WHISPER_CPP_VERSION.replace('v', '')}`)
  const binDir = getBinDir()
  const destBinary = join(binDir, 'whisper-cli')

  try {
    console.log('Downloading whisper.cpp source...')
    await downloadFile(WHISPER_CPP_SOURCE_URL, tarPath)

    console.log('Extracting source...')
    execSync(`tar xzf "${tarPath}" -C "${tmpDir}"`, { timeout: 30000 })

    if (!existsSync(srcDir)) {
      console.error('Source directory not found after extraction')
      return tryHomebrewInstall()
    }

    const cpuCount = require('os').cpus().length
    const jobs = Math.min(cpuCount, 8)

    if (hasCMake) {
      console.log('Building whisper.cpp with CMake...')
      const buildDir = join(srcDir, 'build')
      mkdirSync(buildDir, { recursive: true })
      execSync(`cmake .. -DCMAKE_BUILD_TYPE=Release -DWHISPER_METAL=ON`, {
        cwd: buildDir,
        timeout: 60000,
        stdio: 'pipe',
      })
      execSync(`cmake --build . --config Release -j ${jobs}`, {
        cwd: buildDir,
        timeout: 300000,
        stdio: 'pipe',
      })

      const cmakeBinCandidates = [
        join(buildDir, 'bin', 'whisper-cli'),
        join(buildDir, 'bin', 'main'),
        join(buildDir, 'whisper-cli'),
        join(buildDir, 'main'),
      ]
      for (const candidate of cmakeBinCandidates) {
        if (existsSync(candidate)) {
          execSync(`cp "${candidate}" "${destBinary}"`)
          chmodSync(destBinary, 0o755)
          console.log('whisper-cli built and installed successfully')
          return destBinary
        }
      }
    }

    if (hasMake && existsSync(join(srcDir, 'Makefile'))) {
      console.log('Building whisper.cpp with Make...')
      execSync(`make -j${jobs}`, {
        cwd: srcDir,
        timeout: 300000,
        stdio: 'pipe',
        env: { ...process.env, WHISPER_METAL: '1' },
      })

      const makeBinCandidates = [
        join(srcDir, 'main'),
        join(srcDir, 'whisper-cli'),
      ]
      for (const candidate of makeBinCandidates) {
        if (existsSync(candidate)) {
          execSync(`cp "${candidate}" "${destBinary}"`)
          chmodSync(destBinary, 0o755)
          console.log('whisper-cli built and installed successfully')
          return destBinary
        }
      }
    }

    console.error('Build succeeded but binary not found')
    return tryHomebrewInstall()
  } catch (err: any) {
    console.error('Build from source failed:', err.message)
    return tryHomebrewInstall()
  } finally {
    try { execSync(`rm -rf "${tmpDir}"`, { timeout: 10000 }) } catch {}
  }
}

function tryHomebrewInstall(): Promise<string | null> {
  return new Promise((resolve) => {
    const brewPaths = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']
    let brewPath: string | null = null
    for (const p of brewPaths) {
      if (existsSync(p)) { brewPath = p; break }
    }

    if (!brewPath) {
      console.log('Homebrew not found')
      resolve(null)
      return
    }

    console.log('Installing whisper-cpp via Homebrew...')
    try {
      execSync(`"${brewPath}" install whisper-cpp`, {
        timeout: 300000,
        stdio: 'pipe',
      })

      const installed = findWhisperBinary()
      if (installed) {
        console.log('whisper-cpp installed via Homebrew')
        resolve(installed)
      } else {
        resolve(null)
      }
    } catch (err: any) {
      console.error('Homebrew install failed:', err.message)
      resolve(null)
    }
  })
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe', timeout: 3000 })
    return true
  } catch {
    return false
  }
}

export function checkFfmpegAvailable(): boolean {
  return commandExists('ffmpeg')
}

/** Install ffmpeg (required for MLX Whisper audio). On macOS runs brew install ffmpeg. */
export async function installFfmpeg(): Promise<boolean> {
  if (checkFfmpegAvailable()) return true
  if (require('os').platform() !== 'darwin') {
    console.warn('[STT] ffmpeg auto-install only supported on macOS. Install ffmpeg manually.')
    return false
  }
  if (!commandExists('brew')) {
    console.warn('[STT] Homebrew not found; cannot install ffmpeg. Install from https://brew.sh')
    return false
  }
  try {
    execSync('brew install ffmpeg', { stdio: 'pipe', timeout: 120000 })
    return checkFfmpegAvailable()
  } catch (err: any) {
    console.warn('[STT] brew install ffmpeg failed:', err?.message)
    return false
  }
}

function downloadFile(url: string, dest: string, redirectCount = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) { reject(new Error('Too many redirects')); return }

    const client = url.startsWith('https') ? https : http
    client.get(url, { headers: { 'User-Agent': 'Syag/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest, redirectCount + 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const file = createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
    }).on('error', reject)
  })
}

export async function processWithLocalSTT(wavBuffer: Buffer, modelId: string, customVocabulary?: string): Promise<STTResult> {
  if (modelId === 'mlx-whisper-large-v3-turbo') {
    return processWithMLXWhisper(wavBuffer, customVocabulary)
  }
  if (modelId === 'mlx-whisper-large-v3-turbo-8bit') {
    return processWithMLXWhisper8Bit(wavBuffer, customVocabulary)
  }
  if (modelId === 'thestage-whisper-apple') {
    return processWithTheStageWhisper(wavBuffer, customVocabulary)
  }

  const modelPath = getModelPath(modelId)
  if (!modelPath) {
    throw new Error(`Model not downloaded: ${modelId}. Please download it from Settings > AI Models.`)
  }

  const binaryPath = await ensureWhisperBinary()

  const tmpDir = join(app.getPath('temp'), 'syag-stt')
  mkdirSync(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, `chunk-${Date.now()}.wav`)

  try {
    writeFileSync(tmpFile, wavBuffer)
    const result = await runWhisperCLI(binaryPath, modelPath, tmpFile, customVocabulary)

    if (result.text.trim()) {
      previousContext = result.text.trim().slice(-200)
    }

    return result
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

// ─── MLX Whisper: persistent Python worker ─────────────────────────────────

let mlxWhisperAvailable: boolean | null = null
let mlxWorker: ReturnType<typeof spawn> | null = null
let mlxWorkerReady = false
let mlxIdleTimer: ReturnType<typeof setTimeout> | null = null
const MLX_IDLE_TIMEOUT_MS = 300000 // Kill worker after 5 min idle
const MLX_STARTUP_READY_TIMEOUT_MS = 30000 // 30s to get "ready" after spawn (import only, no warmup)
const MLX_HINT = ' Ensure Python 3 and mlx-whisper are installed (pip3 install mlx-whisper). First run may take several minutes to download the model.'

const MLX_WORKER_SCRIPT = `
import json, sys, os

# Import only; model loads on first transcribe to avoid startup timeout/hangs from warmup
import mlx_whisper
# Full-precision turbo; 8-bit variant (mlx-community/whisper-large-v3-turbo-8bit) requires mlx-audio-plus, not mlx_whisper
_model_repo = "mlx-community/whisper-large-v3-turbo"

sys.stdout.write('{"status":"ready"}\\n')
sys.stdout.flush()

for line in sys.stdin:
    try:
        req = json.loads(line.strip())
        audio_path = req.get("audio_path", "")
        prompt = req.get("prompt", "")
        kwargs = {"path_or_hf_repo": _model_repo, "language": "en", "word_timestamps": True, "condition_on_previous_text": False}
        if prompt:
            kwargs["initial_prompt"] = prompt
        result = mlx_whisper.transcribe(audio_path, **kwargs)
        segments = result.get("segments", [])
        output = {"text": result.get("text", ""), "words": []}
        for seg in segments:
            for w in seg.get("words", []):
                output["words"].append({"word": w["word"], "start": w["start"], "end": w["end"]})
        sys.stdout.write(json.dumps(output) + '\\n')
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"error": str(e)}) + '\\n')
        sys.stdout.flush()
`

function ensureMLXWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mlxWorker && mlxWorkerReady) {
      resetMLXIdleTimer()
      resolve()
      return
    }

    if (mlxWorker) {
      // Worker exists but not ready — wait for it
      const waitTimer = setTimeout(() => reject(new Error('MLX worker startup timeout' + MLX_HINT)), MLX_STARTUP_READY_TIMEOUT_MS)
      const check = setInterval(() => {
        if (mlxWorkerReady) {
          clearInterval(check)
          clearTimeout(waitTimer)
          resolve()
        }
      }, 200)
      return
    }

    mlxWorkerReady = false
    mlxWorker = spawn('nice', ['-n', '10', 'python3', '-u', '-c', MLX_WORKER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let resolved = false
    let stderrBuf = ''

    mlxWorker.stderr?.on('data', (d: Buffer) => {
      stderrBuf += d.toString()
    })

    const onFirstLine = (data: Buffer) => {
      const line = data.toString().trim()
      try {
        const msg = JSON.parse(line)
        if (msg.status === 'ready') {
          mlxWorkerReady = true
          resetMLXIdleTimer()
          if (!resolved) { resolved = true; resolve() }
        }
      } catch {}
    }

    mlxWorker.stdout!.once('data', onFirstLine)

    const failWithStderr = (base: string) => {
      const tail = stderrBuf.trim().split('\n').slice(-8).join('\n')
      const suffix = tail ? ` Last stderr: ${tail.slice(-500)}` : ''
      return base + suffix + MLX_HINT
    }

    mlxWorker.on('exit', () => {
      mlxWorker = null
      mlxWorkerReady = false
      if (!resolved) { resolved = true; reject(new Error(failWithStderr('MLX worker exited during startup.'))) }
    })

    mlxWorker.on('error', (err) => {
      mlxWorker = null
      mlxWorkerReady = false
      if (!resolved) { resolved = true; reject(err) }
    })

    // Startup timeout (ready line expected within 30s; no heavy warmup)
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        killMLXWorker()
        reject(new Error(failWithStderr('MLX worker startup timed out.')))
      }
    }, MLX_STARTUP_READY_TIMEOUT_MS)
  })
}

function resetMLXIdleTimer(): void {
  if (mlxIdleTimer) clearTimeout(mlxIdleTimer)
  mlxIdleTimer = setTimeout(() => {
    console.log('[MLX] Killing idle worker after 5 min')
    killMLXWorker()
  }, MLX_IDLE_TIMEOUT_MS)
}

export function killMLXWorker(): void {
  if (mlxIdleTimer) { clearTimeout(mlxIdleTimer); mlxIdleTimer = null }
  if (mlxWorker) {
    try { mlxWorker.kill() } catch {}
    mlxWorker = null
    mlxWorkerReady = false
  }
}

export async function checkMLXWhisperAvailable(): Promise<boolean> {
  if (mlxWhisperAvailable !== null) return mlxWhisperAvailable
  try {
    execSync('python3 -c "import mlx_whisper"', { stdio: 'pipe', timeout: 10000 })
    mlxWhisperAvailable = true
  } catch {
    mlxWhisperAvailable = false
  }
  return mlxWhisperAvailable
}

export async function installMLXWhisper(): Promise<boolean> {
  await installFfmpeg()
  return new Promise<boolean>((resolve) => {
    const proc = spawn('python3', ['-m', 'pip', 'install', 'mlx-whisper'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) {
        mlxWhisperAvailable = true
        resolve(true)
      } else {
        console.warn('[MLX] pip install failed:', code, stderr.slice(-500))
        resolve(false)
      }
    })
    proc.on('error', (err) => {
      console.warn('[MLX] pip spawn error:', err.message)
      resolve(false)
    })
  })
}

async function processWithMLXWhisper(wavBuffer: Buffer, customVocabulary?: string): Promise<STTResult> {
  const available = await checkMLXWhisperAvailable()
  if (!available) {
    throw new Error('mlx-whisper is not installed. Install it from Settings > AI Models or run: pip3 install mlx-whisper')
  }

  await ensureMLXWorker()

  const tmpDir = join(app.getPath('temp'), 'syag-stt')
  mkdirSync(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, `mlx-chunk-${Date.now()}.wav`)

  try {
    writeFileSync(tmpFile, wavBuffer)

    const prompt = customVocabulary
      ? customVocabulary.split('\n').map(t => t.trim()).filter(Boolean).join(', ')
      : ''

    const request = JSON.stringify({ audio_path: tmpFile, prompt }) + '\n'

    const result = await new Promise<STTResult>((resolve, reject) => {
      if (!mlxWorker || !mlxWorker.stdin || !mlxWorker.stdout) {
        reject(new Error('MLX worker not available'))
        return
      }

      const timeout = setTimeout(() => {
        reject(new Error('MLX transcription timed out (180s). First run may take several minutes to load the model.'))
      }, 180000)

      const onData = (data: Buffer) => {
        clearTimeout(timeout)
        mlxWorker?.stdout?.removeListener('data', onData)
        resetMLXIdleTimer()

        const line = data.toString().trim()
        try {
          const parsed = JSON.parse(line)
          if (parsed.error) {
            reject(new Error(parsed.error))
            return
          }
          const text = cleanTranscriptText(parsed.text || '')
          const words: WordTimestamp[] = (parsed.words || [])
            .map((w: any) => ({ word: (w.word || '').trim(), start: w.start || 0, end: w.end || 0 }))
            .filter((w: WordTimestamp) => w.word.length > 0)
          resolve({ text, words })
        } catch {
          resolve({ text: cleanTranscriptText(line), words: [] })
        }
      }

      mlxWorker.stdout.on('data', onData)
      mlxWorker.stdin.write(request)
    })

    return result
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

// ─── MLX Whisper 8-bit (mlx-audio-plus) ─────────────────────────────────────

const MLX_8BIT_HINT = ' Install ffmpeg (brew install ffmpeg) and mlx-audio-plus (pip3 install mlx-audio-plus). First run may download the 8-bit model.'

const MLX_8BIT_WORKER_SCRIPT = `
import json, sys
from mlx_audio.stt import transcribe
_model = "mlx-community/whisper-large-v3-turbo-8bit"
sys.stdout.write('{"status":"ready"}\\n')
sys.stdout.flush()
for line in sys.stdin:
    try:
        req = json.loads(line.strip())
        audio_path = req.get("audio_path", "")
        result = transcribe(audio=audio_path, model=_model)
        text = result.get("text", "") if isinstance(result, dict) else str(result or "")
        words = []
        if isinstance(result, dict) and "segments" in result:
            for seg in result["segments"]:
                for w in seg.get("words", []):
                    words.append({"word": w.get("word", ""), "start": w.get("start", 0), "end": w.get("end", 0)})
        elif isinstance(result, dict) and "chunks" in result:
            for c in result["chunks"]:
                words.append({"word": c.get("text", ""), "start": c.get("start", 0), "end": c.get("end", 0)})
        sys.stdout.write(json.dumps({"text": text, "words": words}) + '\\n')
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"error": str(e)}) + '\\n')
        sys.stdout.flush()
`

let mlx8BitWorker: ReturnType<typeof spawn> | null = null
let mlx8BitWorkerReady = false
let mlx8BitIdleTimer: ReturnType<typeof setTimeout> | null = null
const MLX_8BIT_IDLE_TIMEOUT_MS = 300000

function resetMLX8BitIdleTimer(): void {
  if (mlx8BitIdleTimer) clearTimeout(mlx8BitIdleTimer)
  mlx8BitIdleTimer = setTimeout(() => {
    killMLX8BitWorker()
  }, MLX_8BIT_IDLE_TIMEOUT_MS)
}

export function killMLX8BitWorker(): void {
  if (mlx8BitIdleTimer) { clearTimeout(mlx8BitIdleTimer); mlx8BitIdleTimer = null }
  if (mlx8BitWorker) {
    try { mlx8BitWorker.kill() } catch {}
    mlx8BitWorker = null
    mlx8BitWorkerReady = false
  }
}

function ensureMLX8BitWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mlx8BitWorker && mlx8BitWorkerReady) {
      resetMLX8BitIdleTimer()
      resolve()
      return
    }
    if (mlx8BitWorker) {
      const waitTimer = setTimeout(() => reject(new Error('MLX 8-bit worker startup timeout' + MLX_8BIT_HINT)), MLX_STARTUP_READY_TIMEOUT_MS)
      const check = setInterval(() => {
        if (mlx8BitWorkerReady) { clearInterval(check); clearTimeout(waitTimer); resolve() }
      }, 200)
      return
    }
    mlx8BitWorkerReady = false
    mlx8BitWorker = spawn('nice', ['-n', '10', 'python3', '-u', '-c', MLX_8BIT_WORKER_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] })
    let resolved = false
    let stderrBuf = ''
    mlx8BitWorker.stderr?.on('data', (d: Buffer) => { stderrBuf += d.toString() })
    mlx8BitWorker.stdout!.once('data', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString().trim())
        if (msg.status === 'ready') {
          mlx8BitWorkerReady = true
          resetMLX8BitIdleTimer()
          if (!resolved) { resolved = true; resolve() }
        }
      } catch {}
    })
    const fail = (base: string) => {
      const tail = stderrBuf.trim().split('\n').slice(-8).join('\n').slice(-500)
      return base + (tail ? ` Last stderr: ${tail}` : '') + MLX_8BIT_HINT
    }
    mlx8BitWorker.on('exit', () => {
      mlx8BitWorker = null
      mlx8BitWorkerReady = false
      if (!resolved) { resolved = true; reject(new Error(fail('MLX 8-bit worker exited during startup.'))) }
    })
    mlx8BitWorker.on('error', (err) => {
      mlx8BitWorker = null
      mlx8BitWorkerReady = false
      if (!resolved) { resolved = true; reject(err) }
    })
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        killMLX8BitWorker()
        reject(new Error(fail('MLX 8-bit worker startup timed out.')))
      }
    }, MLX_STARTUP_READY_TIMEOUT_MS)
  })
}

let mlx8BitAvailable: boolean | null = null

export async function checkMLXWhisper8BitAvailable(): Promise<boolean> {
  if (mlx8BitAvailable !== null) return mlx8BitAvailable
  if (!checkFfmpegAvailable()) {
    mlx8BitAvailable = false
    return false
  }
  try {
    execSync('python3 -c "from mlx_audio.stt import transcribe"', { stdio: 'pipe', timeout: 10000 })
    mlx8BitAvailable = true
  } catch {
    mlx8BitAvailable = false
  }
  return mlx8BitAvailable
}

export async function installMLXWhisper8Bit(): Promise<boolean> {
  await installFfmpeg()
  return new Promise<boolean>((resolve) => {
    const proc = spawn('python3', ['-m', 'pip', 'install', 'mlx-audio-plus'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) {
        mlx8BitAvailable = true
        resolve(true)
      } else {
        console.warn('[MLX 8-bit] pip install failed:', code, stderr.slice(-500))
        resolve(false)
      }
    })
    proc.on('error', () => resolve(false))
  })
}

async function processWithMLXWhisper8Bit(wavBuffer: Buffer, customVocabulary?: string): Promise<STTResult> {
  const available = await checkMLXWhisper8BitAvailable()
  if (!available) {
    throw new Error('mlx-audio-plus or ffmpeg not available. Install from Settings > AI Models (Download) or run: brew install ffmpeg && pip3 install mlx-audio-plus')
  }
  await ensureMLX8BitWorker()
  const tmpDir = join(app.getPath('temp'), 'syag-stt')
  mkdirSync(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, `mlx8-chunk-${Date.now()}.wav`)
  try {
    writeFileSync(tmpFile, wavBuffer)
    const request = JSON.stringify({ audio_path: tmpFile }) + '\n'
    const result = await new Promise<STTResult>((resolve, reject) => {
      if (!mlx8BitWorker?.stdin || !mlx8BitWorker?.stdout) {
        reject(new Error('MLX 8-bit worker not available'))
        return
      }
      const timeout = setTimeout(() => reject(new Error('MLX 8-bit transcription timed out (180s). First run may take several minutes to load the model.')), 180000)
      const onData = (data: Buffer) => {
        clearTimeout(timeout)
        mlx8BitWorker?.stdout?.removeListener('data', onData)
        resetMLX8BitIdleTimer()
        const line = data.toString().trim()
        try {
          const parsed = JSON.parse(line)
          if (parsed.error) {
            reject(new Error(parsed.error))
            return
          }
          const text = cleanTranscriptText(parsed.text || '')
          const words: WordTimestamp[] = (parsed.words || [])
            .map((w: any) => ({ word: (w.word || '').trim(), start: w.start ?? 0, end: w.end ?? 0 }))
            .filter((w: WordTimestamp) => w.word.length > 0)
          resolve({ text, words })
        } catch {
          resolve({ text: cleanTranscriptText(line), words: [] })
        }
      }
      mlx8BitWorker.stdout.on('data', onData)
      mlx8BitWorker.stdin.write(request)
    })
    return result
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

// ─── TheStage Whisper (Apple / CoreML) ──────────────────────────────────────

const THESTAGE_HINT = ' macOS only. Install from Settings > AI Models (Download) or run: pip3 install thestage-speechkit[apple].'

const THESTAGE_WORKER_SCRIPT = `
import json, sys
# Import only; model loads on first transcribe
from thestage_speechkit.apple import ASRPipeline
_pipeline = None
def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = ASRPipeline(
            model='TheStageAI/thewhisper-large-v3-turbo',
            model_size='S',
            chunk_length_s=10
        )
    return _pipeline
sys.stdout.write('{"status":"ready"}\\n')
sys.stdout.flush()
for line in sys.stdin:
    try:
        req = json.loads(line.strip())
        audio_path = req.get("audio_path", "")
        result = get_pipeline()(audio_path, return_timestamps="word")
        text = result.get("text", "") if isinstance(result, dict) else str(result or "")
        words = []
        if isinstance(result, dict):
            if "chunks" in result:
                for c in result["chunks"]:
                    words.append({"word": c.get("word", c.get("text", "")), "start": c.get("start", 0), "end": c.get("end", 0)})
            elif "segments" in result:
                for seg in result["segments"]:
                    for w in seg.get("words", []):
                        words.append({"word": w.get("word", ""), "start": w.get("start", 0), "end": w.get("end", 0)})
        sys.stdout.write(json.dumps({"text": text, "words": words}) + '\\n')
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"error": str(e)}) + '\\n')
        sys.stdout.flush()
`

let thestageWorker: ReturnType<typeof spawn> | null = null
let thestageWorkerReady = false
let thestageIdleTimer: ReturnType<typeof setTimeout> | null = null
const THESTAGE_IDLE_TIMEOUT_MS = 300000

function resetTheStageIdleTimer(): void {
  if (thestageIdleTimer) clearTimeout(thestageIdleTimer)
  thestageIdleTimer = setTimeout(() => killTheStageWorker(), THESTAGE_IDLE_TIMEOUT_MS)
}

export function killTheStageWorker(): void {
  if (thestageIdleTimer) { clearTimeout(thestageIdleTimer); thestageIdleTimer = null }
  if (thestageWorker) {
    try { thestageWorker.kill() } catch {}
    thestageWorker = null
    thestageWorkerReady = false
  }
}

function ensureTheStageWorker(): Promise<void> {
  if (require('os').platform() !== 'darwin') {
    return Promise.reject(new Error('TheStage Whisper is only available on macOS.' + THESTAGE_HINT))
  }
  return new Promise((resolve, reject) => {
    if (thestageWorker && thestageWorkerReady) {
      resetTheStageIdleTimer()
      resolve()
      return
    }
    if (thestageWorker) {
      const waitTimer = setTimeout(() => reject(new Error('TheStage worker startup timeout' + THESTAGE_HINT)), MLX_STARTUP_READY_TIMEOUT_MS)
      const check = setInterval(() => {
        if (thestageWorkerReady) { clearInterval(check); clearTimeout(waitTimer); resolve() }
      }, 200)
      return
    }
    thestageWorkerReady = false
    thestageWorker = spawn('nice', ['-n', '10', 'python3', '-u', '-c', THESTAGE_WORKER_SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] })
    let resolved = false
    let stderrBuf = ''
    thestageWorker.stderr?.on('data', (d: Buffer) => { stderrBuf += d.toString() })
    thestageWorker.stdout!.once('data', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString().trim())
        if (msg.status === 'ready') {
          thestageWorkerReady = true
          resetTheStageIdleTimer()
          if (!resolved) { resolved = true; resolve() }
        }
      } catch {}
    })
    const fail = (base: string) => {
      const tail = stderrBuf.trim().split('\n').slice(-8).join('\n').slice(-500)
      return base + (tail ? ` Last stderr: ${tail}` : '') + THESTAGE_HINT
    }
    thestageWorker.on('exit', () => {
      thestageWorker = null
      thestageWorkerReady = false
      if (!resolved) { resolved = true; reject(new Error(fail('TheStage worker exited during startup.'))) }
    })
    thestageWorker.on('error', (err) => {
      thestageWorker = null
      thestageWorkerReady = false
      if (!resolved) { resolved = true; reject(err) }
    })
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        killTheStageWorker()
        reject(new Error(fail('TheStage worker startup timed out.')))
      }
    }, MLX_STARTUP_READY_TIMEOUT_MS)
  })
}

let thestageAvailable: boolean | null = null

export async function checkTheStageWhisperAvailable(): Promise<boolean> {
  if (require('os').platform() !== 'darwin') return false
  if (thestageAvailable !== null) return thestageAvailable
  try {
    execSync('python3 -c "from thestage_speechkit.apple import ASRPipeline"', { stdio: 'pipe', timeout: 10000 })
    thestageAvailable = true
  } catch {
    thestageAvailable = false
  }
  return thestageAvailable
}

export async function installTheStageWhisper(): Promise<boolean> {
  if (require('os').platform() !== 'darwin') {
    console.warn('[TheStage] Only available on macOS.')
    return false
  }
  await installFfmpeg()
  return new Promise<boolean>((resolve) => {
    const proc = spawn('python3', ['-m', 'pip', 'install', 'thestage-speechkit[apple]'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) {
        thestageAvailable = true
        resolve(true)
      } else {
        console.warn('[TheStage] pip install thestage-speechkit[apple] failed:', code, stderr.slice(-500))
        resolve(false)
      }
    })
    proc.on('error', () => resolve(false))
  })
}

async function processWithTheStageWhisper(wavBuffer: Buffer, customVocabulary?: string): Promise<STTResult> {
  const available = await checkTheStageWhisperAvailable()
  if (!available) {
    throw new Error('TheStage Whisper not available. macOS only. Install from Settings > AI Models (Download) or run: pip3 install thestage-speechkit[apple]')
  }
  await ensureTheStageWorker()
  const tmpDir = join(app.getPath('temp'), 'syag-stt')
  mkdirSync(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, `thestage-chunk-${Date.now()}.wav`)
  try {
    writeFileSync(tmpFile, wavBuffer)
    const request = JSON.stringify({ audio_path: tmpFile }) + '\n'
    const result = await new Promise<STTResult>((resolve, reject) => {
      if (!thestageWorker?.stdin || !thestageWorker?.stdout) {
        reject(new Error('TheStage worker not available'))
        return
      }
      const timeout = setTimeout(() => reject(new Error('TheStage transcription timed out (180s). First run may take several minutes to load the model.')), 180000)
      const onData = (data: Buffer) => {
        clearTimeout(timeout)
        thestageWorker?.stdout?.removeListener('data', onData)
        resetTheStageIdleTimer()
        const line = data.toString().trim()
        try {
          const parsed = JSON.parse(line)
          if (parsed.error) {
            reject(new Error(parsed.error))
            return
          }
          const text = cleanTranscriptText(parsed.text || '')
          const words: WordTimestamp[] = (parsed.words || [])
            .map((w: any) => ({ word: (w.word || '').trim(), start: w.start ?? 0, end: w.end ?? 0 }))
            .filter((w: WordTimestamp) => w.word.length > 0)
          resolve({ text, words })
        } catch {
          resolve({ text: cleanTranscriptText(line), words: [] })
        }
      }
      thestageWorker.stdout.on('data', onData)
      thestageWorker.stdin.write(request)
    })
    return result
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

// Exported so battery-aware mode can adjust at runtime
export let sttThreadCount = Math.min(4, Math.floor(require('os').cpus().length / 2))

export function setSTTThreadCount(n: number): void {
  sttThreadCount = Math.max(1, Math.min(n, require('os').cpus().length))
}

function runWhisperCLI(binaryPath: string, modelPath: string, audioPath: string, customVocabulary?: string): Promise<STTResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath,
      '-f', audioPath,
      '--language', 'en',
      '-t', String(sttThreadCount),
      '--beam-size', '5',
      '--entropy-thold', '2.4',
      '--logprob-thold', '-1.0',
      '--no-speech-thold', '0.6',
      '--word-thold', '0.01',
      '--max-len', '0',
      '--output-json',
      '--print-special', 'false',
      '--no-context',
    ]

    if (customVocabulary) {
      const prompt = customVocabulary.trim()
      if (prompt.length > 0) {
        args.push('--prompt', prompt)
      }
    }

    // Run at lower priority so it doesn't compete with foreground apps
    const proc = spawn('nice', ['-n', '10', binaryPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(parseWhisperOutput(stdout, audioPath))
      } else {
        reject(new Error(`whisper.cpp exited with code ${code}: ${stderr.slice(0, 1000)}`))
      }
    })

    proc.on('error', reject)
  })
}

const HALLUCINATION_PATTERNS = [
  /^TT$/i, /^T{2,}$/i,
  /^thank you\.?$/i, /^thanks for watching\.?$/i,
  /^see you in the next/i, /^subtitles by/i, /^subscribe/i,
  /^\(music\)$/i, /^\(applause\)$/i, /^\(laughter\)$/i, /^\[music\]$/i, /^\[applause\]$/i, /^\[blank_audio\]$/i,
  /^you$/i, /^\.+$/,
  /^bye\.?$/i, /^goodbye\.?$/i,
  /^please subscribe/i, /^like and subscribe/i,
  /don't forget to subscribe/i, /hit the (bell|subscribe) button/i,
]

function isHallucination(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2) return true
  if (/^[\s\W]*$/.test(trimmed)) return true
  for (const pattern of HALLUCINATION_PATTERNS) {
    if (pattern.test(trimmed)) return true
  }
  return false
}

function deduplicateRepetitions(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const result: string[] = []
  let lastSentence = ''
  let repeatCount = 0
  for (const sentence of sentences) {
    if (sentence === lastSentence) {
      repeatCount++
      if (repeatCount >= 2) continue
    } else {
      repeatCount = 0
    }
    result.push(sentence)
    lastSentence = sentence
  }
  let out = result.join(' ')
  // Phrase repetition: same 10+ char phrase 3+ times
  const phraseRepeat = /(.{10,}?)(\s+\1){2,}/g
  out = out.replace(phraseRepeat, '$1')
  return out
}

function cleanTranscriptText(text: string): string {
  let cleaned = text.trim()
  if (isHallucination(cleaned)) return ''
  cleaned = deduplicateRepetitions(cleaned)
  return cleaned
}

function parseWhisperOutput(stdout: string, audioPath: string): STTResult {
  const jsonPath = audioPath + '.json'
  try {
    if (existsSync(jsonPath)) {
      const { readFileSync } = require('fs')
      const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
      const words: WordTimestamp[] = []
      let fullText = ''

      if (jsonData.transcription) {
        for (const segment of jsonData.transcription) {
          const segText = segment.text?.trim() || ''
          if (isHallucination(segText)) continue
          fullText += ' ' + segText
          if (segment.tokens) {
            for (const token of segment.tokens) {
              const tw = token.text?.trim() || ''
              if (!tw || tw.startsWith('[') || tw.startsWith('<') || /^T{2,}$/i.test(tw)) continue
              words.push({
                word: tw,
                start: (token.offsets?.from ?? segment.offsets?.from ?? 0) / 1000,
                end: (token.offsets?.to ?? segment.offsets?.to ?? 0) / 1000,
              })
            }
          }
        }
      }

      try { unlinkSync(jsonPath) } catch {}

      const cleanedText = cleanTranscriptText(fullText)
      return {
        text: cleanedText,
        words: words.filter(w => w.word.length > 0),
      }
    }
  } catch (err) {
    console.warn('Failed to parse whisper JSON output, falling back to text:', err)
    try { unlinkSync(jsonPath) } catch {}
  }

  const words: WordTimestamp[] = []
  const textLines: string[] = []

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('whisper_') || trimmed.startsWith('main:')) continue

    const timestampMatch = trimmed.match(/^\[(\d+:\d+\.\d+)\s*-->\s*(\d+:\d+\.\d+)\]\s*(.+)$/)
    if (timestampMatch) {
      const startTime = parseTimestampToSeconds(timestampMatch[1])
      const endTime = parseTimestampToSeconds(timestampMatch[2])
      const text = timestampMatch[3].trim()
      if (isHallucination(text)) continue
      textLines.push(text)

      const lineWords = text.split(/\s+/).filter(w => w.length > 0)
      const wordDuration = lineWords.length > 0 ? (endTime - startTime) / lineWords.length : 0
      for (let i = 0; i < lineWords.length; i++) {
        words.push({
          word: lineWords[i],
          start: startTime + i * wordDuration,
          end: startTime + (i + 1) * wordDuration,
        })
      }
    } else if (!trimmed.startsWith('[')) {
      if (!isHallucination(trimmed)) textLines.push(trimmed)
    }
  }

  return {
    text: cleanTranscriptText(textLines.join(' ')),
    words,
  }
}

function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(':')
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  }
  return parseFloat(ts)
}
