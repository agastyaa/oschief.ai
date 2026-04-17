import { ipcMain, desktopCapturer } from 'electron'
import { updateTrayRecordingState, updateTrayMeetingInfo } from '../tray'
import { setCalendarEvents } from '../meeting-detector'
import {
  startRecording, stopRecording, pauseRecording, resumeRecording,
  processAudioChunk, setMicOnlyMode,
} from '../audio/capture'

/**
 * STT + audio + recording + tray recording-state + meeting-detector calendar.
 * recording (10) + audio (3) + meeting (1) + tray (2) = 16 channels.
 */
export function registerSTTHandlers(): void {
  // Tray recording state (kept with recording since it toggles with record lifecycle)
  ipcMain.handle('tray:update-recording', (_e, isRecording: boolean) => {
    updateTrayRecordingState(isRecording)
  })
  ipcMain.handle('tray:update-meeting-info', (_e, info: { title: string; startTime: number } | null) => {
    updateTrayMeetingInfo(info)
  })
  ipcMain.handle('meeting:set-calendar-events', (_e, events: Array<{ id: string; title: string; start: number; end: number; joinLink?: string }>) => {
    setCalendarEvents(events)
    return true
  })

  // Recording
  ipcMain.handle('recording:start', async (_e, options: any) => {
    const sender = _e.sender
    updateTrayRecordingState(true)
    const { setSTTRecordingActive, resetSTTFallback } = await import('../models/stt-engine')
    setSTTRecordingActive(true)
    resetSTTFallback()
    return startRecording(
      options,
      (chunk) => { sender.send('recording:transcript-chunk', chunk) },
      (status) => { sender.send('recording:status', status) },
      (corrected) => { sender.send('recording:transcript-corrected', corrected) },
    )
  })
  ipcMain.handle('recording:stop', async () => {
    updateTrayRecordingState(false)
    const { setSTTRecordingActive } = await import('../models/stt-engine')
    setSTTRecordingActive(false)
    return stopRecording()
  })
  ipcMain.handle('recording:set-mic-only-mode', (_e, micOnly: boolean) => { setMicOnlyMode(micOnly); return true })
  ipcMain.handle('recording:stt-health', async () => {
    const { getSTTHealthStatus } = await import('../models/stt-engine')
    return getSTTHealthStatus()
  })
  ipcMain.handle('recording:pause', () => { pauseRecording(); updateTrayRecordingState(false); return true })
  ipcMain.handle('recording:resume', (_e, options?: { sttModel?: string }) => {
    resumeRecording(options); updateTrayRecordingState(true); return true
  })
  ipcMain.handle('recording:audio-chunk', async (_e, pcmData: any, channel?: number) => {
    let data: Float32Array
    if (pcmData instanceof Float32Array) {
      data = pcmData
    } else if (pcmData?.buffer instanceof ArrayBuffer) {
      data = new Float32Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 4)
    } else if (ArrayBuffer.isView(pcmData)) {
      data = new Float32Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 4)
    } else {
      data = new Float32Array(pcmData)
    }
    return processAudioChunk(data, channel ?? 0)
  })

  // Transcript draft recovery
  ipcMain.handle('recording:get-orphaned-drafts', async () => {
    const { getOrphanedDrafts } = await import('../audio/transcript-autosave')
    return getOrphanedDrafts()
  })
  ipcMain.handle('recording:delete-draft', async (_e, noteId: string) => {
    const { deleteDraft } = await import('../audio/transcript-autosave')
    deleteDraft(noteId)
    return true
  })
  ipcMain.handle('recording:clear-all-drafts', async () => {
    const { clearAllDrafts } = await import('../audio/transcript-autosave')
    clearAllDrafts()
    return true
  })

  // Audio
  ipcMain.handle('audio:get-devices', async () => {
    return [] // Devices enumerated in renderer via navigator.mediaDevices
  })
  ipcMain.handle('audio:ensure-diarization-models', async () => {
    try {
      const { StreamingDiarizer } = await import('../audio/streaming-diarizer')
      const diarizer = new StreamingDiarizer()
      await diarizer.ensureModel()
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
  ipcMain.handle('audio:get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    })
    return sources.map((s) => ({ id: s.id, name: s.name }))
  })
}
