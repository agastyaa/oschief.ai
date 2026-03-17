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
    checkMLXWhisper8Bit: () => ipcRenderer.invoke('models:check-mlx-whisper-8bit'),
    installMLXWhisper8Bit: () => ipcRenderer.invoke('models:install-mlx-whisper-8bit'),
    checkFfmpeg: () => ipcRenderer.invoke('models:check-ffmpeg'),
    installFfmpeg: () => ipcRenderer.invoke('models:install-ffmpeg'),
    repairMLXWhisper: () => ipcRenderer.invoke('models:repair-mlx-whisper') as Promise<{ ok: boolean; error?: string }>,
    repairMLXWhisper8Bit: () => ipcRenderer.invoke('models:repair-mlx-whisper-8bit') as Promise<{ ok: boolean; error?: string }>,
    uninstallMLXWhisper: () => ipcRenderer.invoke('models:uninstall-mlx-whisper') as Promise<{ ok: boolean; error?: string }>,
    uninstallMLXWhisper8Bit: () => ipcRenderer.invoke('models:uninstall-mlx-whisper-8bit') as Promise<{ ok: boolean; error?: string }>,
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
    onCorrectedTranscript: (callback: (chunk: TranscriptChunk & { originalText: string }) => void) => {
      const handler = (_event: any, chunk: any) => callback(chunk)
      ipcRenderer.on('recording:transcript-corrected', handler)
      return () => ipcRenderer.removeListener('recording:transcript-corrected', handler)
    },
  },

  llm: {
    summarize: (data: {
      transcript: any[]
      personalNotes: string
      model: string
      meetingTemplateId?: string
      customPrompt?: string
      meetingTitle?: string
      meetingDuration?: string | null
      attendees?: string[]
    }) => ipcRenderer.invoke('llm:summarize', data),
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
    /** Fetch URL from main process (bypasses CORS for calendar ICS, e.g. Outlook). Returns { ok, status, body }. */
    fetchUrl: (url: string) =>
      ipcRenderer.invoke('fetch:url', url) as Promise<{ ok: boolean; status: number; body: string }>,
    getPlatform: () => process.platform,
    isAppleFoundationAvailable: () => ipcRenderer.invoke('app:apple-foundation-available') as Promise<boolean>,
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

  export: {
    toDocx: (noteData: any) => ipcRenderer.invoke('export:docx', noteData) as Promise<{ ok: boolean; path?: string; error?: string }>,
    toPdf: (noteData: any) => ipcRenderer.invoke('export:pdf', noteData) as Promise<{ ok: boolean; path?: string; error?: string }>,
    toObsidian: (noteData: any) => ipcRenderer.invoke('export:obsidian', noteData) as Promise<{ ok: boolean; path?: string; error?: string }>,
  },

  slack: {
    testWebhook: (webhookUrl: string) =>
      ipcRenderer.invoke('slack:test-webhook', webhookUrl) as Promise<{ ok: boolean; error?: string }>,
    sendSummary: (webhookUrl: string, payload: any) =>
      ipcRenderer.invoke('slack:send-summary', webhookUrl, payload) as Promise<{ ok: boolean; error?: string }>,
  },

  teams: {
    testWebhook: (webhookUrl: string) =>
      ipcRenderer.invoke('teams:test-webhook', webhookUrl) as Promise<{ ok: boolean; error?: string }>,
    sendSummary: (webhookUrl: string, payload: any) =>
      ipcRenderer.invoke('teams:send-summary', webhookUrl, payload) as Promise<{ ok: boolean; error?: string }>,
  },

  google: {
    calendarAuth: (clientId: string) =>
      ipcRenderer.invoke('google:calendar-auth', clientId) as Promise<{ ok: boolean; accessToken?: string; refreshToken?: string; expiresIn?: number; email?: string; error?: string }>,
    calendarFetch: (accessToken: string) =>
      ipcRenderer.invoke('google:calendar-fetch', accessToken) as Promise<{ ok: boolean; events: any[]; error?: string }>,
    calendarRefresh: (clientId: string, refreshToken: string) =>
      ipcRenderer.invoke('google:calendar-refresh', clientId, refreshToken) as Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }>,
  },

  microsoft: {
    calendarAuth: (clientId: string) =>
      ipcRenderer.invoke('microsoft:calendar-auth', clientId) as Promise<{ ok: boolean; accessToken?: string; refreshToken?: string; expiresIn?: number; email?: string; error?: string }>,
    calendarFetch: (accessToken: string) =>
      ipcRenderer.invoke('microsoft:calendar-fetch', accessToken) as Promise<{ ok: boolean; events: any[]; error?: string }>,
    calendarRefresh: (clientId: string, refreshToken: string) =>
      ipcRenderer.invoke('microsoft:calendar-refresh', clientId, refreshToken) as Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }>,
  },

  memory: {
    people: {
      getAll: () => ipcRenderer.invoke('memory:people-get-all'),
      get: (id: string) => ipcRenderer.invoke('memory:people-get', id),
      upsert: (data: any) => ipcRenderer.invoke('memory:people-upsert', data),
      merge: (keepId: string, mergeId: string) => ipcRenderer.invoke('memory:people-merge', keepId, mergeId),
      getMeetings: (personId: string) => ipcRenderer.invoke('memory:people-get-meetings', personId),
      forNote: (noteId: string) => ipcRenderer.invoke('memory:people-for-note', noteId),
      update: (id: string, data: any) => ipcRenderer.invoke('memory:people-update', id, data),
      unlinkFromNote: (noteId: string, personId: string) => ipcRenderer.invoke('memory:people-unlink-from-note', noteId, personId),
      linkToNote: (noteId: string, personId: string, role?: string) => ipcRenderer.invoke('memory:people-link-to-note', noteId, personId, role),
    },
    commitments: {
      getAll: (filters?: any) => ipcRenderer.invoke('memory:commitments-get-all', filters),
      forNote: (noteId: string) => ipcRenderer.invoke('memory:commitments-for-note', noteId),
      getOpen: () => ipcRenderer.invoke('memory:commitments-open'),
      add: (data: any) => ipcRenderer.invoke('memory:commitments-add', data),
      updateStatus: (id: string, status: string) => ipcRenderer.invoke('memory:commitments-update-status', id, status),
      update: (id: string, data: any) => ipcRenderer.invoke('memory:commitments-update', id, data),
    },
    topics: {
      getAll: () => ipcRenderer.invoke('memory:topics-get-all'),
      forNote: (noteId: string) => ipcRenderer.invoke('memory:topics-for-note', noteId),
      addToNote: (noteId: string, label: string) => ipcRenderer.invoke('memory:topics-add-to-note', noteId, label),
      unlinkFromNote: (noteId: string, topicId: string) => ipcRenderer.invoke('memory:topics-unlink-from-note', noteId, topicId),
      updateLabel: (id: string, label: string) => ipcRenderer.invoke('memory:topics-update-label', id, label),
    },
    extractEntities: (data: { noteId: string; summary: any; transcript: any[]; model: string; calendarAttendees?: any[] }) =>
      ipcRenderer.invoke('memory:extract-entities', data) as Promise<{ ok: boolean; peopleCount?: number; commitmentCount?: number; topicCount?: number; error?: string }>,
  },

  kb: {
    pickFolder: () =>
      ipcRenderer.invoke('kb:pick-folder') as Promise<{ ok: boolean; path?: string; added?: number; updated?: number; removed?: number; total?: number; error?: string }>,
    scan: () =>
      ipcRenderer.invoke('kb:scan') as Promise<{ ok: boolean; added?: number; updated?: number; removed?: number; total?: number; error?: string }>,
    search: (query: string, topK?: number) =>
      ipcRenderer.invoke('kb:search', query, topK) as Promise<any[]>,
    getChunkCount: () =>
      ipcRenderer.invoke('kb:get-chunk-count') as Promise<number>,
    clear: () =>
      ipcRenderer.invoke('kb:clear') as Promise<{ ok: boolean }>,
    getLiveSuggestions: (recentTranscript: string, model?: string) =>
      ipcRenderer.invoke('kb:get-live-suggestions', recentTranscript, model) as Promise<{ text: string; source: string }[]>,
  },

  contentProtection: {
    set: (enabled: boolean) =>
      ipcRenderer.invoke('app:set-content-protection', enabled) as Promise<boolean>,
  },

  jira: {
    testToken: (siteUrl: string, email: string, apiToken: string) =>
      ipcRenderer.invoke('jira:test-token', siteUrl, email, apiToken) as Promise<{ ok: boolean; displayName?: string; error?: string }>,
    getProjects: (configJson: string) =>
      ipcRenderer.invoke('jira:get-projects', configJson) as Promise<any[]>,
    getIssueTypes: (configJson: string, projectKey: string) =>
      ipcRenderer.invoke('jira:get-issue-types', configJson, projectKey) as Promise<any[]>,
    searchUsers: (configJson: string, query: string) =>
      ipcRenderer.invoke('jira:search-users', configJson, query) as Promise<any[]>,
    createIssue: (configJson: string, issueData: any) =>
      ipcRenderer.invoke('jira:create-issue', configJson, issueData) as Promise<{ ok: boolean; issue?: any; error?: string }>,
    bulkCreate: (configJson: string, issues: any[]) =>
      ipcRenderer.invoke('jira:bulk-create', configJson, issues) as Promise<{ results: any[] }>,
    getIssue: (configJson: string, issueKey: string) =>
      ipcRenderer.invoke('jira:get-issue', configJson, issueKey) as Promise<any>,
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
