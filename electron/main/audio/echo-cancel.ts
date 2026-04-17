/**
 * Acoustic Echo Cancellation via speexdsp
 *
 * Uses a persistent Python worker running speexdsp's SpeexEchoCanceller
 * to subtract speaker echo from mic audio before STT.
 *
 * FLOW:
 *   mic audio (ch0) + system audio (ch1)
 *       │
 *       ▼
 *   Python worker (speexdsp EchoCanceller)
 *       │
 *       ▼
 *   clean mic audio (echo subtracted)
 *       │
 *       ▼
 *   STT engine
 *
 * The worker runs for the lifetime of a recording session.
 * Falls back gracefully: if speexdsp isn't installed or the worker
 * crashes, mic audio passes through unprocessed.
 */

import { spawn, type ChildProcess } from 'child_process'
import { emitEvent } from '../observability'

let aecWorker: ChildProcess | null = null
let aecReady = false
let aecAvailable: boolean | null = null
const aecPendingResolvers: Array<{
  resolve: (cleaned: Float32Array) => void
  reject: (err: Error) => void
}> = []
let aecBuffer = ''

// R2 — lightweight restart-storm protection for the AEC worker.
// Full WorkerSupervisor adoption is a v2.11.1 follow-up (WorkerHandle
// interface needs to expose stdin/stdout to replace the JSON-over-pipe
// protocol). For now: fixed-minute bucket + silent restart matches the
// plan's "auto-restart silently; mic quality degrades but capture continues"
// requirement.
const aecRestartTimestamps: number[] = []
const AEC_RESTART_THRESHOLD = 3
let aecStopRequested = false

const AEC_WORKER_SCRIPT = `
import sys, json, struct, base64, array

try:
    from speexdsp import EchoCanceller
except ImportError:
    sys.stdout.write(json.dumps({"status": "unavailable", "error": "speexdsp not installed. pip3 install speexdsp"}) + "\\n")
    sys.stdout.flush()
    sys.exit(0)

FRAME_SIZE = 256  # 16ms at 16kHz — speexdsp processes fixed frames
SAMPLE_RATE = 16000
FILTER_LENGTH = SAMPLE_RATE  # 1 second tail — covers room echo up to ~3m

ec = EchoCanceller(FRAME_SIZE, FILTER_LENGTH)

sys.stdout.write(json.dumps({"status": "ready"}) + "\\n")
sys.stdout.flush()

for line in sys.stdin:
    try:
        req = json.loads(line.strip())
        mic_b64 = req.get("mic", "")
        ref_b64 = req.get("ref", "")

        mic_bytes = base64.b64decode(mic_b64)
        ref_bytes = base64.b64decode(ref_b64)

        # Convert to 16-bit PCM arrays
        mic_samples = array.array('h')
        mic_samples.frombytes(mic_bytes)
        ref_samples = array.array('h')
        ref_samples.frombytes(ref_bytes)

        # Pad shorter to match longer
        max_len = max(len(mic_samples), len(ref_samples))
        while len(mic_samples) < max_len:
            mic_samples.append(0)
        while len(ref_samples) < max_len:
            ref_samples.append(0)

        # Process in FRAME_SIZE chunks
        out_samples = array.array('h')
        for i in range(0, max_len - FRAME_SIZE + 1, FRAME_SIZE):
            mic_frame = mic_samples[i:i+FRAME_SIZE].tobytes()
            ref_frame = ref_samples[i:i+FRAME_SIZE].tobytes()
            cleaned = ec.process(mic_frame, ref_frame)
            out_arr = array.array('h')
            out_arr.frombytes(cleaned)
            out_samples.extend(out_arr)

        # Handle remaining samples (pass through unprocessed)
        remainder = max_len % FRAME_SIZE
        if remainder > 0:
            out_samples.extend(mic_samples[max_len - remainder:])

        out_b64 = base64.b64encode(out_samples.tobytes()).decode('ascii')
        sys.stdout.write(json.dumps({"ok": True, "audio": out_b64, "samples": len(out_samples)}) + "\\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)}) + "\\n")
        sys.stdout.flush()
`

function onAECData(data: Buffer): void {
  aecBuffer += data.toString()
  const lines = aecBuffer.split('\n')
  aecBuffer = lines.pop() ?? ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const pending = aecPendingResolvers.shift()
    if (!pending) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (!parsed.ok) {
        // Error from worker — return original audio (passthrough)
        pending.resolve(new Float32Array(0))
        continue
      }
      // Decode base64 PCM16 back to Float32Array
      const buf = Buffer.from(parsed.audio, 'base64')
      const int16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0
      }
      pending.resolve(float32)
    } catch {
      pending.resolve(new Float32Array(0))
    }
  }
}

export async function startAECWorker(): Promise<boolean> {
  if (aecAvailable === false) return false
  if (aecWorker && aecReady) return true

  return new Promise((resolve) => {
    aecWorker = spawn('python3', ['-u', '-c', AEC_WORKER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let resolved = false

    aecWorker.stdout!.once('data', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString().trim().split('\n')[0])
        if (msg.status === 'ready') {
          aecReady = true
          aecAvailable = true
          aecBuffer = ''
          aecWorker!.stdout!.on('data', onAECData)
          console.log('[AEC] Echo canceller ready (speexdsp)')
          if (!resolved) { resolved = true; resolve(true) }
        } else if (msg.status === 'unavailable') {
          aecAvailable = false
          console.log('[AEC] speexdsp not available:', msg.error)
          aecWorker?.kill()
          aecWorker = null
          if (!resolved) { resolved = true; resolve(false) }
        }
      } catch {
        if (!resolved) { resolved = true; resolve(false) }
      }
    })

    aecWorker.stderr?.on('data', (d: Buffer) => {
      const s = d.toString().trim()
      if (s) console.warn('[AEC] stderr:', s)
    })

    aecWorker.on('exit', (code, signal) => {
      const wasReady = aecReady
      aecWorker = null
      aecReady = false
      for (const p of aecPendingResolvers.splice(0)) {
        p.resolve(new Float32Array(0))
      }
      // R2 — react to unexpected exits with observability + silent auto-restart.
      // Only fires when we were healthy before (wasReady) and stop() wasn't
      // called. AEC has the silent-restart policy: users never see this.
      if (wasReady && !aecStopRequested && aecAvailable !== false) {
        emitEvent({
          type: 'worker.crashed',
          worker_kind: 'aec',
          exit_code: code,
          signal: signal ?? null,
        })
        aecRestartTimestamps.push(Date.now())
        const recent = aecRestartTimestamps.filter((t) => t > Date.now() - 60_000)
        aecRestartTimestamps.length = 0
        aecRestartTimestamps.push(...recent)
        if (recent.length > AEC_RESTART_THRESHOLD) {
          emitEvent({
            type: 'worker.restart_storm',
            worker_kind: 'aec',
            cooldown_applied: true,
          })
          // 30s cooldown then one retry.
          setTimeout(() => {
            aecRestartTimestamps.length = 0
            if (!aecStopRequested) {
              startAECWorker()
                .then((ok) =>
                  emitEvent({
                    type: 'worker.restarted',
                    worker_kind: 'aec',
                    success: ok,
                    restart_count_last_minute: 0,
                  }),
                )
                .catch(() => {})
            }
          }, 30_000)
        } else {
          startAECWorker()
            .then((ok) =>
              emitEvent({
                type: 'worker.restarted',
                worker_kind: 'aec',
                success: ok,
                restart_count_last_minute: recent.length,
              }),
            )
            .catch(() => {})
        }
      }
    })

    aecWorker.on('error', () => {
      aecAvailable = false
      aecWorker = null
      if (!resolved) { resolved = true; resolve(false) }
    })

    // 5s startup timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        aecWorker?.kill()
        aecWorker = null
        aecAvailable = false
        resolve(false)
      }
    }, 5000)
  })
}

export function stopAECWorker(): void {
  aecStopRequested = true
  if (aecWorker) {
    try { aecWorker.kill() } catch {}
    aecWorker = null
    aecReady = false
    aecBuffer = ''
    for (const p of aecPendingResolvers.splice(0)) {
      p.resolve(new Float32Array(0))
    }
  }
  // Reset so future startAECWorker() call (new recording) can restart.
  setTimeout(() => { aecStopRequested = false }, 100)
  aecRestartTimestamps.length = 0
}

/**
 * Cancel echo from mic audio using system audio as reference.
 * Returns cleaned Float32Array, or empty array if AEC unavailable (passthrough).
 */
export async function cancelEcho(
  micAudio: Float32Array,
  systemAudio: Float32Array
): Promise<Float32Array> {
  if (!aecWorker || !aecReady) return new Float32Array(0)

  // Convert Float32 to Int16 PCM for speexdsp
  const micInt16 = new Int16Array(micAudio.length)
  for (let i = 0; i < micAudio.length; i++) {
    micInt16[i] = Math.max(-32768, Math.min(32767, Math.round(micAudio[i] * 32768)))
  }
  const refInt16 = new Int16Array(systemAudio.length)
  for (let i = 0; i < systemAudio.length; i++) {
    refInt16[i] = Math.max(-32768, Math.min(32767, Math.round(systemAudio[i] * 32768)))
  }

  const micB64 = Buffer.from(micInt16.buffer).toString('base64')
  const refB64 = Buffer.from(refInt16.buffer).toString('base64')

  return new Promise((resolve) => {
    // 3s timeout — if AEC is too slow, pass through
    const timer = setTimeout(() => {
      const idx = aecPendingResolvers.findIndex(p => p.resolve === resolve)
      if (idx >= 0) aecPendingResolvers.splice(idx, 1)
      resolve(new Float32Array(0))
    }, 3000)

    aecPendingResolvers.push({
      resolve: (cleaned) => {
        clearTimeout(timer)
        resolve(cleaned)
      },
      reject: () => {
        clearTimeout(timer)
        resolve(new Float32Array(0))
      },
    })

    try {
      aecWorker!.stdin!.write(JSON.stringify({ mic: micB64, ref: refB64 }) + '\n')
    } catch {
      clearTimeout(timer)
      resolve(new Float32Array(0))
    }
  })
}

export function isAECAvailable(): boolean {
  return aecAvailable === true && aecReady
}
