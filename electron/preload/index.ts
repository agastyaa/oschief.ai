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
    pipelineQualityStats: () => ipcRenderer.invoke('db:pipeline-quality-stats') as Promise<any[]>,
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
    onDownloadComplete: (
      callback: (data: {
        modelId: string
        success: boolean
        error?: string
        whisperCli?: { ok: boolean; steps: string[]; error?: string; hint?: string }
      }) => void
    ) => {
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
    checkParakeet: () => ipcRenderer.invoke('models:check-parakeet') as Promise<boolean>,
    installParakeet: () => ipcRenderer.invoke('models:install-parakeet') as Promise<{ ok: boolean; steps?: any[]; error?: string }>,
    checkParakeetCoreML: () => ipcRenderer.invoke('models:check-parakeet-coreml') as Promise<boolean>,
    installParakeetCoreML: () => ipcRenderer.invoke('models:install-parakeet-coreml') as Promise<{ ok: boolean; error?: string }>,
    checkMLXLLM: () => ipcRenderer.invoke('models:check-mlx-llm') as Promise<boolean>,
    installMLXLLM: () => ipcRenderer.invoke('models:install-mlx-llm') as Promise<{ ok: boolean; error?: string }>,
  },

  setup: {
    isComplete: () => ipcRenderer.invoke('setup:is-complete') as Promise<boolean>,
    retry: () => ipcRenderer.invoke('setup:retry') as Promise<any>,
    onProgress: (callback: (status: any) => void) => {
      const handler = (_: any, status: any) => callback(status);
      ipcRenderer.on('setup:progress', handler);
      return () => ipcRenderer.removeListener('setup:progress', handler);
    },
  },

  ollama: {
    detect: () => ipcRenderer.invoke('ollama:detect') as Promise<{ available: boolean; models: string[] }>,
    models: () => ipcRenderer.invoke('ollama:models') as Promise<{ value: string; label: string; size: number }[]>,
    recommendedTier: () => ipcRenderer.invoke('ollama:recommended-tier') as Promise<{ tier: { tag: string; label: string; size: string; contextCap: number; minRamGB: number } | null; ramGB: number }>,
    pull: (modelTag: string) => ipcRenderer.invoke('ollama:pull', modelTag),
    health: () => ipcRenderer.invoke('ollama:health') as Promise<boolean>,
    onPullProgress: (callback: (progress: { modelTag: string; status: string; completed: number; total: number; percent: number }) => void) => {
      const handler = (_event: any, progress: any) => callback(progress)
      ipcRenderer.on('ollama:pull-progress', handler)
      return () => ipcRenderer.removeListener('ollama:pull-progress', handler)
    },
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
    /** Global shortcut: Cmd+Shift+R fires this from anywhere on the Mac */
    onGlobalToggle: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('global:toggle-recording', handler)
      return () => ipcRenderer.removeListener('global:toggle-recording', handler)
    },
    // Draft recovery (crash protection)
    getOrphanedDrafts: () => ipcRenderer.invoke('recording:get-orphaned-drafts'),
    deleteDraft: (noteId: string) => ipcRenderer.invoke('recording:delete-draft', noteId),
    clearAllDrafts: () => ipcRenderer.invoke('recording:clear-all-drafts'),
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
      accountDisplayName?: string
    }) => ipcRenderer.invoke('llm:summarize', data),
    summarizeAndExtract: (data: {
      transcript: any[]
      personalNotes: string
      model: string
      meetingTemplateId?: string
      customPrompt?: string
      meetingTitle?: string
      meetingDuration?: string | null
      attendees?: string[]
      accountDisplayName?: string
    }) => ipcRenderer.invoke('llm:summarize-and-extract', data) as Promise<{
      summary: any
      entities: any | null
      groundingScore: number
      durationMs: number
    }>,
    isUnifiedEligible: (model: string) => ipcRenderer.invoke('llm:is-unified-eligible', model) as Promise<boolean>,
    summarizeBackground: (noteId: string, data: {
      transcript: any[]
      personalNotes: string
      model: string
      meetingTemplateId?: string
      customPrompt?: string
      meetingTitle?: string
      meetingDuration?: string | null
      attendees?: string[]
      accountDisplayName?: string
    }) => ipcRenderer.invoke('llm:summarize-background', noteId, data),
    onSummaryReady: (callback: (noteId: string, summary: any, durationMs: number) => void) => {
      const handler = (_event: any, noteId: string, summary: any, durationMs: number) => callback(noteId, summary, durationMs ?? 0)
      ipcRenderer.on('note:summary-ready', handler)
      return () => ipcRenderer.removeListener('note:summary-ready', handler)
    },
    onSummaryFailed: (callback: (noteId: string) => void) => {
      const handler = (_event: any, noteId: string) => callback(noteId)
      ipcRenderer.on('note:summary-failed', handler)
      return () => ipcRenderer.removeListener('note:summary-failed', handler)
    },
    chat: (data: { messages: any[]; context: any; model: string }) =>
      ipcRenderer.invoke('llm:chat', data),
    buildGraphContext: () => ipcRenderer.invoke('llm:build-graph-context') as Promise<string>,
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

  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    writeClipboard: (text: string) => ipcRenderer.invoke('app:write-clipboard', text),
    getArch: () => ipcRenderer.invoke('app:get-arch') as Promise<string>,
    getOptionalProviders: () => ipcRenderer.invoke('app:get-optional-providers') as Promise<{ id: string; name: string; icon: string; supportsStt?: boolean; models?: string[]; sttModels?: string[] }[]>,
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
    onTrayAgendaNavigate: (callback: (data: { path: string; search?: string }) => void) => {
      const handler = (_event: unknown, data: { path: string; search?: string }) => callback(data)
      ipcRenderer.on('tray-agenda:navigate', handler)
      return () => ipcRenderer.removeListener('tray-agenda:navigate', handler)
    },
    onTrayAgendaOpenEvent: (
      callback: (payload: {
        noteId?: string | null
        eventId?: string
        title?: string
        openMode: 'note' | 'calendar'
      }) => void
    ) => {
      const handler = (_event: unknown, data: any) => callback(data)
      ipcRenderer.on('tray-agenda:open-event', handler)
      return () => ipcRenderer.removeListener('tray-agenda:open-event', handler)
    },
    onTrayPauseRecording: (callback: () => void) => {
      ipcRenderer.on('tray:pause-recording', callback)
      return () => ipcRenderer.removeListener('tray:pause-recording', callback)
    },
    setCalendarEvents: (events: Array<{ id: string; title: string; start: number; end: number; joinLink?: string }>) =>
      ipcRenderer.invoke('meeting:set-calendar-events', events),
    updateTrayMeetingInfo: (info: { title: string; startTime: number } | null) =>
      ipcRenderer.invoke('tray:update-meeting-info', info),
    onPowerModeChanged: (callback: (data: { onBattery: boolean; hidden: boolean; mode: string }) => void) => {
      const handler = (_event: any, data: { onBattery: boolean; hidden: boolean; mode: string }) => callback(data)
      ipcRenderer.on('power:mode-changed', handler)
      return () => ipcRenderer.removeListener('power:mode-changed', handler)
    },
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
    installUpdate: () => ipcRenderer.invoke('app:install-update'),
    onUpdateAvailable: (callback: (version: string) => void) => {
      const handler = (_event: any, version: string) => callback(version)
      ipcRenderer.on('update-available', handler)
      return () => ipcRenderer.removeListener('update-available', handler)
    },
    onUpdateDownloaded: (callback: (version: string) => void) => {
      const handler = (_event: any, version: string) => callback(version)
      ipcRenderer.on('update-downloaded', handler)
      return () => ipcRenderer.removeListener('update-downloaded', handler)
    },
    onUpdateNotAvailable: (callback: () => void) => {
      ipcRenderer.on('update-not-available', callback)
      return () => ipcRenderer.removeListener('update-not-available', callback)
    },
    onUpdateError: (callback: (message: string) => void) => {
      const handler = (_event: any, message: string) => callback(message)
      ipcRenderer.on('update-error', handler)
      return () => ipcRenderer.removeListener('update-error', handler)
    },
  },

  export: {
    toDocx: (noteData: any) => ipcRenderer.invoke('export:docx', noteData) as Promise<{ ok: boolean; path?: string; error?: string }>,
    toPdf: (noteData: any) => ipcRenderer.invoke('export:pdf', noteData) as Promise<{ ok: boolean; path?: string; error?: string }>,
    toObsidian: (noteData: any) => ipcRenderer.invoke('export:obsidian', noteData) as Promise<{ ok: boolean; path?: string; obsidianUri?: string; error?: string; conflict?: boolean; skipped?: boolean }>,
  },

  vault: {
    getConfig: () => ipcRenderer.invoke('vault:get-config') as Promise<{ configured: boolean; path: string | null; vaultName: string | null; validation: any }>,
    setPath: (path: string) => ipcRenderer.invoke('vault:set-path', path) as Promise<{ ok: boolean; error?: string; warning?: string }>,
    pickFolder: () => ipcRenderer.invoke('vault:pick-folder') as Promise<{ ok: boolean; path?: string; vaultName?: string; error?: string; warning?: string }>,
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

  calendarReminders: {
    /** Send updated events to main process for meeting reminders (fire-and-forget) */
    sendEvents: (events: any[]) => ipcRenderer.send('calendar:events-updated', events),
  },

  calendarLocalBlocks: {
    list: () => ipcRenderer.invoke('calendar-local-blocks:list'),
    add: (block: { id: string; title: string; startIso: string; endIso: string; noteId?: string | null }) =>
      ipcRenderer.invoke('calendar-local-blocks:add', block),
    delete: (id: string) => ipcRenderer.invoke('calendar-local-blocks:delete', id),
  },

  trayAgenda: {
    setCache: (events: unknown) => ipcRenderer.invoke('tray-agenda:set-cache', events),
    getCache: () => ipcRenderer.invoke('tray-agenda:get-cache'),
    showMain: () => ipcRenderer.invoke('tray-agenda:show-main'),
    showSettings: () => ipcRenderer.invoke('tray-agenda:show-settings'),
    goToApp: () => ipcRenderer.invoke('tray-agenda:go-to-app'),
    newNote: () => ipcRenderer.invoke('tray-agenda:new-note'),
    quit: () => ipcRenderer.invoke('tray-agenda:quit'),
    activateEvent: (payload: {
      noteId?: string | null
      eventId?: string
      title?: string
      openMode: 'note' | 'calendar'
    }) => ipcRenderer.invoke('tray-agenda:activate-event', payload),
    onCacheUpdated: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('tray-agenda:cache-updated', handler)
      return () => ipcRenderer.removeListener('tray-agenda:cache-updated', handler)
    },
  },

  google: {
    calendarAuth: (clientId: string) =>
      ipcRenderer.invoke('google:calendar-auth', clientId) as Promise<{ ok: boolean; accessToken?: string; refreshToken?: string; expiresIn?: number; email?: string; error?: string }>,
    calendarFetch: (accessToken: string, range?: { daysPast?: number; daysAhead?: number }) =>
      ipcRenderer.invoke('google:calendar-fetch', accessToken, range) as Promise<{ ok: boolean; events: any[]; error?: string }>,
    calendarRefresh: (clientId: string, refreshToken: string) =>
      ipcRenderer.invoke('google:calendar-refresh', clientId, refreshToken) as Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }>,
    gmailFetchThreads: (accessToken: string, emailAddresses: string[], maxResults?: number) =>
      ipcRenderer.invoke('gmail:fetch-threads', accessToken, emailAddresses, maxResults) as Promise<{ ok: boolean; threads: any[]; error?: string }>,
    gmailContextForPeople: (accessToken: string, emailAddresses: string[]) =>
      ipcRenderer.invoke('gmail:context-for-people', accessToken, emailAddresses) as Promise<string>,
  },

  microsoft: {
    calendarAuth: (clientId: string) =>
      ipcRenderer.invoke('microsoft:calendar-auth', clientId) as Promise<{ ok: boolean; accessToken?: string; refreshToken?: string; expiresIn?: number; email?: string; error?: string }>,
    calendarFetch: (accessToken: string, range?: { daysPast?: number; daysAhead?: number }) =>
      ipcRenderer.invoke('microsoft:calendar-fetch', accessToken, range) as Promise<{ ok: boolean; events: any[]; error?: string }>,
    calendarRefresh: (clientId: string, refreshToken: string) =>
      ipcRenderer.invoke('microsoft:calendar-refresh', clientId, refreshToken) as Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }>,
  },

  apple: {
    calendarFetch: (range?: { daysPast?: number; daysAhead?: number }) =>
      ipcRenderer.invoke('apple:calendar-fetch', range) as Promise<{ ok: boolean; events: any[]; error?: string }>,
    calendarCheck: () =>
      ipcRenderer.invoke('apple:calendar-check') as Promise<{ ok: boolean }>,
  },

  memory: {
    people: {
      getAll: () => ipcRenderer.invoke('memory:people-get-all'),
      get: (id: string) => ipcRenderer.invoke('memory:people-get', id),
      upsert: (data: any) => ipcRenderer.invoke('memory:people-upsert', data),
      delete: (id: string) => ipcRenderer.invoke('memory:people-delete', id) as Promise<boolean>,
      forget: (id: string) => ipcRenderer.invoke('memory:people-forget', id) as Promise<boolean>,
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
      delete: (id: string) => ipcRenderer.invoke('memory:commitments-delete', id),
      snooze: (id: string, until: string) => ipcRenderer.invoke('memory:commitments-snooze', id, until),
    },
    topics: {
      getAll: () => ipcRenderer.invoke('memory:topics-get-all'),
      forNote: (noteId: string) => ipcRenderer.invoke('memory:topics-for-note', noteId),
      addToNote: (noteId: string, label: string) => ipcRenderer.invoke('memory:topics-add-to-note', noteId, label),
      unlinkFromNote: (noteId: string, topicId: string) => ipcRenderer.invoke('memory:topics-unlink-from-note', noteId, topicId),
      updateLabel: (id: string, label: string) => ipcRenderer.invoke('memory:topics-update-label', id, label),
    },
    projects: {
      getAll: (filters?: { status?: string }) => ipcRenderer.invoke('memory:projects-get-all', filters) as Promise<any[]>,
      get: (id: string) => ipcRenderer.invoke('memory:projects-get', id) as Promise<any>,
      forNote: (noteId: string) => ipcRenderer.invoke('memory:projects-for-note', noteId) as Promise<any[]>,
      create: (name: string) => ipcRenderer.invoke('memory:projects-create', name) as Promise<any>,
      confirm: (id: string) => ipcRenderer.invoke('memory:projects-confirm', id) as Promise<boolean>,
      archive: (id: string) => ipcRenderer.invoke('memory:projects-archive', id) as Promise<boolean>,
      update: (id: string, data: any) => ipcRenderer.invoke('memory:projects-update', id, data) as Promise<boolean>,
      delete: (id: string) => ipcRenderer.invoke('memory:projects-delete', id) as Promise<boolean>,
      merge: (keepId: string, mergeId: string) => ipcRenderer.invoke('memory:projects-merge', keepId, mergeId) as Promise<boolean>,
      timeline: (projectId: string) => ipcRenderer.invoke('memory:projects-timeline', projectId) as Promise<any>,
      linkToNote: (noteId: string, projectId: string) => ipcRenderer.invoke('memory:projects-link-note', noteId, projectId) as Promise<boolean>,
      unlinkFromNote: (noteId: string, projectId: string) => ipcRenderer.invoke('memory:projects-unlink-note', noteId, projectId) as Promise<boolean>,
      linkPerson: (projectId: string, personId: string) => ipcRenderer.invoke('memory:projects-link-person', projectId, personId) as Promise<boolean>,
    },
    decisions: {
      forNote: (noteId: string) => ipcRenderer.invoke('memory:decisions-for-note', noteId) as Promise<any[]>,
      forProject: (projectId: string) => ipcRenderer.invoke('memory:decisions-for-project', projectId) as Promise<any[]>,
      getAll: (filters?: any) => ipcRenderer.invoke('memory:decisions-get-all', filters) as Promise<any[]>,
      create: (data: { text: string; context?: string; noteId?: string; projectId?: string; date?: string }) => ipcRenderer.invoke('memory:decisions-create', data) as Promise<any>,
      delete: (id: string) => ipcRenderer.invoke('memory:decisions-delete', id) as Promise<boolean>,
      updateStatus: (id: string, status: string) => ipcRenderer.invoke('memory:decisions-update-status', id, status) as Promise<boolean>,
      update: (id: string, data: { text?: string; context?: string; projectId?: string | null }) => ipcRenderer.invoke('memory:decisions-update', id, data) as Promise<boolean>,
      getUnassigned: () => ipcRenderer.invoke('memory:decisions-unassigned') as Promise<any[]>,
    },
    extractEntities: (data: { noteId: string; summary: any; transcript: any[]; model: string; calendarAttendees?: any[]; calendarTitle?: string }) =>
      ipcRenderer.invoke('memory:extract-entities', data) as Promise<{ ok: boolean; peopleCount?: number; commitmentCount?: number; topicCount?: number; projectId?: string; decisionCount?: number; error?: string }>,
    storeEntities: (data: { noteId: string; entities: any; calendarAttendees?: any[]; calendarTitle?: string }) =>
      ipcRenderer.invoke('memory:store-entities', data) as Promise<{ ok: boolean; peopleCount?: number; commitmentCount?: number; topicCount?: number; projectId?: string; decisionCount?: number; error?: string }>,
    stats: () => ipcRenderer.invoke('memory:stats') as Promise<{
      totalNotes: number; totalPeople: number; totalProjects: number; totalDecisions: number; totalCommitments: number;
      openCommitments: number; overdueCommitments: number; activeProjects: number; meetingsThisWeek: number;
      decisionsThisMonth: number; firstNoteDate: string | null; topPeople: { id: string; name: string; meetingCount: number }[];
    }>,
  },

  intelligence: {
    getDailyBrief: () => ipcRenderer.invoke('intelligence:daily-brief'),
    getRiskLevels: () => ipcRenderer.invoke('intelligence:risk-levels'),
    getStaleDecisions: () => ipcRenderer.invoke('intelligence:stale-decisions'),
    generateFollowUpDraft: (commitmentId: string) => ipcRenderer.invoke('intelligence:follow-up-draft', commitmentId) as Promise<{ ok: boolean; draft?: string; error?: string }>,
    getLatestBriefRun: () => ipcRenderer.invoke('intelligence:latest-brief-run'),
  },

  sync: {
    getStatus: () => ipcRenderer.invoke('sync:get-status') as Promise<{
      enabled: boolean
      icloudAvailable: boolean
      lastSyncAt: string | null
      deviceCount: number
      pendingChanges: number
      state: 'synced' | 'syncing' | 'offline' | 'error' | 'disabled'
      error?: string
    }>,
    isICloudAvailable: () => ipcRenderer.invoke('sync:is-icloud-available') as Promise<boolean>,
    enable: () => ipcRenderer.invoke('sync:enable') as Promise<{ ok: boolean; error?: string }>,
    disable: () => ipcRenderer.invoke('sync:disable') as Promise<boolean>,
    forceSync: () => ipcRenderer.invoke('sync:force-sync') as Promise<boolean>,
    onDataChanged: (callback: (data: { count: number }) => void) => {
      const handler = (_event: any, data: { count: number }) => callback(data)
      ipcRenderer.on('sync:data-changed', handler)
      return () => ipcRenderer.removeListener('sync:data-changed', handler)
    },
  },

  context: {
    assemble: (data: { attendeeNames: string[]; attendeeEmails: string[]; eventTitle?: string }) =>
      ipcRenderer.invoke('context:assemble', data) as Promise<any>,
    liveExtract: (recentTranscript: string) =>
      ipcRenderer.invoke('context:live-extract', recentTranscript) as Promise<any>,
  },

  prep: {
    generate: (data: { attendeeNames: string[]; attendeeEmails: string[]; eventTitle?: string; model: string }) =>
      ipcRenderer.invoke('prep:generate', data) as Promise<any>,
    notify: (data: { title: string; body: string }) =>
      ipcRenderer.invoke('notify:meeting-prep', data) as Promise<boolean>,
  },

  routines: {
    getAll: () => ipcRenderer.invoke('routines:get-all') as Promise<any[]>,
    get: (id: string) => ipcRenderer.invoke('routines:get', id) as Promise<any>,
    create: (data: any) => ipcRenderer.invoke('routines:create', data) as Promise<any>,
    update: (id: string, data: any) => ipcRenderer.invoke('routines:update', id, data) as Promise<boolean>,
    delete: (id: string) => ipcRenderer.invoke('routines:delete', id) as Promise<boolean>,
    toggle: (id: string, enabled: boolean) => ipcRenderer.invoke('routines:toggle', id, enabled) as Promise<boolean>,
    runNow: (id: string) => ipcRenderer.invoke('routines:run-now', id) as Promise<any>,
    getRuns: (routineId: string, limit?: number) => ipcRenderer.invoke('routines:get-runs', routineId, limit) as Promise<any[]>,
    onResult: (callback: (result: any) => void) => {
      const handler = (_event: any, result: any) => callback(result)
      ipcRenderer.on('routines:result', handler)
      return () => ipcRenderer.removeListener('routines:result', handler)
    },
  },

  contacts: {
    importVCF: () => ipcRenderer.invoke('contacts:import-vcf') as Promise<{ ok: boolean; total?: number; imported?: number; skipped?: number; errors?: number; error?: string }>,
  },

  agentApi: {
    enable: () => ipcRenderer.invoke('api:enable') as Promise<boolean>,
    disable: () => ipcRenderer.invoke('api:disable') as Promise<boolean>,
    getStatus: () => ipcRenderer.invoke('api:get-status') as Promise<{ enabled: boolean; running: boolean; token: string | null; socketPath: string }>,
    regenerateToken: () => ipcRenderer.invoke('api:regenerate-token') as Promise<string>,
  },

  coaching: {
    generateRoleInsights: (metrics: any, roleId: string, model?: string) =>
      ipcRenderer.invoke('coaching:generate-role-insights', metrics, roleId, model) as Promise<{ roleInsights: string[]; roleId: string }>,
    analyzeConversation: (payload: any) =>
      ipcRenderer.invoke('coaching:analyze-conversation', payload) as Promise<{
        ok: true
        data: {
          headline: string
          narrative: string
          microInsights: { text: string; framework?: string; evidenceQuote?: string; speaker?: string; time?: string }[]
          habitTags: string[]
          keyMoments: { title: string; quote: string; speaker: string; time: string }[]
          generatedAt: string
          model?: string
        }
      } | {
        ok: false
        error: 'no_model' | 'no_transcript' | 'llm_error' | 'invalid_json' | 'invalid_response'
        message: string
      }>,
    aggregateInsights: (
      meetings: {
        title: string
        date: string
        headline: string
        narrative: string
        habitTags: string[]
        overallScore?: number
      }[],
      roleId: string,
      model?: string
    ) =>
      ipcRenderer.invoke('coaching:aggregate-insights', meetings, roleId, model) as Promise<{
        summaryHeadline: string
        themesParagraph: string
        focusNext: string
        recurringTags: string[]
      } | null>,
    analyzeAll: () =>
      ipcRenderer.invoke('coaching:analyze-all') as Promise<{ ok: boolean; total: number; completed: number; errors: string[] }>,
    onAnalyzeProgress: (callback: (data: { current: number; total: number; noteTitle?: string }) => void) => {
      const handler = (_e: any, data: any) => callback(data)
      ipcRenderer.on('coaching:analyze-progress', handler)
      return () => ipcRenderer.removeListener('coaching:analyze-progress', handler)
    },
  },

  digest: {
    getWeekly: () => ipcRenderer.invoke('digest:get-weekly') as Promise<any>,
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
      ipcRenderer.invoke('window:set-content-protection', enabled) as Promise<boolean>,
  },

  window: {
    hide: () =>
      ipcRenderer.invoke('window:hide') as Promise<void>,
    show: () =>
      ipcRenderer.invoke('window:show') as Promise<void>,
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
