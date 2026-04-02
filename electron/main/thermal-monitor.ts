/**
 * Thermal monitor for macOS — reads CPU temperature and provides
 * adaptive throttling signals to keep fans off during long meetings.
 *
 * On M-series Macs, fans typically spin up around 75-80°C sustained.
 * We target staying below 70°C to maintain silence.
 *
 * Uses macOS `sudo powermetrics` when available, falls back to
 * `sysctl` or a heuristic based on recording duration.
 */

import { execFile } from 'child_process'

export type ThermalState = 'nominal' | 'warm' | 'hot'

let currentTemp = 0 // °C, 0 = unknown
let currentState: ThermalState = 'nominal'
let pollTimer: ReturnType<typeof setInterval> | null = null
let recordingStartTime = 0
let onStateChange: ((state: ThermalState) => void) | null = null

// Thresholds (°C) — tuned for M-series Macs
const WARM_THRESHOLD = 65  // Start throttling
const HOT_THRESHOLD = 75   // Aggressive throttling
const COOL_THRESHOLD = 55  // Return to nominal

// If we can't read temp, use duration-based heuristic
const WARM_AFTER_MINUTES = 10
const HOT_AFTER_MINUTES = 25

/**
 * Try to read CPU die temperature via macOS thermal sensors.
 * Returns temp in °C or 0 if unavailable.
 */
function readCpuTemp(): Promise<number> {
  return new Promise((resolve) => {
    // Try pmset first (available without sudo, fast)
    execFile('/usr/bin/pmset', ['-g', 'therm'], { timeout: 3000 }, (err, stdout) => {
      if (!err && stdout) {
        // pmset -g therm shows "CPU_Speed_Limit = 100" when nominal
        // When throttled, it drops below 100
        const match = stdout.match(/CPU_Speed_Limit\s*=\s*(\d+)/)
        if (match) {
          const speedLimit = parseInt(match[1], 10)
          // Map speed limit to approximate temp: 100=cool, 80=warm, 60=hot
          if (speedLimit <= 60) { resolve(80); return }
          if (speedLimit <= 80) { resolve(70); return }
          if (speedLimit < 100) { resolve(65); return }
          resolve(50) // Nominal
          return
        }
      }

      // Fallback: try reading thermal pressure via sysctl
      execFile('/usr/sbin/sysctl', ['-n', 'machdep.xcpm.cpu_thermal_level'], { timeout: 2000 }, (err2, stdout2) => {
        if (!err2 && stdout2) {
          const level = parseInt(stdout2.trim(), 10)
          // thermal_level: 0=nominal, higher=hotter
          if (level >= 80) { resolve(80); return }
          if (level >= 50) { resolve(70); return }
          if (level > 0) { resolve(60); return }
          resolve(45)
          return
        }

        // Can't read temp — return 0 (will fall back to duration heuristic)
        resolve(0)
      })
    })
  })
}

function computeState(temp: number): ThermalState {
  if (temp === 0 && recordingStartTime > 0) {
    // Duration-based heuristic when temp isn't available
    const minutesRecording = (Date.now() - recordingStartTime) / 60_000
    if (minutesRecording >= HOT_AFTER_MINUTES) return 'hot'
    if (minutesRecording >= WARM_AFTER_MINUTES) return 'warm'
    return 'nominal'
  }

  if (temp >= HOT_THRESHOLD) return 'hot'
  if (temp >= WARM_THRESHOLD) return 'warm'

  // Hysteresis: don't drop from warm→nominal until well below threshold
  if (currentState !== 'nominal' && temp > COOL_THRESHOLD) return currentState
  return 'nominal'
}

function poll(): void {
  readCpuTemp().then((temp) => {
    currentTemp = temp
    const newState = computeState(temp)
    if (newState !== currentState) {
      const prevState = currentState
      currentState = newState
      console.log(`[ThermalMonitor] ${prevState} → ${newState} (temp=${temp}°C, recording=${Math.round((Date.now() - recordingStartTime) / 60_000)}min)`)
      onStateChange?.(newState)
    }
  }).catch(() => {
    // Silently fall back to duration heuristic
    currentTemp = 0
    const newState = computeState(0)
    if (newState !== currentState) {
      const prevState = currentState
      currentState = newState
      console.log(`[ThermalMonitor] ${prevState} → ${newState} (duration heuristic, recording=${Math.round((Date.now() - recordingStartTime) / 60_000)}min)`)
      onStateChange?.(newState)
    }
  })
}

/**
 * Start monitoring thermal state. Call when recording starts.
 * @param onChange Callback when thermal state changes
 */
export function startThermalMonitor(onChange: (state: ThermalState) => void): void {
  onStateChange = onChange
  recordingStartTime = Date.now()
  currentState = 'nominal'
  currentTemp = 0

  // Poll every 30s — light touch, just checking thermal pressure
  poll()
  pollTimer = setInterval(poll, 30_000)
  console.log('[ThermalMonitor] Started (poll every 30s)')
}

/** Stop monitoring. Call when recording stops. */
export function stopThermalMonitor(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  currentState = 'nominal'
  currentTemp = 0
  recordingStartTime = 0
  onStateChange = null
  console.log('[ThermalMonitor] Stopped')
}

export function getThermalState(): ThermalState {
  return currentState
}

export function getCpuTemp(): number {
  return currentTemp
}
