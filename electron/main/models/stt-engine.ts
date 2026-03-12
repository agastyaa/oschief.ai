import { spawn, execSync } from 'child_process'
import { writeFileSync, unlinkSync, existsSync, chmodSync, mkdirSync, rmSync } from 'fs'
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
  avgConfidence?: number
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

/** Common Homebrew paths so GUI apps (with minimal PATH) can find ffmpeg. */
const BREW_BIN_PATHS = ['/opt/homebrew/bin', '/usr/local/bin']

function checkFfmpegInBrewPaths(): boolean {
  for (const dir of BREW_BIN_PATHS) {
    try {
      if (existsSync(join(dir, 'ffmpeg'))) return true
    } catch {}
  }
  return false
}

export function checkFfmpegAvailable(): boolean {
  if (commandExists('ffmpeg')) return true
  return checkFfmpegInBrewPaths()
}

/** PATH string that includes Homebrew bins so child processes (e.g. MLX worker) find ffmpeg. */
function getEnvPathWithBrew(): string {
  const existing = process.env.PATH || ''
  const extra = BREW_BIN_PATHS.filter((p) => existing.indexOf(p) === -1).join(':')
  return extra ? `${extra}:${existing}` : existing
}

/** Install ffmpeg (required for MLX Whisper audio). On macOS runs brew install ffmpeg. */
export async function installFfmpeg(): Promise<boolean> {
  if (checkFfmpegAvailable()) return true
  if (require('os').platform() !== 'darwin') {
    console.warn('[STT] ffmpeg auto-install only supported on macOS. Install ffmpeg manually.')
    return false
  }
  const brewPath = BREW_BIN_PATHS.map((p) => join(p, 'brew')).find((p) => existsSync(p))
  if (!brewPath && !commandExists('brew')) {
    console.warn('[STT] Homebrew not found; cannot install ffmpeg. Install from https://brew.sh')
    return false
  }
  try {
    const env = { ...process.env, PATH: getEnvPathWithBrew() }
    execSync(brewPath ? `${brewPath} install ffmpeg` : 'brew install ffmpeg', { stdio: 'pipe', timeout: 120000, env })
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
        kwargs = {"path_or_hf_repo": _model_repo, "language": "en", "word_timestamps": True, "condition_on_previous_text": True, "compression_ratio_threshold": 2.0, "no_speech_threshold": 0.3, "logprob_threshold": -1.0}
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
    console.log('[MLX] Spawning Python worker (python3 -c mlx_whisper)...')
    mlxWorker = spawn('nice', ['-n', '10', 'python3', '-u', '-c', MLX_WORKER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: getEnvPathWithBrew() },
    })

    let resolved = false
    let stderrBuf = ''

    mlxWorker.stderr?.on('data', (d: Buffer) => {
      const s = d.toString()
      stderrBuf += s
      if (s.trim()) console.warn('[MLX] stderr:', s.trim())
    })

    const onFirstLine = (data: Buffer) => {
      const raw = data.toString()
      const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
      for (const line of lines) {
        try {
          const msg = JSON.parse(line)
          if (msg.status === 'ready') {
            mlxWorkerReady = true
            resetMLXIdleTimer()
            console.log('[MLX] Worker ready (model will load on first transcription).')
            if (!resolved) {
              resolved = true
              resolve()
            }
            return
          }
        } catch {}
      }
    }

    mlxWorker.stdout!.once('data', onFirstLine)

    const failWithStderr = (base: string) => {
      const tail = stderrBuf.trim().split('\n').slice(-8).join('\n')
      const suffix = tail ? ` Last stderr: ${tail.slice(-500)}` : ''
      return base + suffix + MLX_HINT
    }

    mlxWorker.on('exit', (code) => {
      mlxWorker = null
      mlxWorkerReady = false
      if (!resolved) {
        resolved = true
        reject(new Error(failWithStderr('MLX worker exited during startup.')))
      } else {
        console.warn(`[MLX] Worker exited unexpectedly (code ${code}). Will respawn on next transcription request.`)
      }
    })

    mlxWorker.on('error', (err) => {
      mlxWorker = null
      mlxWorkerReady = false
      if (!resolved) {
        resolved = true
        reject(err)
      } else {
        console.warn('[MLX] Worker error after startup:', err.message)
      }
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
  const pipOk = await new Promise<boolean>((resolve) => {
    const proc = spawn('python3', ['-m', 'pip', 'install', 'mlx-whisper'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: getEnvPathWithBrew() },
    })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) {
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
  if (!pipOk) return false
  // Verify the import actually works after install
  mlxWhisperAvailable = null
  const available = await checkMLXWhisperAvailable()
  if (!available) {
    console.warn('[MLX] pip install succeeded but import check failed')
    return false
  }
  return true
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

      console.log('[MLX] Sending chunk for transcription (first run may take several minutes to load model)...')
      const timeout = setTimeout(() => {
        reject(new Error('MLX transcription timed out (300s). First run may take several minutes to load the model.'))
      }, 300000)

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
          if (text) console.log('[MLX] Result:', text.slice(0, 80) + (text.length > 80 ? '...' : ''))
          resolve({ text, words })
        } catch {
          resolve({ text: cleanTranscriptText(line), words: [] })
        }
      }

      mlxWorker.stdout.on('data', onData)
      mlxWorker.stdin.write(request)
    })

    return result
  } catch (err) {
    // Clear availability cache so next attempt rechecks dependencies
    mlxWhisperAvailable = null
    throw err
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

// ─── MLX Whisper 8-bit (mlx-audio-plus) ─────────────────────────────────────

const MLX_8BIT_HINT = ' Install ffmpeg (brew install ffmpeg) and mlx-audio-plus (pip3 install mlx-audio-plus). First run may download the 8-bit model.'

const MLX_8BIT_WORKER_SCRIPT = `
import json, sys
from mlx_audio.stt import load
from mlx_audio.stt.utils import load_audio

_model_id = "mlx-community/whisper-large-v3-turbo-8bit"
_model = None

def get_model():
    global _model
    if _model is None:
        _model = load(_model_id)
    return _model

sys.stdout.write('{"status":"ready"}\\n')
sys.stdout.flush()

for line in sys.stdin:
    try:
        req = json.loads(line.strip())
        audio_path = req.get("audio_path", "")
        model = get_model()
        audio = load_audio(audio_path)
        result = model.generate(audio)
        text = ""
        if hasattr(result, "text"):
            text = getattr(result, "text", "") or ""
        elif isinstance(result, dict):
            text = result.get("text", "") or ""
        else:
            text = str(result or "")
        words = []
        if isinstance(result, dict):
            for seg in result.get("segments", []):
                for w in seg.get("words", []):
                    words.append({"word": w.get("word", ""), "start": w.get("start", 0), "end": w.get("end", 0)})
            if not words:
                for c in result.get("chunks", []):
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
    mlx8BitWorker = spawn('nice', ['-n', '10', 'python3', '-u', '-c', MLX_8BIT_WORKER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: getEnvPathWithBrew() },
    })
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
    mlx8BitWorker.on('exit', (code) => {
      mlx8BitWorker = null
      mlx8BitWorkerReady = false
      if (!resolved) {
        resolved = true
        reject(new Error(fail('MLX 8-bit worker exited during startup.')))
      } else {
        console.warn(`[MLX 8-bit] Worker exited unexpectedly (code ${code}). Will respawn on next request.`)
      }
    })
    mlx8BitWorker.on('error', (err) => {
      mlx8BitWorker = null
      mlx8BitWorkerReady = false
      if (!resolved) {
        resolved = true
        reject(err)
      } else {
        console.warn('[MLX 8-bit] Worker error after startup:', err.message)
      }
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
    execSync('python3 -c "from mlx_audio.stt import load; from mlx_audio.stt.utils import load_audio"', { stdio: 'pipe', timeout: 10000 })
    mlx8BitAvailable = true
  } catch {
    mlx8BitAvailable = false
  }
  return mlx8BitAvailable
}

export async function installMLXWhisper8Bit(): Promise<boolean> {
  await installFfmpeg()
  const pipOk = await new Promise<boolean>((resolve) => {
    const proc = spawn('python3', ['-m', 'pip', 'install', 'mlx-audio-plus'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: getEnvPathWithBrew() },
    })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(true)
      } else {
        console.warn('[MLX 8-bit] pip install failed:', code, stderr.slice(-500))
        resolve(false)
      }
    })
    proc.on('error', () => resolve(false))
  })
  if (!pipOk) return false
  // Verify the import actually works after install
  mlx8BitAvailable = null
  const available = await checkMLXWhisper8BitAvailable()
  if (!available) {
    console.warn('[MLX 8-bit] pip install succeeded but import check failed')
    return false
  }
  return true
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
  } catch (err) {
    mlx8BitAvailable = null
    throw err
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

// ─── Repair functions ────────────────────────────────────────────────────────

/** Force-reinstall a pip package (with --force-reinstall --no-cache-dir) */
function forceInstallPip(packageName: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const proc = spawn('python3', ['-m', 'pip', 'install', '--force-reinstall', '--no-cache-dir', packageName], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: getEnvPathWithBrew() },
    })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(true)
      } else {
        console.warn(`[STT] pip install ${packageName} failed:`, code, stderr.slice(-500))
        resolve(false)
      }
    })
    proc.on('error', (err) => {
      console.warn(`[STT] pip spawn error for ${packageName}:`, err.message)
      resolve(false)
    })
  })
}

/**
 * Repair MLX Whisper: kill worker, clear cache, reinstall ffmpeg + mlx-whisper, verify.
 * Returns { ok, error? } for UI feedback.
 */
export async function repairMLXWhisper(): Promise<{ ok: boolean; error?: string }> {
  killMLXWorker()
  mlxWhisperAvailable = null
  try {
    const ffmpegOk = await installFfmpeg()
    if (!ffmpegOk) return { ok: false, error: 'Could not install ffmpeg. Run: brew install ffmpeg' }
    const pipOk = await forceInstallPip('mlx-whisper')
    if (!pipOk) return { ok: false, error: 'pip install mlx-whisper failed. Run: pip3 install mlx-whisper' }
    // Verify the import works
    mlxWhisperAvailable = null
    const available = await checkMLXWhisperAvailable()
    if (!available) return { ok: false, error: 'mlx-whisper installed but import failed. Check Python 3 installation.' }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unknown repair error' }
  }
}

/** Repair MLX Whisper 8-bit: same pattern as full-precision. */
export async function repairMLXWhisper8Bit(): Promise<{ ok: boolean; error?: string }> {
  killMLX8BitWorker()
  mlx8BitAvailable = null
  try {
    const ffmpegOk = await installFfmpeg()
    if (!ffmpegOk) return { ok: false, error: 'Could not install ffmpeg. Run: brew install ffmpeg' }
    const pipOk = await forceInstallPip('mlx-audio-plus')
    if (!pipOk) return { ok: false, error: 'pip install mlx-audio-plus failed. Run: pip3 install mlx-audio-plus' }
    mlx8BitAvailable = null
    const available = await checkMLXWhisper8BitAvailable()
    if (!available) return { ok: false, error: 'mlx-audio-plus installed but import failed.' }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unknown repair error' }
  }
}

// ─── Uninstall functions (thorough cleanup) ──────────────────────────────────

/** pip uninstall a package (with -y for non-interactive) */
function pipUninstall(packageName: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const proc = spawn('python3', ['-m', 'pip', 'uninstall', '-y', packageName], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: getEnvPathWithBrew() },
    })
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

/**
 * Fully uninstall MLX Whisper: kill worker, pip uninstall, remove HuggingFace cache.
 */
export async function uninstallMLXWhisper(): Promise<{ ok: boolean; error?: string }> {
  killMLXWorker()
  mlxWhisperAvailable = null
  const errors: string[] = []
  // 1. pip uninstall mlx-whisper
  const pipOk = await pipUninstall('mlx-whisper')
  if (!pipOk) errors.push('pip uninstall mlx-whisper may have partially failed')
  // 2. Remove HuggingFace model cache
  try {
    const hfCacheDir = join(require('os').homedir(), '.cache', 'huggingface', 'hub', 'models--mlx-community--whisper-large-v3-turbo')
    if (existsSync(hfCacheDir)) {
      rmSync(hfCacheDir, { recursive: true, force: true })
    }
  } catch (err: any) {
    errors.push(`Could not remove HF cache: ${err.message}`)
  }
  return errors.length > 0
    ? { ok: true, error: errors.join('; ') }
    : { ok: true }
}

/**
 * Fully uninstall MLX Whisper 8-bit: kill worker, pip uninstall, remove HuggingFace cache.
 */
export async function uninstallMLXWhisper8Bit(): Promise<{ ok: boolean; error?: string }> {
  killMLX8BitWorker()
  mlx8BitAvailable = null
  const errors: string[] = []
  // 1. pip uninstall mlx-audio-plus
  const pipOk = await pipUninstall('mlx-audio-plus')
  if (!pipOk) errors.push('pip uninstall mlx-audio-plus may have partially failed')
  // 2. Remove HuggingFace model cache
  try {
    const hfCacheDir = join(require('os').homedir(), '.cache', 'huggingface', 'hub', 'models--mlx-community--whisper-large-v3-turbo-8bit')
    if (existsSync(hfCacheDir)) {
      rmSync(hfCacheDir, { recursive: true, force: true })
    }
  } catch (err: any) {
    errors.push(`Could not remove HF cache: ${err.message}`)
  }
  return errors.length > 0
    ? { ok: true, error: errors.join('; ') }
    : { ok: true }
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
      '--logprob-thold', '-0.5',
      '--no-speech-thold', '0.3',
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

      let totalLogProb = 0
      let tokenCount = 0

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
              if (token.p != null && token.p > 0) {
                totalLogProb += Math.log(token.p)
                tokenCount++
              }
            }
          }
        }
      }

      try { unlinkSync(jsonPath) } catch {}

      const cleanedText = cleanTranscriptText(fullText)
      return {
        text: cleanedText,
        words: words.filter(w => w.word.length > 0),
        avgConfidence: tokenCount > 0 ? totalLogProb / tokenCount : undefined,
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
