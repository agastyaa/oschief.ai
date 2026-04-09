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
let activeWhisperProc: ReturnType<typeof spawn> | null = null

/** User-visible install transcript (Settings → local models). */
export type LocalSetupResult = {
  ok: boolean
  steps: string[]
  error?: string
  /** Short manual fallback for toasts / UI */
  hint?: string
}

function logStep(steps: string[] | undefined, message: string): void {
  if (steps) steps.push(message)
}
/** Last ~200 chars of transcript per stereo channel (0=mic/You, 1=system/Others) for Whisper initial_prompt continuity. */
let previousContextByChannel: [string, string] = ['', '']

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
  previousContextByChannel = ['', '']
}

/** Kill all active STT processes and workers. Call on app quit. */
export function killAllSTTProcesses(): void {
  // Kill whisper.cpp process
  if (activeWhisperProc) {
    try { activeWhisperProc.kill('SIGTERM') } catch {}
    activeWhisperProc = null
  }
  // Kill MLX workers
  killMLXWorker()
  killMLX8BitWorker()
  // Kill Parakeet persistent worker
  import('../audio/stt-parakeet-coreml').then(({ killWorker }) => killWorker()).catch(() => {})
}

/** Remove stale temp files from previous sessions. Call on app startup. */
export function cleanStaleTempFiles(): void {
  try {
    const tmpDir = join(app.getPath('temp'), 'syag-stt')
    if (!existsSync(tmpDir)) return
    const { readdirSync, statSync } = require('fs')
    const files = readdirSync(tmpDir)
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    for (const file of files) {
      try {
        const filePath = join(tmpDir, file)
        const stat = statSync(filePath)
        if (stat.mtimeMs < oneHourAgo) {
          unlinkSync(filePath)
        }
      } catch {}
    }
  } catch {}
  // Also clean Parakeet temp files
  import('../audio/stt-parakeet-coreml').then(({ cleanupParakeetTempFiles }) => cleanupParakeetTempFiles()).catch(() => {})
}

export function getContext(): string {
  return [previousContextByChannel[0], previousContextByChannel[1]].filter(Boolean).join(' ').slice(-200)
}

/** Update continuation prompt for the next chunk on this channel (call after emitting a transcript line). */
export function setPreviousContextForChannel(channel: 0 | 1, text: string): void {
  const t = text.trim()
  if (t) previousContextByChannel[channel] = t.slice(-200)
}

export function getPreviousContextForChannel(channel: 0 | 1): string {
  return previousContextByChannel[channel] || ''
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

export async function ensureWhisperBinary(steps?: string[]): Promise<string> {
  logStep(steps, 'Looking for whisper-cli (OSChief models folder, PATH, or common Homebrew locations)…')
  const existing = findWhisperBinary()
  if (existing) {
    logStep(steps, 'Found whisper-cli — no install needed.')
    return existing
  }

  if (isInstallingBinary) {
    throw new Error('Whisper CLI is being installed, please wait...')
  }

  isInstallingBinary = true

  try {
    logStep(steps, 'whisper-cli not found. Trying build from source (needs CMake, compiler) or Homebrew install…')
    const builtPath = await tryBuildFromSource(steps)
    if (builtPath) {
      whisperBinaryPath = builtPath
      logStep(steps, 'whisper-cli is ready.')
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

/** After whisper.cpp model file is downloaded — full transcript for UI. */
export async function ensureWhisperCliSetupResult(): Promise<LocalSetupResult> {
  const steps: string[] = []
  try {
    await ensureWhisperBinary(steps)
    return { ok: true, steps }
  } catch (e: any) {
    const msg = e?.message || String(e)
    return {
      ok: false,
      steps,
      error: msg,
      hint: 'In Terminal: brew install whisper-cpp  (requires Homebrew). Or install Xcode Command Line Tools and let OSChief build from source.',
    }
  }
}

/** Fire-and-forget: ensure whisper CLI is ready (e.g. after downloading a whisper model). */
export function ensureWhisperBinaryInBackground(): void {
  ensureWhisperBinary()
    .then(() => console.log('[STT] Whisper CLI ready'))
    .catch((err) => console.warn('[STT] Whisper CLI setup failed:', err.message))
}

async function tryBuildFromSource(steps?: string[]): Promise<string | null> {
  const hasMake = commandExists('make')
  const hasCMake = commandExists('cmake')
  const hasCC = commandExists('cc') || commandExists('clang')

  if (!hasCC || (!hasMake && !hasCMake)) {
    console.log('Build tools not found, trying Homebrew install...')
    logStep(steps, 'Build tools not found (CMake/C compiler). Trying Homebrew whisper-cpp…')
    return tryHomebrewInstall(steps)
  }

  const tmpDir = join(app.getPath('temp'), 'syag-whisper-build')
  mkdirSync(tmpDir, { recursive: true })

  const tarPath = join(tmpDir, 'whisper.tar.gz')
  const srcDir = join(tmpDir, `whisper.cpp-${WHISPER_CPP_VERSION.replace('v', '')}`)
  const binDir = getBinDir()
  const destBinary = join(binDir, 'whisper-cli')

  try {
    logStep(steps, 'Downloading whisper.cpp source archive…')
    console.log('Downloading whisper.cpp source...')
    await downloadFile(WHISPER_CPP_SOURCE_URL, tarPath)

    logStep(steps, 'Extracting and compiling…')
    console.log('Extracting source...')
    execSync(`tar xzf "${tarPath}" -C "${tmpDir}"`, { timeout: 30000 })

    if (!existsSync(srcDir)) {
      console.error('Source directory not found after extraction')
      logStep(steps, 'Source layout unexpected. Trying Homebrew…')
      return tryHomebrewInstall(steps)
    }

    const cpuCount = require('os').cpus().length
    const jobs = Math.min(cpuCount, 8)

    if (hasCMake) {
      logStep(steps, 'Building whisper.cpp with CMake + Metal (may take several minutes)…')
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
          logStep(steps, 'Built whisper-cli (CMake) into your OSChief models folder.')
          console.log('whisper-cli built and installed successfully')
          return destBinary
        }
      }
    }

    if (hasMake && existsSync(join(srcDir, 'Makefile'))) {
      logStep(steps, 'Building whisper.cpp with Make + Metal (may take several minutes)…')
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
          logStep(steps, 'Built whisper-cli (Make) into your OSChief models folder.')
          console.log('whisper-cli built and installed successfully')
          return destBinary
        }
      }
    }

    console.error('Build succeeded but binary not found')
    logStep(steps, 'Build did not produce whisper-cli. Trying Homebrew…')
    return tryHomebrewInstall(steps)
  } catch (err: any) {
    console.error('Build from source failed:', err.message)
    logStep(steps, `Build from source failed (${err.message || 'error'}). Trying Homebrew…`)
    return tryHomebrewInstall(steps)
  } finally {
    try { execSync(`rm -rf "${tmpDir}"`, { timeout: 10000 }) } catch {}
  }
}

function tryHomebrewInstall(steps?: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const brewPaths = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']
    let brewPath: string | null = null
    for (const p of brewPaths) {
      if (existsSync(p)) { brewPath = p; break }
    }

    if (!brewPath) {
      console.log('Homebrew not found')
      logStep(steps, 'Homebrew not found at /opt/homebrew or /usr/local — install from https://brew.sh then retry.')
      resolve(null)
      return
    }

    logStep(steps, 'Running brew install whisper-cpp (can take several minutes; keep OSChief open)…')
    console.log('Installing whisper-cpp via Homebrew...')
    try {
      execSync(`"${brewPath}" install whisper-cpp`, {
        timeout: 300000,
        stdio: 'pipe',
      })

      const installed = findWhisperBinary()
      if (installed) {
        logStep(steps, 'whisper-cpp installed via Homebrew.')
        console.log('whisper-cpp installed via Homebrew')
        resolve(installed)
      } else {
        logStep(steps, 'brew finished but whisper-cli still not detected in PATH.')
        resolve(null)
      }
    } catch (err: any) {
      console.error('Homebrew install failed:', err.message)
      logStep(steps, `Homebrew install failed: ${err.message || 'unknown error'}`)
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

/**
 * Env for MLX-related Python/pip subprocesses. GUI Electron often has a minimal PATH, so `python3`
 * would otherwise resolve to system Python while `python3 -m pip` (with brew PATH) installed into Homebrew Python.
 */
function getMlxChildEnv(): NodeJS.ProcessEnv {
  const pathWithBrew = getEnvPathWithBrew()
  // If an OSChief venv exists, prepend its bin/ so python3/pip3 resolve to the venv
  const venvDir = process.env.SYAG_VENV_PATH
  if (venvDir && existsSync(join(venvDir, 'bin', 'python3'))) {
    return { ...process.env, PATH: `${join(venvDir, 'bin')}:${pathWithBrew}`, VIRTUAL_ENV: venvDir }
  }
  return { ...process.env, PATH: pathWithBrew }
}

/** First `python3` on PATH with brew bins (same as pip / MLX worker). */
function getPython3ExecutableHint(): string {
  const env = getMlxChildEnv()
  try {
    const out = execSync('command -v python3', { encoding: 'utf8', timeout: 5000, env }).trim()
    if (out) return out
  } catch {
    /* try which */
  }
  try {
    const w = execSync('which python3', { encoding: 'utf8', timeout: 5000, env }).trim()
    return w || 'python3'
  } catch {
    return 'python3'
  }
}

/** Parse Python version from `python3 --version` output → [major, minor] or null. */
function getPythonVersion(pythonPath: string): [number, number] | null {
  try {
    const out = execSync(`"${pythonPath}" --version`, {
      encoding: 'utf8', timeout: 5000, env: getMlxChildEnv(),
    }).trim()
    const match = out.match(/Python\s+(\d+)\.(\d+)/)
    if (match) return [parseInt(match[1], 10), parseInt(match[2], 10)]
  } catch {}
  return null
}

/**
 * Find a Python executable >= minMajor.minMinor.
 * Checks default python3 first, then versioned Homebrew executables.
 */
function findSuitablePython(minMajor: number, minMinor: number): string | null {
  const defaultPy = getPython3ExecutableHint()
  const defaultVer = getPythonVersion(defaultPy)
  if (defaultVer && (defaultVer[0] > minMajor || (defaultVer[0] === minMajor && defaultVer[1] >= minMinor))) {
    return defaultPy
  }
  console.log(`[python] Default python3 is ${defaultVer ? `${defaultVer[0]}.${defaultVer[1]}` : 'unknown'}, need >= ${minMajor}.${minMinor}. Searching Homebrew…`)
  const candidates = ['python3.13', 'python3.12', 'python3.11', 'python3.10']
  for (const dir of BREW_BIN_PATHS) {
    for (const name of candidates) {
      const fullPath = join(dir, name)
      if (existsSync(fullPath)) {
        const ver = getPythonVersion(fullPath)
        if (ver && (ver[0] > minMajor || (ver[0] === minMajor && ver[1] >= minMinor))) {
          console.log(`[python] Found suitable Python: ${fullPath} (${ver[0]}.${ver[1]})`)
          return fullPath
        }
      }
    }
  }
  return null
}

type MlxImportProbe = { ok: boolean; pythonExecutable: string; stderr: string }

/** Run `import mlx_whisper` under the same env as the worker; capture traceback on failure. */
function probeMlxWhisperImport(): Promise<MlxImportProbe> {
  const script = [
    'import sys',
    'try:',
    '    import mlx_whisper',
    '    print(sys.executable)',
    'except BaseException:',
    '    import traceback',
    '    traceback.print_exc()',
    '    sys.exit(1)',
  ].join('\n')

  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getMlxChildEnv(),
    })
    let stderr = ''
    let stdout = ''
    proc.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      const pythonExecutable = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .pop()
        ?.trim() || ''
      resolve({
        ok: code === 0,
        pythonExecutable,
        stderr: stderr.trim(),
      })
    })
    proc.on('error', (err) => {
      resolve({ ok: false, pythonExecutable: '', stderr: err.message })
    })
  })
}

/** Same for 8-bit path (mlx-audio-plus). */
function probeMlxAudioSttImport(): Promise<MlxImportProbe> {
  const script = [
    'import sys',
    'try:',
    '    from mlx_audio.stt import load',
    '    from mlx_audio.stt.utils import load_audio',
    '    print(sys.executable)',
    'except BaseException:',
    '    import traceback',
    '    traceback.print_exc()',
    '    sys.exit(1)',
  ].join('\n')

  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getMlxChildEnv(),
    })
    let stderr = ''
    let stdout = ''
    proc.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      const pythonExecutable = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .pop()
        ?.trim() || ''
      resolve({
        ok: code === 0,
        pythonExecutable,
        stderr: stderr.trim(),
      })
    })
    proc.on('error', (err) => {
      resolve({ ok: false, pythonExecutable: '', stderr: err.message })
    })
  })
}

function formatMlxWhisperImportRepairError(probe: MlxImportProbe): string {
  const bin = getPython3ExecutableHint()
  const detail = (probe.stderr || probe.pythonExecutable || 'unknown error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 520)
  return (
    `Import failed for mlx-whisper (Syag uses: ${bin}` +
    (probe.pythonExecutable ? ` → ${probe.pythonExecutable}` : '') +
    `). ${detail}. In Terminal: ${bin} -m pip install --user --force-reinstall mlx-whisper && ${bin} -c "import mlx_whisper"`
  )
}

function formatMlxAudioImportRepairError(probe: MlxImportProbe): string {
  const bin = getPython3ExecutableHint()
  const detail = (probe.stderr || 'unknown error').replace(/\s+/g, ' ').trim().slice(0, 520)
  return (
    `Import failed for mlx-audio-plus (Syag uses: ${bin}` +
    (probe.pythonExecutable ? ` → ${probe.pythonExecutable}` : '') +
    `). ${detail}. In Terminal: ${bin} -m pip install --user --force-reinstall mlx-audio-plus`
  )
}

/**
 * PEP 668-safe pip install: tries --user first (works on macOS system Python),
 * falls back to --break-system-packages if --user fails.
 * Returns { ok, stderr } so callers can show the last pip output on failure.
 */
function pipInstallSafe(packageName: string, extraArgs: string[] = []): Promise<{ ok: boolean; stderr: string }> {
  const tryPip = (args: string[]): Promise<{ ok: boolean; stderr: string }> =>
    new Promise((resolve) => {
      const proc = spawn('python3', ['-m', 'pip', 'install', ...args, packageName], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: getMlxChildEnv(),
      })
      let stderr = ''
      proc.stderr?.on('data', (d) => { stderr += d.toString() })
      proc.on('close', (code) => resolve({ ok: code === 0, stderr: stderr.trim().slice(-600) }))
      proc.on('error', (err) => resolve({ ok: false, stderr: err.message }))
    })

  return (async () => {
    // 1. Try plain install (works in venvs, Homebrew Python, etc.)
    let result = await tryPip([...extraArgs])
    if (result.ok) return result

    // 2. If PEP 668 error, try --user (installs to ~/.local)
    if (result.stderr.includes('externally-managed') || result.stderr.includes('PEP 668')) {
      console.log(`[pip] PEP 668 detected for ${packageName}, retrying with --user`)
      result = await tryPip(['--user', ...extraArgs])
      if (result.ok) return result

      // 3. Try --break-system-packages
      console.log(`[pip] --user failed for ${packageName}, trying --break-system-packages`)
      result = await tryPip(['--break-system-packages', ...extraArgs])
      if (result.ok) return result

      // 4. Last resort: create a venv and install there
      console.log(`[pip] All standard pip methods failed for ${packageName}, trying venv`)
      result = await tryVenvInstall(packageName)
    }
    return result
  })()
}

/**
 * Create a venv at ~/Library/Application Support/OSChief/python-venv/ and install there.
 * This handles PEP 668 on macOS where system Python refuses all installs.
 */
function tryVenvInstall(packageName: string, pythonBin: string = 'python3'): Promise<{ ok: boolean; stderr: string }> {
  return new Promise(async (resolve) => {
    try {
      const venvDir = join(app.getPath('userData'), 'python-venv')
      const venvPython = join(venvDir, 'bin', 'python3')
      const venvPip = join(venvDir, 'bin', 'pip3')

      // Create venv if it doesn't exist (or recreate if using a different python)
      if (!existsSync(venvPython)) {
        console.log(`[pip] Creating venv at ${venvDir} using ${pythonBin}`)
        execSync(`"${pythonBin}" -m venv "${venvDir}"`, { timeout: 30000, env: getMlxChildEnv() })
      }

      // Install in the venv
      const proc = spawn(venvPip, ['install', packageName], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...getMlxChildEnv(), VIRTUAL_ENV: venvDir, PATH: `${join(venvDir, 'bin')}:${getEnvPathWithBrew()}` },
      })
      let stderr = ''
      proc.stderr?.on('data', (d) => { stderr += d.toString() })
      proc.on('close', (code) => {
        if (code === 0) {
          // Update the PATH for future child processes to find the venv
          process.env.SYAG_VENV_PATH = venvDir
          console.log(`[pip] Successfully installed ${packageName} in venv`)
        }
        resolve({ ok: code === 0, stderr: stderr.trim().slice(-600) })
      })
      proc.on('error', (err) => resolve({ ok: false, stderr: err.message }))
    } catch (err: any) {
      resolve({ ok: false, stderr: `venv creation failed: ${err.message}` })
    }
  })
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
    client.get(url, { headers: { 'User-Agent': 'OSChief/1.0' } }, (res) => {
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

export async function processWithLocalSTT(
  wavBuffer: Buffer,
  modelId: string,
  customVocabulary?: string,
  /** 0 = mic (You), 1 = system (Others); enables per-channel Whisper continuation instead of one shared context. */
  stereoChannel?: 0 | 1
): Promise<STTResult> {
  if (modelId === 'mlx-whisper-large-v3-turbo') {
    return processWithMLXWhisper(wavBuffer, customVocabulary, stereoChannel)
  }
  if (modelId === 'mlx-whisper-large-v3-turbo-8bit') {
    return processWithMLXWhisper8Bit(wavBuffer, customVocabulary, stereoChannel)
  }
  if (modelId === 'qwen3-asr-0.6b') {
    return processWithQwen3ASR(wavBuffer, customVocabulary, stereoChannel)
  }
  if (modelId === 'parakeet-tdt-0.6b') {
    return processWithParakeet(wavBuffer)
  }
  if (modelId === 'parakeet-coreml') {
    return processWithParakeetCoreML(wavBuffer)
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
    const result = await runWhisperCLI(binaryPath, modelPath, tmpFile, customVocabulary, stereoChannel)

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
let mlxTranscribing = false
let mlxBuffer = ''
const mlxPendingResolvers: Array<{ resolve: (r: STTResult) => void; reject: (err: Error) => void }> = []
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

// Permanent stdout handler — single listener attached once after worker is ready.
// Resolves pending transcription requests in FIFO order.
function onMLXData(data: Buffer): void {
  mlxBuffer += data.toString()
  const lines = mlxBuffer.split('\n')
  mlxBuffer = lines.pop() ?? ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const pending = mlxPendingResolvers.shift()
    if (!pending) {
      console.warn('[MLX] Received data with no pending resolver:', trimmed.slice(0, 80))
      continue
    }
    mlxTranscribing = false
    resetMLXIdleTimer()
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.error) { pending.reject(new Error(parsed.error)); continue }
      const text = cleanTranscriptText(parsed.text || '')
      const words: WordTimestamp[] = (parsed.words || [])
        .map((w: any) => ({ word: (w.word || '').trim(), start: w.start || 0, end: w.end || 0 }))
        .filter((w: WordTimestamp) => w.word.length > 0)
      if (text) console.log('[MLX] Result:', text.slice(0, 80) + (text.length > 80 ? '...' : ''))
      pending.resolve({ text, words })
    } catch {
      pending.resolve({ text: cleanTranscriptText(trimmed), words: [] })
    }
  }
}

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
      env: getMlxChildEnv(),
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
            // Attach the single permanent listener for all transcription responses
            mlxBuffer = ''
            mlxWorker?.stdout?.on('data', onMLXData)
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
    if (mlxTranscribing) {
      console.log('[MLX] Idle timer fired but transcription in progress — skipping kill')
      resetMLXIdleTimer()
      return
    }
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
    mlxBuffer = ''
    for (const p of mlxPendingResolvers.splice(0)) {
      p.reject(new Error('MLX worker was killed'))
    }
  }
}

export async function checkMLXWhisperAvailable(): Promise<boolean> {
  if (mlxWhisperAvailable !== null) return mlxWhisperAvailable
  const probe = await probeMlxWhisperImport()
  mlxWhisperAvailable = probe.ok
  return probe.ok
}

export async function installMLXWhisper(): Promise<LocalSetupResult> {
  const steps: string[] = []
  const hint =
    'Needs Python 3, pip, and usually Homebrew for ffmpeg. In Terminal: brew install ffmpeg && pip3 install mlx-whisper'

  steps.push('Step 1/3 — ffmpeg (converts audio for MLX)')
  if (checkFfmpegAvailable()) {
    steps.push('ffmpeg already available.')
  } else {
    if (require('os').platform() !== 'darwin') {
      return {
        ok: false,
        steps,
        error: 'ffmpeg not found; automatic install is only set up for macOS.',
        hint: 'Install ffmpeg with your OS package manager, then: pip3 install mlx-whisper',
      }
    }
    steps.push('ffmpeg not found — trying Homebrew install (requires Homebrew at /opt/homebrew or /usr/local)…')
    const ffOk = await installFfmpeg()
    if (!ffOk) {
      return {
        ok: false,
        steps,
        error: 'Could not install ffmpeg automatically.',
        hint,
      }
    }
    steps.push('ffmpeg installed.')
  }

  steps.push('Step 2/3 — Python package mlx-whisper (pip; may take several minutes)')
  const pipResult = await pipInstallSafe('mlx-whisper')
  if (!pipResult.ok) {
    if (pipResult.stderr) steps.push(`Last pip output: ${pipResult.stderr}`)
    return {
      ok: false,
      steps,
      error: 'pip install mlx-whisper failed (check that python3 and pip work in Terminal).',
      hint,
    }
  }
  steps.push('pip install finished.')

  steps.push('Step 3/3 — Verifying import…')
  mlxWhisperAvailable = null
  const probe = await probeMlxWhisperImport()
  mlxWhisperAvailable = probe.ok
  if (!probe.ok) {
    console.warn('[MLX] pip install succeeded but import check failed:', probe.stderr?.slice(0, 400))
    return {
      ok: false,
      steps,
      error: formatMlxWhisperImportRepairError(probe),
      hint,
    }
  }
  steps.push('MLX Whisper is ready.')
  return { ok: true, steps }
}

async function processWithMLXWhisper(wavBuffer: Buffer, customVocabulary?: string, stereoChannel?: 0 | 1): Promise<STTResult> {
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

    const ch = stereoChannel ?? 0
    const promptParts: string[] = []
    const prev = previousContextByChannel[ch]
    if (prev) promptParts.push(prev)
    if (customVocabulary) {
      promptParts.push(customVocabulary.split('\n').map(t => t.trim()).filter(Boolean).join(', '))
    }
    const prompt = promptParts.join(' ').slice(-500)

    const request = JSON.stringify({ audio_path: tmpFile, prompt }) + '\n'

    const result = await new Promise<STTResult>((resolve, reject) => {
      if (!mlxWorker || !mlxWorker.stdin) {
        reject(new Error('MLX worker not available'))
        return
      }

      console.log('[MLX] Sending chunk for transcription (first run may take several minutes to load model)...')
      mlxTranscribing = true

      const pending: { resolve: (r: STTResult) => void; reject: (err: Error) => void } = {
        resolve: (r) => { clearTimeout(timeout); resolve(r) },
        reject: (e) => { clearTimeout(timeout); reject(e) },
      }
      const timeout = setTimeout(() => {
        mlxTranscribing = false
        const idx = mlxPendingResolvers.indexOf(pending)
        if (idx >= 0) mlxPendingResolvers.splice(idx, 1)
        killMLXWorker() // Kill the hung worker so it respawns on next request
        reject(new Error('MLX transcription timed out (300s). First run may take several minutes to load the model.'))
      }, 300000)

      mlxPendingResolvers.push(pending)
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
let mlx8BitBuffer = ''
const mlx8BitPendingResolvers: Array<{ resolve: (r: STTResult) => void; reject: (err: Error) => void }> = []
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
    mlx8BitBuffer = ''
    for (const p of mlx8BitPendingResolvers.splice(0)) {
      p.reject(new Error('MLX 8-bit worker was killed'))
    }
  }
}

// Permanent stdout handler for 8-bit worker — single listener attached once after worker is ready.
function onMLX8BitData(data: Buffer): void {
  mlx8BitBuffer += data.toString()
  const lines = mlx8BitBuffer.split('\n')
  mlx8BitBuffer = lines.pop() ?? ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const pending = mlx8BitPendingResolvers.shift()
    if (!pending) {
      console.warn('[MLX 8-bit] Received data with no pending resolver:', trimmed.slice(0, 80))
      continue
    }
    resetMLX8BitIdleTimer()
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.error) { pending.reject(new Error(parsed.error)); continue }
      const text = cleanTranscriptText(parsed.text || '')
      const words: WordTimestamp[] = (parsed.words || [])
        .map((w: any) => ({ word: (w.word || '').trim(), start: w.start ?? 0, end: w.end ?? 0 }))
        .filter((w: WordTimestamp) => w.word.length > 0)
      pending.resolve({ text, words })
    } catch {
      pending.resolve({ text: cleanTranscriptText(trimmed), words: [] })
    }
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
      env: getMlxChildEnv(),
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
          // Attach the single permanent listener for all transcription responses
          mlx8BitBuffer = ''
          mlx8BitWorker?.stdout?.on('data', onMLX8BitData)
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
  const probe = await probeMlxAudioSttImport()
  mlx8BitAvailable = probe.ok
  return probe.ok
}

export async function installMLXWhisper8Bit(): Promise<LocalSetupResult> {
  const steps: string[] = []
  const hint =
    'Needs Python 3, pip, ffmpeg. In Terminal: brew install ffmpeg && pip3 install mlx-audio-plus'

  steps.push('Step 1/3 — ffmpeg')
  if (checkFfmpegAvailable()) {
    steps.push('ffmpeg already available.')
  } else {
    if (require('os').platform() !== 'darwin') {
      return {
        ok: false,
        steps,
        error: 'ffmpeg not found; automatic install is only set up for macOS.',
        hint,
      }
    }
    steps.push('ffmpeg not found — trying Homebrew…')
    const ffOk = await installFfmpeg()
    if (!ffOk) {
      return { ok: false, steps, error: 'Could not install ffmpeg automatically.', hint }
    }
    steps.push('ffmpeg installed.')
  }

  steps.push('Step 2/3 — Python package mlx-audio-plus (pip; may take several minutes)')
  const pipResult8 = await pipInstallSafe('mlx-audio-plus')
  if (!pipResult8.ok) {
    if (pipResult8.stderr) steps.push(`Last pip output: ${pipResult8.stderr}`)
    return {
      ok: false,
      steps,
      error: 'pip install mlx-audio-plus failed.',
      hint,
    }
  }
  steps.push('pip install finished.')

  steps.push('Step 3/3 — Verifying import…')
  mlx8BitAvailable = null
  const probe8 = await probeMlxAudioSttImport()
  mlx8BitAvailable = probe8.ok
  if (!probe8.ok) {
    console.warn('[MLX 8-bit] pip install succeeded but import check failed:', probe8.stderr?.slice(0, 400))
    return {
      ok: false,
      steps,
      error: formatMlxAudioImportRepairError(probe8),
      hint,
    }
  }
  steps.push('MLX Whisper 8-bit is ready.')
  return { ok: true, steps }
}

async function processWithMLXWhisper8Bit(wavBuffer: Buffer, customVocabulary?: string, stereoChannel?: 0 | 1): Promise<STTResult> {
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
    const ch = stereoChannel ?? 0
    const promptParts: string[] = []
    if (previousContextByChannel[ch]) promptParts.push(previousContextByChannel[ch])
    if (customVocabulary?.trim()) promptParts.push(customVocabulary.trim())
    const mlx8Prompt = promptParts.join(' ').slice(-500)
    const request = JSON.stringify({ audio_path: tmpFile, prompt: mlx8Prompt || undefined }) + '\n'
    const result = await new Promise<STTResult>((resolve, reject) => {
      if (!mlx8BitWorker?.stdin) {
        reject(new Error('MLX 8-bit worker not available'))
        return
      }
      const pending: { resolve: (r: STTResult) => void; reject: (err: Error) => void } = {
        resolve: (r) => { clearTimeout(timeout); resolve(r) },
        reject: (e) => { clearTimeout(timeout); reject(e) },
      }
      const timeout = setTimeout(() => {
        const idx = mlx8BitPendingResolvers.indexOf(pending)
        if (idx >= 0) mlx8BitPendingResolvers.splice(idx, 1)
        killMLX8BitWorker()
        reject(new Error('MLX 8-bit transcription timed out (180s). First run may take several minutes to load the model.'))
      }, 180000)
      mlx8BitPendingResolvers.push(pending)
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

/** Force-reinstall a pip package (PEP 668-safe with --force-reinstall --no-cache-dir) */
function forceInstallPip(packageName: string): Promise<boolean> {
  return pipInstallSafe(packageName, ['--force-reinstall', '--no-cache-dir']).then(r => r.ok)
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
    const probe = await probeMlxWhisperImport()
    mlxWhisperAvailable = probe.ok
    if (!probe.ok) return { ok: false, error: formatMlxWhisperImportRepairError(probe) }
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
    if (!checkFfmpegAvailable()) {
      return { ok: false, error: 'ffmpeg required for MLX 8-bit. Run: brew install ffmpeg' }
    }
    const probe = await probeMlxAudioSttImport()
    mlx8BitAvailable = probe.ok
    if (!probe.ok) return { ok: false, error: formatMlxAudioImportRepairError(probe) }
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
      env: getMlxChildEnv(),
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

function runWhisperCLI(
  binaryPath: string,
  modelPath: string,
  audioPath: string,
  customVocabulary?: string,
  stereoChannel?: 0 | 1
): Promise<STTResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', modelPath,
      '-f', audioPath,
      '--language', 'en',
      '-t', String(sttThreadCount),
      '--beam-size', '8',
      '--entropy-thold', '2.4',
      '--logprob-thold', '-0.5',
      '--no-speech-thold', '0.3',
      '--word-thold', '0.01',
      '--max-len', '0',
      '--output-json',
      '--print-special', 'false',
    ]

    // Build prompt: same-channel previous text + custom vocabulary (avoids You/Others context fighting).
    const ch = stereoChannel ?? 0
    const promptParts: string[] = []
    if (previousContextByChannel[ch]) promptParts.push(previousContextByChannel[ch])
    if (customVocabulary?.trim()) promptParts.push(customVocabulary.trim())
    const fullPrompt = promptParts.join(' ').slice(-500)
    if (fullPrompt) {
      args.push('--prompt', fullPrompt)
    }

    // Run at lower priority so it doesn't compete with foreground apps
    const proc = spawn('nice', ['-n', '10', binaryPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Track active whisper process for cleanup on app quit
    activeWhisperProc = proc

    let stdout = ''
    let stderr = ''
    let killed = false

    // Hard timeout: kill the process if it hangs (spawn timeout option doesn't actually kill)
    const killTimer = setTimeout(() => {
      killed = true
      try { proc.kill('SIGTERM') } catch {}
      setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 5000)
    }, 120000)

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      clearTimeout(killTimer)
      activeWhisperProc = null
      if (killed) {
        reject(new Error('whisper.cpp timed out after 120s and was killed'))
      } else if (code === 0) {
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

// ─── Parakeet TDT 0.6B: ONNX inference via onnxruntime-node ─────────────────

let parakeetSession: any | null = null

async function loadParakeetSession(): Promise<any> {
  if (parakeetSession) return parakeetSession
  const modelPath = getModelPath('parakeet-tdt-0.6b')
  if (!modelPath) throw new Error('Parakeet TDT model not downloaded. Download it from Settings > AI Models.')
  const ort = require('onnxruntime-node')
  parakeetSession = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['CoreMLExecutionProvider', 'CPUExecutionProvider'],
  })
  console.log('[Parakeet] ONNX session loaded:', modelPath)
  return parakeetSession
}

/**
 * Run Parakeet TDT 0.6B inference on a WAV buffer.
 * The ONNX model expects log-mel spectrogram features as input.
 * For the initial integration, we shell out to a small Python script
 * that handles feature extraction + ONNX inference, since the ONNX model's
 * input preprocessing (mel spectrogram + CTC/TDT decoding) is non-trivial
 * to reimplement in pure JS.
 */
async function processWithParakeet(wavBuffer: Buffer): Promise<STTResult> {
  const modelPath = getModelPath('parakeet-tdt-0.6b')
  if (!modelPath) throw new Error('Parakeet TDT model not downloaded. Download it from Settings > AI Models.')

  // Use onnx-asr Python package for inference (minimal deps, no PyTorch/NeMo)
  const tmpDir = join(app.getPath('temp'), 'syag-stt')
  mkdirSync(tmpDir, { recursive: true })
  const tmpWav = join(tmpDir, `parakeet-${Date.now()}.wav`)

  try {
    writeFileSync(tmpWav, wavBuffer)

    // Try onnx-asr first (pip install onnx-asr), fallback to direct ONNX
    const script = `
import sys, json
try:
    from onnx_asr import OnnxASR
    asr = OnnxASR(model="parakeet-tdt-0.6b-v2")
    result = asr.transcribe(sys.argv[1])
    print(json.dumps({"text": result}))
except ImportError:
    # Fallback: use onnxruntime directly with basic mel extraction
    import numpy as np, soundfile as sf
    audio, sr = sf.read(sys.argv[1])
    if sr != 16000:
        from scipy.signal import resample
        audio = resample(audio, int(len(audio) * 16000 / sr))
    import onnxruntime as ort
    sess = ort.InferenceSession(sys.argv[2])
    # Basic inference — model-specific preprocessing needed
    print(json.dumps({"text": "", "error": "onnx-asr not installed. Run: pip3 install onnx-asr"}))
`

    return new Promise<STTResult>((resolve, reject) => {
      const proc = spawn('python3', ['-c', script, tmpWav, modelPath], {
        timeout: 30000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      })

      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

      proc.on('close', (code) => {
        if (code !== 0) {
          const hint = stderr.includes('No module') || stderr.includes('ModuleNotFoundError')
            ? ' Install with: pip3 install onnx-asr'
            : ''
          reject(new Error(`Parakeet STT failed (exit ${code}).${hint} ${stderr.slice(0, 200)}`))
          return
        }
        try {
          const result = JSON.parse(stdout.trim())
          if (result.error) {
            reject(new Error(result.error))
            return
          }
          resolve({ text: result.text || '', words: [] })
        } catch {
          reject(new Error(`Parakeet returned invalid output: ${stdout.slice(0, 100)}`))
        }
      })

      proc.on('error', (err) => {
        reject(new Error(`Could not start Python for Parakeet: ${err.message}. Ensure python3 is installed.`))
      })
    })
  } finally {
    try { unlinkSync(tmpWav) } catch {}
  }
}

// ── CoreML Parakeet (Apple Neural Engine — no Python needed) ────────

async function processWithParakeetCoreML(wavBuffer: Buffer): Promise<STTResult> {
  // WAV header is 44 bytes; Parakeet needs at least ~1.5s of audio to avoid FluidAudio fatalError
  const MIN_WAV_SIZE = 44 + 16000 * 2 * 0.8 // 0.8s at 16kHz 16-bit mono (padding handles 0.8–1.5s)
  if (wavBuffer.length < MIN_WAV_SIZE) {
    console.log(`[stt] Parakeet CoreML: audio too short (${wavBuffer.length} bytes), skipping`)
    return { text: '', words: [] }
  }
  const { transcribeWithParakeetCoreML } = await import('../audio/stt-parakeet-coreml')
  const text = await transcribeWithParakeetCoreML(wavBuffer)
  return {
    text,
    words: [],  // CoreML Parakeet returns full text, not word-level timestamps
  }
}

// ─── Qwen3-ASR 0.6B: persistent Python worker ───────────────────────────────

let qwen3ASRAvailable: boolean | null = null
let qwen3Worker: ReturnType<typeof spawn> | null = null
let qwen3WorkerReady = false
let qwen3IdleTimer: ReturnType<typeof setTimeout> | null = null
let qwen3Transcribing = false
let qwen3Buffer = ''
const qwen3PendingResolvers: Array<{ resolve: (r: STTResult) => void; reject: (err: Error) => void }> = []
const QWEN3_IDLE_TIMEOUT_MS = 300000 // Kill worker after 5 min idle
const QWEN3_STARTUP_READY_TIMEOUT_MS = 30000 // 30s to get "ready" after spawn
const QWEN3_HINT = ' Ensure Python 3 and mlx-qwen3-asr are installed (pip3 install mlx-qwen3-asr). First run may take several minutes to download the model.'

const QWEN3_WORKER_SCRIPT = `
import json, sys, os

from mlx_qwen3_asr import transcribe as qwen3_transcribe

sys.stdout.write('{"status":"ready"}\\n')
sys.stdout.flush()

for line in sys.stdin:
    try:
        req = json.loads(line.strip())
        audio_path = req.get("audio_path", "")
        result = qwen3_transcribe(audio_path)
        text = result.get("text", "") if isinstance(result, dict) else str(result)
        words = []
        if isinstance(result, dict):
            for seg in result.get("segments", []):
                for w in seg.get("words", []):
                    words.append({"word": w.get("word", ""), "start": w.get("start", 0), "end": w.get("end", 0)})
        sys.stdout.write(json.dumps({"text": text, "words": words}) + '\\n')
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"error": str(e)}) + '\\n')
        sys.stdout.flush()
`

// Permanent stdout handler for Qwen3-ASR worker — resolves pending requests in FIFO order.
function onQwen3Data(data: Buffer): void {
  qwen3Buffer += data.toString()
  const lines = qwen3Buffer.split('\n')
  qwen3Buffer = lines.pop() ?? ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const pending = qwen3PendingResolvers.shift()
    if (!pending) {
      console.warn('[Qwen3-ASR] Received data with no pending resolver:', trimmed.slice(0, 80))
      continue
    }
    qwen3Transcribing = false
    resetQwen3IdleTimer()
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.error) { pending.reject(new Error(parsed.error)); continue }
      const text = cleanTranscriptText(parsed.text || '')
      const words: WordTimestamp[] = (parsed.words || [])
        .map((w: any) => ({ word: (w.word || '').trim(), start: w.start || 0, end: w.end || 0 }))
        .filter((w: WordTimestamp) => w.word.length > 0)
      if (text) console.log('[Qwen3-ASR] Result:', text.slice(0, 80) + (text.length > 80 ? '...' : ''))
      pending.resolve({ text, words })
    } catch {
      pending.resolve({ text: cleanTranscriptText(trimmed), words: [] })
    }
  }
}

function ensureQwen3ASRWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (qwen3Worker && qwen3WorkerReady) {
      resetQwen3IdleTimer()
      resolve()
      return
    }

    if (qwen3Worker) {
      // Worker exists but not ready — wait for it
      const waitTimer = setTimeout(() => reject(new Error('Qwen3-ASR worker startup timeout' + QWEN3_HINT)), QWEN3_STARTUP_READY_TIMEOUT_MS)
      const check = setInterval(() => {
        if (qwen3WorkerReady) {
          clearInterval(check)
          clearTimeout(waitTimer)
          resolve()
        }
      }, 200)
      return
    }

    qwen3WorkerReady = false
    console.log('[Qwen3-ASR] Spawning Python worker (python3 -c mlx_qwen3_asr)...')
    qwen3Worker = spawn('nice', ['-n', '10', 'python3', '-u', '-c', QWEN3_WORKER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: getMlxChildEnv(),
    })

    let resolved = false
    let stderrBuf = ''

    qwen3Worker.stderr?.on('data', (d: Buffer) => {
      const s = d.toString()
      stderrBuf += s
      if (s.trim()) console.warn('[Qwen3-ASR] stderr:', s.trim())
    })

    const onFirstLine = (data: Buffer) => {
      const raw = data.toString()
      const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
      for (const line of lines) {
        try {
          const msg = JSON.parse(line)
          if (msg.status === 'ready') {
            qwen3WorkerReady = true
            resetQwen3IdleTimer()
            console.log('[Qwen3-ASR] Worker ready (model will load on first transcription).')
            // Attach the single permanent listener for all transcription responses
            qwen3Buffer = ''
            qwen3Worker?.stdout?.on('data', onQwen3Data)
            if (!resolved) {
              resolved = true
              resolve()
            }
            return
          }
        } catch {}
      }
    }

    qwen3Worker.stdout!.once('data', onFirstLine)

    const failWithStderr = (base: string) => {
      const tail = stderrBuf.trim().split('\n').slice(-8).join('\n')
      const suffix = tail ? ` Last stderr: ${tail.slice(-500)}` : ''
      return base + suffix + QWEN3_HINT
    }

    qwen3Worker.on('exit', (code) => {
      qwen3Worker = null
      qwen3WorkerReady = false
      if (!resolved) {
        resolved = true
        reject(new Error(failWithStderr('Qwen3-ASR worker exited during startup.')))
      } else {
        console.warn(`[Qwen3-ASR] Worker exited unexpectedly (code ${code}). Will respawn on next transcription request.`)
      }
    })

    qwen3Worker.on('error', (err) => {
      qwen3Worker = null
      qwen3WorkerReady = false
      if (!resolved) {
        resolved = true
        reject(err)
      } else {
        console.warn('[Qwen3-ASR] Worker error after startup:', err.message)
      }
    })

    // Startup timeout (ready line expected within 30s; no heavy warmup)
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        killQwen3ASRWorker()
        reject(new Error(failWithStderr('Qwen3-ASR worker startup timed out.')))
      }
    }, QWEN3_STARTUP_READY_TIMEOUT_MS)
  })
}

function resetQwen3IdleTimer(): void {
  if (qwen3IdleTimer) clearTimeout(qwen3IdleTimer)
  qwen3IdleTimer = setTimeout(() => {
    if (qwen3Transcribing) {
      console.log('[Qwen3-ASR] Idle timer fired but transcription in progress — skipping kill')
      resetQwen3IdleTimer()
      return
    }
    console.log('[Qwen3-ASR] Killing idle worker after 5 min')
    killQwen3ASRWorker()
  }, QWEN3_IDLE_TIMEOUT_MS)
}

export function killQwen3ASRWorker(): void {
  if (qwen3IdleTimer) { clearTimeout(qwen3IdleTimer); qwen3IdleTimer = null }
  if (qwen3Worker) {
    try { qwen3Worker.kill() } catch {}
    qwen3Worker = null
    qwen3WorkerReady = false
    qwen3Buffer = ''
    for (const p of qwen3PendingResolvers.splice(0)) {
      p.reject(new Error('Qwen3-ASR worker was killed'))
    }
  }
}

export function probeQwen3ASRImport(): Promise<MlxImportProbe> {
  const script = [
    'import sys',
    'try:',
    '    from mlx_qwen3_asr import transcribe',
    '    print(sys.executable)',
    'except BaseException:',
    '    import traceback',
    '    traceback.print_exc()',
    '    sys.exit(1)',
  ].join('\n')

  return new Promise((resolve) => {
    const proc = spawn('python3', ['-c', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getMlxChildEnv(),
    })
    let stderr = ''
    let stdout = ''
    proc.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      const pythonExecutable = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .pop()
        ?.trim() || ''
      resolve({
        ok: code === 0,
        pythonExecutable,
        stderr: stderr.trim(),
      })
    })
    proc.on('error', (err) => {
      resolve({ ok: false, pythonExecutable: '', stderr: err.message })
    })
  })
}

export async function checkQwen3ASRAvailable(): Promise<boolean> {
  if (qwen3ASRAvailable !== null) return qwen3ASRAvailable
  const probe = await probeQwen3ASRImport()
  qwen3ASRAvailable = probe.ok
  return probe.ok
}

export async function installQwen3ASR(): Promise<LocalSetupResult> {
  const steps: string[] = []
  const hint =
    'Needs Python 3, pip, and usually Homebrew for ffmpeg. In Terminal: brew install ffmpeg && pip3 install mlx-qwen3-asr'

  steps.push('Step 1/3 — ffmpeg (converts audio for Qwen3-ASR)')
  if (checkFfmpegAvailable()) {
    steps.push('ffmpeg already available.')
  } else {
    if (require('os').platform() !== 'darwin') {
      return {
        ok: false,
        steps,
        error: 'ffmpeg not found; automatic install is only set up for macOS.',
        hint: 'Install ffmpeg with your OS package manager, then: pip3 install mlx-qwen3-asr',
      }
    }
    steps.push('ffmpeg not found — trying Homebrew install (requires Homebrew at /opt/homebrew or /usr/local)…')
    const ffOk = await installFfmpeg()
    if (!ffOk) {
      return {
        ok: false,
        steps,
        error: 'Could not install ffmpeg automatically.',
        hint,
      }
    }
    steps.push('ffmpeg installed.')
  }

  steps.push('Step 2/3 — Python package mlx-qwen3-asr (pip; may take several minutes)')
  const suitablePython = findSuitablePython(3, 10)
  if (!suitablePython) {
    const defaultVer = getPythonVersion(getPython3ExecutableHint())
    return {
      ok: false,
      steps,
      error: `Python 3.10+ is required for mlx-qwen3-asr, but your python3 is ${defaultVer ? `${defaultVer[0]}.${defaultVer[1]}` : 'not found'}. Install Python 3.10+ and retry.`,
      hint: 'Install a newer Python with Homebrew: brew install python@3.12, then retry.',
    }
  }

  let pipResult: { ok: boolean; stderr: string }
  const defaultPy = getPython3ExecutableHint()
  if (suitablePython !== defaultPy) {
    steps.push(`Default python3 is below 3.10; using ${suitablePython} via venv.`)
    pipResult = await tryVenvInstall('mlx-qwen3-asr', suitablePython)
  } else {
    pipResult = await pipInstallSafe('mlx-qwen3-asr')
  }
  if (!pipResult.ok) {
    if (pipResult.stderr) steps.push(`Last pip output: ${pipResult.stderr}`)
    return {
      ok: false,
      steps,
      error: 'pip install mlx-qwen3-asr failed (check that python3 and pip work in Terminal).',
      hint,
    }
  }
  steps.push('pip install finished.')

  steps.push('Step 3/3 — Verifying import…')
  qwen3ASRAvailable = null
  const probe = await probeQwen3ASRImport()
  qwen3ASRAvailable = probe.ok
  if (!probe.ok) {
    console.warn('[Qwen3-ASR] pip install succeeded but import check failed:', probe.stderr?.slice(0, 400))
    const bin = getPython3ExecutableHint()
    const detail = (probe.stderr || probe.pythonExecutable || 'unknown error')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 520)
    return {
      ok: false,
      steps,
      error:
        `Import failed for mlx-qwen3-asr (Syag uses: ${bin}` +
        (probe.pythonExecutable ? ` → ${probe.pythonExecutable}` : '') +
        `). ${detail}. In Terminal: ${bin} -m pip install --user --force-reinstall mlx-qwen3-asr && ${bin} -c "from mlx_qwen3_asr import transcribe"`,
      hint,
    }
  }
  steps.push('Qwen3-ASR is ready.')
  return { ok: true, steps }
}

export async function uninstallQwen3ASR(): Promise<{ ok: boolean; error?: string }> {
  killQwen3ASRWorker()
  qwen3ASRAvailable = null
  const errors: string[] = []
  // 1. pip uninstall mlx-qwen3-asr
  const pipOk = await pipUninstall('mlx-qwen3-asr')
  if (!pipOk) errors.push('pip uninstall mlx-qwen3-asr may have partially failed')
  // 2. Remove HuggingFace model cache
  try {
    const hfCacheDir = join(require('os').homedir(), '.cache', 'huggingface', 'hub', 'models--Qwen--Qwen3-ASR-0.6B')
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

async function processWithQwen3ASR(wavBuffer: Buffer, customVocabulary?: string, stereoChannel?: 0 | 1): Promise<STTResult> {
  const available = await checkQwen3ASRAvailable()
  if (!available) {
    throw new Error('mlx-qwen3-asr is not installed. Install it from Settings > AI Models or run: pip3 install mlx-qwen3-asr')
  }

  await ensureQwen3ASRWorker()

  const tmpDir = join(app.getPath('temp'), 'syag-stt')
  mkdirSync(tmpDir, { recursive: true })
  const tmpFile = join(tmpDir, `qwen3-chunk-${Date.now()}.wav`)

  try {
    writeFileSync(tmpFile, wavBuffer)

    const request = JSON.stringify({ audio_path: tmpFile }) + '\n'

    const result = await new Promise<STTResult>((resolve, reject) => {
      if (!qwen3Worker || !qwen3Worker.stdin) {
        reject(new Error('Qwen3-ASR worker not available'))
        return
      }

      console.log('[Qwen3-ASR] Sending chunk for transcription (first run may take several minutes to load model)...')
      qwen3Transcribing = true

      const pending: { resolve: (r: STTResult) => void; reject: (err: Error) => void } = {
        resolve: (r) => { clearTimeout(timeout); resolve(r) },
        reject: (e) => { clearTimeout(timeout); reject(e) },
      }
      const timeout = setTimeout(() => {
        qwen3Transcribing = false
        const idx = qwen3PendingResolvers.indexOf(pending)
        if (idx >= 0) qwen3PendingResolvers.splice(idx, 1)
        killQwen3ASRWorker() // Kill the hung worker so it respawns on next request
        reject(new Error('Qwen3-ASR transcription timed out (300s). First run may take several minutes to load the model.'))
      }, 300000)

      qwen3PendingResolvers.push(pending)
      qwen3Worker.stdin.write(request)
    })

    return result
  } catch (err) {
    // Clear availability cache so next attempt rechecks dependencies
    qwen3ASRAvailable = null
    throw err
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}
