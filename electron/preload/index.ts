import { contextBridge, ipcRenderer } from 'electron'

export type TranscriptChunk = {
  speaker: string
  time: string
  text: string
}

export type DownloadProgress = {
  modelId: string
  bytesDownloaded: number
  totalBytes: number
  percent: number
}

const electronAPI = {
  db: {
    notes: {
      getAll: () => ipcRenderer.invoke('db:notes-get-all'),
      get: (id: string) => ipcRenderer.invoke('db:notes-get', id),
      add: (note: any) => ipcRenderer.invoke('db:notes-add', note),
      update: (id: string, data: any) => ipcRenderer.invoke('db:notes-update', id, data),
      delete: (id: string) => ipcRenderer.invoke('db:notes-delete', id),
      updateFolder: (noteId: string, folderId: string | null) =>
        ipcRenderer.invoke('db:notes-update-folder', noteId, folderId),
    },
    folders: {
      getAll: () => ipcRenderer.invoke('db:folders-get-all'),
      add: (folder: any) => ipcRenderer.invoke('db:folders-add', folder),
      update: (id: string, data: any) => ipcRenderer.invoke('db:folders-update', id, data),
      delete: (id: string) => ipcRenderer.invoke('db:folders-delete', id),
    },
    settings: {
      get: (key: string) => ipcRenderer.invoke('db:settings-get', key),
      set: (key: string, value: string) => ipcRenderer.invoke('db:settings-set', key, value),
      getAll: () => ipcRenderer.invoke('db:settings-get-all'),
    },
  },

  models: {
    download: (modelId: string) => ipcRenderer.invoke('models:download', modelId),
    cancelDownload: (modelId: string) => ipcRenderer.invoke('models:cancel-download', modelId),
    delete: (modelId: string) => ipcRenderer.invoke('models:delete', modelId),
    list: () => ipcRenderer.invoke('models:list'),
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
      const handler = (_event: any, progress: DownloadProgress) => callback(progress)
      ipcRenderer.on('models:download-progress', handler)
      return () => ipcRenderer.removeListener('models:download-progress', handler)
    },
    onDownloadComplete: (callback: (data: { modelId: string; success: boolean; error?: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('models:download-complete', handler)
      return () => ipcRenderer.removeListener('models:download-complete', handler)
    },
    checkMLXWhisper: () => ipcRenderer.invoke('models:check-mlx-whisper'),
    installMLXWhisper: () => ipcRenderer.invoke('models:install-mlx-whisper'),
  },

  recording: {
    start: (options: { sttModel: string; deviceId?: string; meetingTitle?: string; vocabulary?: string[] }) =>
      ipcRenderer.invoke('recording:start', options),
    stop: () => ipcRenderer.invoke('recording:stop'),
    pause: () => ipcRenderer.invoke('recording:pause'),
    resume: (options?: { sttModel?: string }) => ipcRenderer.invoke('recording:resume', options),
    sendAudioChunk: (pcmData: Float32Array, channel?: number) =>
      ipcRenderer.invoke('recording:audio-chunk', pcmData, channel ?? 0),
    onTranscriptChunk: (callback: (chunk: TranscriptChunk) => void) => {
      const handler = (_event: any, chunk: TranscriptChunk) => callback(chunk)
      ipcRenderer.on('recording:transcript-chunk', handler)
      return () => ipcRenderer.removeListener('recording:transcript-chunk', handler)
    },
    onRecordingStatus: (callback: (status: { state: string; error?: string }) => void) => {
      const handler = (_event: any, status: any) => callback(status)
      ipcRenderer.on('recording:status', handler)
      return () => ipcRenderer.removeListener('recording:status', handler)
    },
  },

  llm: {
    summarize: (data: { transcript: any[]; personalNotes: string; model: string; meetingTemplateId?: string }) =>
      ipcRenderer.invoke('llm:summarize', data),
    chat: (data: { messages: any[]; context: any; model: string }) =>
      ipcRenderer.invoke('llm:chat', data),
    onChatChunk: (callback: (chunk: { text: string; done: boolean }) => void) => {
      const handler = (_event: any, chunk: any) => callback(chunk)
      ipcRenderer.on('llm:chat-chunk', handler)
      return () => ipcRenderer.removeListener('llm:chat-chunk', handler)
    },
  },

  audio: {
    getDevices: () => ipcRenderer.invoke('audio:get-devices'),
    getDesktopSources: () => ipcRenderer.invoke('audio:get-desktop-sources'),
  },

  permissions: {
    checkMicrophone: () => ipcRenderer.invoke('permissions:check-mic'),
    requestMicrophone: () => ipcRenderer.invoke('permissions:request-mic'),
    checkScreenRecording: () => ipcRenderer.invoke('permissions:check-screen'),
    requestScreenRecording: () => ipcRenderer.invoke('permissions:request-screen'),
  },

  keychain: {
    get: (service: string) => ipcRenderer.invoke('keychain:get', service),
    set: (service: string, value: string) => ipcRenderer.invoke('keychain:set', service, value),
    delete: (service: string) => ipcRenderer.invoke('keychain:delete', service),
  },

  copart: {
    test: () => ipcRenderer.invoke('copart:test') as Promise<{ ok: boolean; error?: string }>,
    listModels: () =>
      ipcRenderer.invoke('copart:listModels') as Promise<{ models: { id: string }[]; sttModels: { id: string }[] }>,
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => process.platform,
    setLoginItem: (enabled: boolean) => ipcRenderer.invoke('app:set-login-item', enabled),
    onTrayStartRecording: (callback: () => void) => {
      ipcRenderer.on('tray:start-recording', callback)
      return () => ipcRenderer.removeListener('tray:start-recording', callback)
    },
    onTrayStopRecording: (callback: () => void) => {
      ipcRenderer.on('tray:stop-recording', callback)
      return () => ipcRenderer.removeListener('tray:stop-recording', callback)
    },
    onMeetingDetected: (callback: (data: { app: string; title?: string; startTime?: number; calendarEvent?: any }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('meeting:detected', handler)
      return () => ipcRenderer.removeListener('meeting:detected', handler)
    },
    onMeetingEnded: (callback: (data: { app: string }) => void) => {
      const handler = (_event: any, data: { app: string }) => callback(data)
      ipcRenderer.on('meeting:ended', handler)
      return () => ipcRenderer.removeListener('meeting:ended', handler)
    },
    onMeetingStartingSoon: (callback: (data: { eventId?: string; title?: string; start?: number; end?: number; joinLink?: string }) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on('meeting:starting-soon', handler)
      return () => ipcRenderer.removeListener('meeting:starting-soon', handler)
    },
    onTrayNavigateToMeeting: (callback: () => void) => {
      ipcRenderer.on('tray:navigate-to-meeting', callback)
      return () => ipcRenderer.removeListener('tray:navigate-to-meeting', callback)
    },
    onTrayPauseRecording: (callback: () => void) => {
      ipcRenderer.on('tray:pause-recording', callback)
      return () => ipcRenderer.removeListener('tray:pause-recording', callback)
    },
    setCalendarEvents: (events: Array<{ id: string; title: string; start: number; end: number; joinLink?: string }>) =>
      ipcRenderer.invoke('meeting:set-calendar-events', events),
    updateTrayMeetingInfo: (info: { title: string; startTime: number } | null) =>
      ipcRenderer.invoke('tray:update-meeting-info', info),
    onPowerModeChanged: (callback: (data: { onBattery: boolean }) => void) => {
      const handler = (_event: any, data: { onBattery: boolean }) => callback(data)
      ipcRenderer.on('power:mode-changed', handler)
      return () => ipcRenderer.removeListener('power:mode-changed', handler)
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
