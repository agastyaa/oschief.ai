import { powerMonitor, BrowserWindow } from 'electron'
import { setPollInterval } from './meeting-detector'
import { setChunkInterval } from './audio/capture'
import { getIsRecording } from './audio/capture'
import { setSTTThreadCount } from './models/stt-engine'
import { setSchedulerHidden } from './scheduler'
import { startThermalMonitor, stopThermalMonitor, getThermalState, type ThermalState } from './thermal-monitor'

let mainWindow: BrowserWindow | null = null
let isOnBattery = false
let isHidden = false
let thermalState: ThermalState = 'nominal'

const cpuCount = require('os').cpus().length

// --- Power profiles ---
// STT thread counts reduced vs original (was 4 max) to prevent sustained thermal load.
// 3 threads on AC is the sweet spot: fast enough for good WER, cool enough for 60-min meetings.

const AC_CONFIG = {
  meetingPollMs: 15000,
  chunkIntervalMs: 6000,    // 6s — normal chunk interval
  sttThreads: Math.min(3, Math.max(2, Math.floor(cpuCount / 3))),  // 2-3 threads (was 4)
}

const BATTERY_CONFIG = {
  meetingPollMs: 30000,
  chunkIntervalMs: 10000,   // 10s on battery (was 6s — saves significant thermal)
  sttThreads: Math.max(1, Math.min(2, Math.floor(cpuCount / 4))),
}

// Thermal-adaptive configs — applied on top of AC/battery when recording
// These only affect chunk interval and STT threads, not meeting detection

const THERMAL_WARM_CONFIG = {
  chunkIntervalMs: 12000,   // 12s — 50% fewer STT calls, bigger chunks = better context actually
  sttThreads: Math.min(2, Math.max(1, Math.floor(cpuCount / 4))),  // Drop to 1-2 threads
}

const THERMAL_HOT_CONFIG = {
  chunkIntervalMs: 18000,   // 18s — aggressive throttle, transcript still flows but in bigger batches
  sttThreads: 1,            // Single thread — minimum viable transcription
}

const HIDDEN_CONFIG = {
  meetingPollMs: 120000,
}

const RECORDING_HIDDEN_CONFIG = {
  meetingPollMs: 120000,
}

type PowerMode = 'ac' | 'battery' | 'hidden' | 'recording-hidden'

function resolveMode(): PowerMode {
  if (isHidden && getIsRecording()) return 'recording-hidden'
  if (isHidden) return 'hidden'
  return isOnBattery ? 'battery' : 'ac'
}

function applyConfig(mode: PowerMode): void {
  const isRecording = getIsRecording()

  console.log(`[PowerManager] Switching to ${mode} mode (thermal=${thermalState}, recording=${isRecording})`)

  switch (mode) {
    case 'ac': {
      setPollInterval(AC_CONFIG.meetingPollMs)
      // If recording, apply thermal-adjusted config
      if (isRecording && thermalState === 'hot') {
        setChunkInterval(THERMAL_HOT_CONFIG.chunkIntervalMs)
        setSTTThreadCount(THERMAL_HOT_CONFIG.sttThreads)
      } else if (isRecording && thermalState === 'warm') {
        setChunkInterval(THERMAL_WARM_CONFIG.chunkIntervalMs)
        setSTTThreadCount(THERMAL_WARM_CONFIG.sttThreads)
      } else {
        setChunkInterval(AC_CONFIG.chunkIntervalMs)
        setSTTThreadCount(AC_CONFIG.sttThreads)
      }
      break
    }
    case 'battery': {
      setPollInterval(BATTERY_CONFIG.meetingPollMs)
      // Battery + thermal: use the more aggressive of battery/thermal config
      if (isRecording && thermalState === 'hot') {
        setChunkInterval(THERMAL_HOT_CONFIG.chunkIntervalMs)
        setSTTThreadCount(THERMAL_HOT_CONFIG.sttThreads)
      } else if (isRecording && thermalState === 'warm') {
        setChunkInterval(Math.max(BATTERY_CONFIG.chunkIntervalMs, THERMAL_WARM_CONFIG.chunkIntervalMs))
        setSTTThreadCount(Math.min(BATTERY_CONFIG.sttThreads, THERMAL_WARM_CONFIG.sttThreads))
      } else {
        setChunkInterval(BATTERY_CONFIG.chunkIntervalMs)
        setSTTThreadCount(BATTERY_CONFIG.sttThreads)
      }
      break
    }
    case 'hidden':
      setPollInterval(HIDDEN_CONFIG.meetingPollMs)
      break
    case 'recording-hidden': {
      setPollInterval(RECORDING_HIDDEN_CONFIG.meetingPollMs)
      // Still apply thermal adjustment even when hidden — fan noise matters regardless
      if (thermalState === 'hot') {
        setChunkInterval(THERMAL_HOT_CONFIG.chunkIntervalMs)
        setSTTThreadCount(THERMAL_HOT_CONFIG.sttThreads)
      } else if (thermalState === 'warm') {
        setChunkInterval(THERMAL_WARM_CONFIG.chunkIntervalMs)
        setSTTThreadCount(THERMAL_WARM_CONFIG.sttThreads)
      }
      break
    }
  }

  setSchedulerHidden(isHidden)

  mainWindow?.webContents.send('power:mode-changed', {
    onBattery: isOnBattery,
    hidden: isHidden,
    mode,
    thermalState,
  })
}

function recalculate(): void {
  applyConfig(resolveMode())
}

export function setupPowerMonitor(win: BrowserWindow): void {
  mainWindow = win

  isOnBattery = powerMonitor.isOnBatteryPower()
  if (isOnBattery) {
    applyConfig('battery')
  }

  powerMonitor.on('on-ac', () => {
    isOnBattery = false
    recalculate()
  })

  powerMonitor.on('on-battery', () => {
    isOnBattery = true
    recalculate()
  })

  win.on('hide', () => {
    isHidden = true
    recalculate()
  })

  win.on('show', () => {
    isHidden = false
    recalculate()
  })

  win.on('minimize', () => {
    isHidden = true
    recalculate()
  })

  win.on('restore', () => {
    isHidden = false
    recalculate()
  })
}

/** Call when recording starts/stops so power manager can adjust throttling profile. */
export function notifyRecordingStateChanged(): void {
  const isRecording = getIsRecording()

  if (isRecording) {
    // Start thermal monitoring when recording begins
    startThermalMonitor((newState) => {
      thermalState = newState
      console.log(`[PowerManager] Thermal state changed to ${newState} — adjusting recording pipeline`)
      recalculate()
    })
  } else {
    // Stop thermal monitoring when recording ends
    stopThermalMonitor()
    thermalState = 'nominal'
  }

  recalculate()
}

export function getIsOnBattery(): boolean {
  return isOnBattery
}

export function getIsHidden(): boolean {
  return isHidden
}

export function getCurrentPowerMode(): PowerMode {
  return resolveMode()
}

export function getCurrentThermalState(): ThermalState {
  return thermalState
}
