import { ipcMain, systemPreferences, desktopCapturer, app, safeStorage, BrowserWindow } from 'electron'
import { updateTrayRecordingState, updateTrayMeetingInfo } from './tray'
import { setCalendarEvents } from './meeting-detector'
import {
  getAllNotes, getNote, addNote, updateNote, deleteNote, updateNoteFolder,
  getAllFolders, addFolder, updateFolder, deleteFolder,
  getSetting, setSetting, getAllSettings,
} from './storage/database'
import { downloadModel, cancelDownload, deleteModel, listDownloadedModels } from './models/manager'
import { startRecording, stopRecording, pauseRecording, resumeRecording, processAudioChunk } from './audio/capture'
import { summarize } from './models/llm-engine'
import { chat, testCopartConnection, listCopartGenieModels } from './cloud/router'
import { checkAppleFoundationAvailable } from './cloud/apple-llm'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

const keychainPath = () => {
  const dir = join(app.getPath('userData'), 'secure')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'keychain.enc')
}

function loadKeychain(): Record<string, string> {
  const path = keychainPath()
  if (!existsSync(path)) return {}
  try {
    const encrypted = readFileSync(path)
    const decrypted = safeStorage.decryptString(encrypted)
    return JSON.parse(decrypted)
  } catch {
    return {}
  }
}

function saveKeychain(data: Record<string, string>): void {
  const encrypted = safeStorage.encryptString(JSON.stringify(data))
  writeFileSync(keychainPath(), encrypted)
}

export function registerIPCHandlers(): void {
  // --- Notes ---
  ipcMain.handle('db:notes-get-all', () => getAllNotes())
  ipcMain.handle('db:notes-get', (_e, id: string) => getNote(id))
  ipcMain.handle('db:notes-add', (_e, note: any) => { addNote(note); return true })
  ipcMain.handle('db:notes-update', (_e, id: string, data: any) => { updateNote(id, data); return true })
  ipcMain.handle('db:notes-delete', (_e, id: string) => { deleteNote(id); return true })
  ipcMain.handle('db:notes-update-folder', (_e, noteId: string, folderId: string | null) => {
    updateNoteFolder(noteId, folderId); return true
  })

  // --- Folders ---
  ipcMain.handle('db:folders-get-all', () => getAllFolders())
  ipcMain.handle('db:folders-add', (_e, folder: any) => { addFolder(folder); return true })
  ipcMain.handle('db:folders-update', (_e, id: string, data: any) => { updateFolder(id, data); return true })
  ipcMain.handle('db:folders-delete', (_e, id: string) => { deleteFolder(id); return true })

  // --- Settings ---
  ipcMain.handle('db:settings-get', (_e, key: string) => getSetting(key))
  ipcMain.handle('db:settings-set', (_e, key: string, value: string) => { setSetting(key, value); return true })
  ipcMain.handle('db:settings-get-all', () => getAllSettings())

  // --- Models ---
  const WHISPER_CPP_MODEL_IDS = ['whisper-large-v3-turbo', 'whisper-large-v3', 'whisper-medium', 'whisper-small', 'whisper-tiny']
  ipcMain.handle('models:download', async (_e, modelId: string) => {
    const sender = _e.sender
    try {
      await downloadModel(modelId, (progress) => {
        sender.send('models:download-progress', progress)
      })
      sender.send('models:download-complete', { modelId, success: true })
      // Auto-setup: after downloading a whisper.cpp model, ensure CLI binary is ready in background
      if (WHISPER_CPP_MODEL_IDS.includes(modelId)) {
        import('./models/stt-engine').then(({ ensureWhisperBinaryInBackground }) => {
          ensureWhisperBinaryInBackground()
        }).catch(() => {})
      }
      return true
    } catch (err: any) {
      sender.send('models:download-complete', { modelId, success: false, error: err.message })
      return false
    }
  })
  ipcMain.handle('models:cancel-download', (_e, modelId: string) => { cancelDownload(modelId); return true })
  ipcMain.handle('models:delete', (_e, modelId: string) => { deleteModel(modelId); return true })
  ipcMain.handle('models:list', () => listDownloadedModels())
  ipcMain.handle('models:check-mlx-whisper', async () => {
    const { checkMLXWhisperAvailable } = await import('./models/stt-engine')
    return checkMLXWhisperAvailable()
  })
  ipcMain.handle('models:install-mlx-whisper', async () => {
    const { installMLXWhisper } = await import('./models/stt-engine')
    return installMLXWhisper()
  })
  ipcMain.handle('models:check-mlx-whisper-8bit', async () => {
    const { checkMLXWhisper8BitAvailable } = await import('./models/stt-engine')
    return checkMLXWhisper8BitAvailable()
  })
  ipcMain.handle('models:install-mlx-whisper-8bit', async () => {
    const { installMLXWhisper8Bit } = await import('./models/stt-engine')
    return installMLXWhisper8Bit()
  })
  ipcMain.handle('models:check-ffmpeg', async () => {
    const { checkFfmpegAvailable } = await import('./models/stt-engine')
    return checkFfmpegAvailable()
  })
  ipcMain.handle('models:install-ffmpeg', async () => {
    const { installFfmpeg } = await import('./models/stt-engine')
    return installFfmpeg()
  })
  ipcMain.handle('models:check-thestage-whisper', async () => {
    const { checkTheStageWhisperAvailable } = await import('./models/stt-engine')
    return checkTheStageWhisperAvailable()
  })
  ipcMain.handle('models:install-thestage-whisper', async () => {
    const { installTheStageWhisper } = await import('./models/stt-engine')
    return installTheStageWhisper()
  })
  // --- Tray / Meeting ---
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

  // --- Recording ---

  ipcMain.handle('recording:start', async (_e, options: any) => {
    const sender = _e.sender
    updateTrayRecordingState(true)
    return startRecording(
      options,
      (chunk) => { sender.send('recording:transcript-chunk', chunk) },
      (status) => { sender.send('recording:status', status) }
    )
  })
  ipcMain.handle('recording:stop', async () => { updateTrayRecordingState(false); return stopRecording() })
  ipcMain.handle('recording:pause', () => { pauseRecording(); updateTrayRecordingState(false); return true })
  ipcMain.handle('recording:resume', (_e, options?: { sttModel?: string }) => { resumeRecording(options); updateTrayRecordingState(true); return true })
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

  // --- LLM ---
  ipcMain.handle('llm:summarize', async (_e, data: any) => {
    return summarize(
      data.transcript,
      data.personalNotes,
      data.model,
      data.meetingTemplateId,
      data.customPrompt,
      data.meetingTitle,
      data.meetingDuration,
      data.attendees
    )
  })
  ipcMain.handle('llm:chat', async (_e, data: any) => {
    const sender = _e.sender
    return chat(data.messages, data.context, data.model, (chunk) => {
      sender.send('llm:chat-chunk', chunk)
    })
  })

  // --- Audio ---
  ipcMain.handle('audio:get-devices', async () => {
    return [] // Devices are enumerated in the renderer via navigator.mediaDevices
  })
  ipcMain.handle('audio:get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    })
    return sources.map(s => ({ id: s.id, name: s.name }))
  })

  // --- Permissions ---
  ipcMain.handle('permissions:check-mic', () => {
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('microphone')
    }
    return 'granted'
  })
  ipcMain.handle('permissions:request-mic', async () => {
    if (process.platform === 'darwin') {
      return systemPreferences.askForMediaAccess('microphone')
    }
    return true
  })
  ipcMain.handle('permissions:check-screen', () => {
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('screen')
    }
    return 'granted'
  })
  ipcMain.handle('permissions:request-screen', () => {
    // macOS screen recording permission can only be triggered by actually using
    // desktopCapturer; the OS prompts automatically. We return the current status.
    if (process.platform === 'darwin') {
      return systemPreferences.getMediaAccessStatus('screen')
    }
    return 'granted'
  })

  // --- Keychain ---
  ipcMain.handle('keychain:get', (_e, service: string) => {
    const chain = loadKeychain()
    return chain[service] ?? null
  })
  ipcMain.handle('keychain:set', (_e, service: string, value: string) => {
    const chain = loadKeychain()
    chain[service] = value
    saveKeychain(chain)
    return true
  })
  ipcMain.handle('keychain:delete', (_e, service: string) => {
    const chain = loadKeychain()
    delete chain[service]
    saveKeychain(chain)
    return true
  })

  // --- Copart Genie test ---
  ipcMain.handle('copart:test', () => testCopartConnection())
  ipcMain.handle('copart:listModels', () => listCopartGenieModels())

  // --- App ---
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:apple-foundation-available', () => checkAppleFoundationAvailable())
  ipcMain.handle('app:set-login-item', (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return true
  })
}
