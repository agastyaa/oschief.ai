import type { ConversationInsights } from "./coaching-analytics"

type ConversationAnalysisResponse =
  | { ok: true; data: ConversationInsights }
  | {
      ok: false
      error: 'no_model' | 'no_transcript' | 'llm_error' | 'invalid_json' | 'invalid_response'
      message: string
    }

type TranscriptWord = { word: string; start: number; end: number }
type TranscriptChunk = {
  speaker: string
  time: string
  text: string
  words?: TranscriptWord[]
}

type DownloadProgress = {
  modelId: string
  bytesDownloaded: number
  totalBytes: number
  percent: number
}

/** Transcript of what the main process did for local STT setup (Settings / toasts). */
export type LocalSetupResult = {
  ok: boolean
  steps: string[]
  error?: string
  hint?: string
}

export type MemoryStats = {
  totalNotes: number; totalPeople: number; totalProjects: number; totalDecisions: number; totalCommitments: number;
  openCommitments: number; overdueCommitments: number; activeProjects: number; meetingsThisWeek: number;
  decisionsThisMonth: number; firstNoteDate: string | null; topPeople: { id: string; name: string; meetingCount: number }[];
}

type ElectronAPI = {
  db: {
    notes: {
      getAll: () => Promise<any[]>
      get: (id: string) => Promise<any | null>
      add: (note: any) => Promise<boolean>
      update: (id: string, data: any) => Promise<boolean>
      delete: (id: string) => Promise<boolean>
      updateFolder: (noteId: string, folderId: string | null) => Promise<boolean>
    }
    folders: {
      getAll: () => Promise<any[]>
      add: (folder: any) => Promise<boolean>
      update: (id: string, data: any) => Promise<boolean>
      delete: (id: string) => Promise<boolean>
    }
    settings: {
      get: (key: string) => Promise<string | null>
      set: (key: string, value: string) => Promise<boolean>
      getAll: () => Promise<Record<string, string>>
    }
  }
  setup?: {
    isComplete: () => Promise<boolean>
    retry: () => Promise<any>
    onProgress: (callback: (status: { phase: string; message: string; percent: number; track: number; sttModel?: string; llmModel?: string }) => void) => () => void
  }
  ollama?: {
    detect: () => Promise<{ available: boolean; models: string[] }>
    models: () => Promise<{ value: string; label: string; size: number }[]>
    recommendedTier: () => Promise<{ tier: { tag: string; label: string; size: string; contextCap: number; minRamGB: number } | null; ramGB: number }>
    pull: (modelTag: string) => Promise<boolean>
    health: () => Promise<boolean>
    onPullProgress: (callback: (progress: { modelTag: string; status: string; completed: number; total: number; percent: number }) => void) => () => void
  }
  models: {
    download: (modelId: string) => Promise<boolean>
    cancelDownload: (modelId: string) => Promise<boolean>
    delete: (modelId: string) => Promise<boolean>
    list: () => Promise<string[]>
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
    onDownloadComplete: (
      callback: (data: {
        modelId: string
        success: boolean
        error?: string
        whisperCli?: LocalSetupResult
      }) => void
    ) => () => void
    checkMLXWhisper: () => Promise<boolean>
    installMLXWhisper: () => Promise<LocalSetupResult>
    checkMLXWhisper8Bit: () => Promise<boolean>
    installMLXWhisper8Bit: () => Promise<LocalSetupResult>
    checkFfmpeg: () => Promise<boolean>
    installFfmpeg: () => Promise<boolean>
    repairMLXWhisper: () => Promise<{ ok: boolean; error?: string }>
    repairMLXWhisper8Bit: () => Promise<{ ok: boolean; error?: string }>
    uninstallMLXWhisper: () => Promise<{ ok: boolean; error?: string }>
    uninstallMLXWhisper8Bit: () => Promise<{ ok: boolean; error?: string }>
    checkQwen3ASR: () => Promise<boolean>
    installQwen3ASR: () => Promise<LocalSetupResult>
    uninstallQwen3ASR: () => Promise<{ ok: boolean; error?: string }>
    checkParakeet: () => Promise<boolean>
    installParakeet: () => Promise<{ ok: boolean; steps?: any[]; error?: string }>
    checkParakeetCoreML: () => Promise<boolean>
    installParakeetCoreML: () => Promise<{ ok: boolean; error?: string }>
  }
  recording: {
    start: (options: { sttModel: string; deviceId?: string; meetingTitle?: string; vocabulary?: string[]; sampleRate?: number }) => Promise<boolean>
    stop: () => Promise<any>
    pause: () => Promise<boolean>
    resume: (options?: { sttModel?: string }) => Promise<boolean>
    sendAudioChunk: (pcmData: Float32Array, channel?: number) => Promise<boolean>
    onTranscriptChunk: (callback: (chunk: TranscriptChunk) => void) => () => void
    onRecordingStatus: (callback: (status: { state: string; error?: string }) => void) => () => void
    onCorrectedTranscript?: (callback: (chunk: TranscriptChunk & { originalText: string }) => void) => () => void
  }
  llm: {
    summarize: (data: { transcript: any[]; personalNotes: string; model: string; meetingTemplateId?: string; customPrompt?: string; meetingTitle?: string; meetingDuration?: string | null; attendees?: string[]; accountDisplayName?: string }) => Promise<any>
    chat: (data: { messages: any[]; context: any; model: string }) => Promise<string>
    onChatChunk: (callback: (chunk: { text: string; done: boolean }) => void) => () => void
    buildGraphContext: () => Promise<string>
  }
  audio: {
    getDevices: () => Promise<any[]>
    getDesktopSources: () => Promise<{ id: string; name: string }[]>
  }
  permissions: {
    checkMicrophone: () => Promise<string>
    requestMicrophone: () => Promise<boolean>
    checkScreenRecording: () => Promise<string>
    requestScreenRecording: () => Promise<string>
  }
  keychain: {
    get: (service: string) => Promise<string | null>
    set: (service: string, value: string) => Promise<boolean>
    delete: (service: string) => Promise<boolean>
  }
  app: {
    getVersion: () => Promise<string>
    /** Main process `process.arch` (e.g. arm64, x64). */
    getArch?: () => Promise<string>
    getOptionalProviders?: () => Promise<{ id: string; name: string; icon: string; supportsStt?: boolean; models?: string[]; sttModels?: string[] }[]>
    listOpenRouterModels?: () => Promise<{ id: string; name: string; pricing?: { prompt: string; completion: string }; context_length?: number }[]>
    refreshOpenRouterModels?: () => Promise<{ id: string; name: string; pricing?: { prompt: string; completion: string }; context_length?: number }[]>
    listCustomProviders?: () => Promise<{ id: string; name: string; icon: string; baseURL: string; models: string[] }[]>
    addCustomProvider?: (config: { id: string; name: string; icon: string; baseURL: string; models: string[] }) => Promise<boolean>
    updateCustomProvider?: (config: { id: string; name: string; icon: string; baseURL: string; models: string[] }) => Promise<boolean>
    removeCustomProvider?: (id: string) => Promise<boolean>
    testCustomProvider?: (apiKey: string, baseURL: string, model?: string) => Promise<{ ok: boolean; error?: string }>
    fetchCustomProviderModels?: (apiKey: string, baseURL: string) => Promise<string[]>
    getPlatform: () => string
    /** Fetch URL from main process (bypasses CORS for calendar ICS). */
    fetchUrl?: (url: string) => Promise<{ ok: boolean; status: number; body: string }>
    isAppleFoundationAvailable?: () => Promise<boolean>
    setLoginItem?: (enabled: boolean) => Promise<boolean>
    onTrayStartRecording: (callback: () => void) => () => void
    onTrayStopRecording?: (callback: () => void) => () => void
    onTrayNavigateToMeeting?: (callback: () => void) => () => void
    onTrayAgendaNavigate?: (callback: (data: { path: string; search?: string }) => void) => () => void
    onTrayAgendaOpenEvent?: (callback: (payload: {
      noteId?: string | null
      eventId?: string
      title?: string
      openMode: "note" | "calendar"
    }) => void) => () => void
    onTrayPauseRecording?: (callback: () => void) => () => void
    onMeetingDetected: (callback: (data: { app: string; title?: string; startTime?: number; calendarEvent?: any }) => void) => () => void
    onMeetingEnded: (callback: (data: { app: string }) => void) => () => void
    onMeetingStartingSoon?: (callback: (data: { eventId?: string; title?: string; start?: number; end?: number; joinLink?: string }) => void) => () => void
    onPowerModeChanged?: (callback: (data: { onBattery: boolean }) => void) => () => void
    setCalendarEvents?: (events: Array<{ id: string; title: string; start: number; end: number; joinLink?: string }>) => Promise<boolean>
    updateTrayMeetingInfo?: (info: { title: string; startTime: number } | null) => Promise<void>
    checkForUpdates?: () => Promise<
      | { ok: true; isUpdateAvailable: boolean; version: string | null }
      | { ok: false; error: string }
    >
    installUpdate?: () => Promise<void>
    onUpdateAvailable?: (callback: (version: string) => void) => () => void
    onUpdateDownloaded?: (callback: (version: string) => void) => () => void
    onUpdateNotAvailable?: (callback: () => void) => () => void
    onUpdateError?: (callback: (message: string) => void) => () => void
  }
  export?: {
    toDocx: (noteData: any) => Promise<{ ok: boolean; path?: string; error?: string }>
    toPdf: (noteData: any) => Promise<{ ok: boolean; path?: string; error?: string }>
    toObsidian: (noteData: any) => Promise<{ ok: boolean; path?: string; obsidianUri?: string; error?: string; conflict?: boolean; skipped?: boolean }>
  }
  vault?: {
    getConfig: () => Promise<{ configured: boolean; path: string | null; vaultName: string | null; validation: any }>
    setPath: (path: string) => Promise<{ ok: boolean; error?: string; warning?: string }>
    pickFolder: () => Promise<{ ok: boolean; path?: string; vaultName?: string; error?: string; warning?: string }>
  }
  routines?: {
    getAll: () => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
    toggle: (id: string, enabled: boolean) => Promise<boolean>
    runNow: (id: string) => Promise<any>
    getRuns: (routineId: string, limit?: number) => Promise<any[]>
    onResult: (callback: (result: any) => void) => () => void
  }
  contacts?: {
    importVCF: () => Promise<{ ok: boolean; total?: number; imported?: number; skipped?: number; errors?: number; error?: string }>
  }
  context?: {
    assemble: (data: { attendeeNames: string[]; attendeeEmails: string[]; eventTitle?: string }) => Promise<any>
    liveExtract: (recentTranscript: string) => Promise<any>
  }
  prep?: {
    generate: (data: { attendeeNames: string[]; attendeeEmails: string[]; eventTitle?: string; model: string }) => Promise<any>
    notify: (data: { title: string; body: string }) => Promise<boolean>
  }
  slack?: {
    testWebhook: (webhookUrl: string) => Promise<{ ok: boolean; error?: string }>
    sendSummary: (webhookUrl: string, payload: any) => Promise<{ ok: boolean; error?: string }>
  }
  teams?: {
    testWebhook: (webhookUrl: string) => Promise<{ ok: boolean; error?: string }>
    sendSummary: (webhookUrl: string, payload: any) => Promise<{ ok: boolean; error?: string }>
  }
  calendarLocalBlocks?: {
    list: () => Promise<{ id: string; title: string; startIso: string; endIso: string; noteId: string | null; createdAt: string }[]>
    add: (block: { id: string; title: string; startIso: string; endIso: string; noteId?: string | null }) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
  }
  trayAgenda?: {
    setCache: (events: unknown) => Promise<boolean>
    getCache: () => Promise<
      Array<{
        id: string
        title: string
        start: string
        end: string
        joinLink?: string
        hasNote?: boolean
        noteId?: string | null
        source?: "synced" | "local"
      }>
    >
    showMain: () => Promise<boolean>
    showSettings: () => Promise<boolean>
    goToApp: () => Promise<boolean>
    newNote: () => Promise<boolean>
    quit: () => Promise<boolean>
    activateEvent: (payload: {
      noteId?: string | null
      eventId?: string
      title?: string
      openMode: "note" | "calendar"
    }) => Promise<boolean>
    onCacheUpdated: (callback: () => void) => () => void
  }
  google?: {
    calendarAuth: (clientId: string) => Promise<{ ok: boolean; accessToken?: string; refreshToken?: string; expiresIn?: number; email?: string; error?: string }>
    calendarFetch: (
      accessToken: string,
      range?: { daysPast?: number; daysAhead?: number }
    ) => Promise<{ ok: boolean; events: any[]; error?: string }>
    calendarRefresh: (clientId: string, refreshToken: string) => Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }>
  }
  microsoft?: {
    calendarAuth: (clientId: string) => Promise<{ ok: boolean; accessToken?: string; refreshToken?: string; expiresIn?: number; email?: string; error?: string }>
    calendarFetch: (
      accessToken: string,
      range?: { daysPast?: number; daysAhead?: number }
    ) => Promise<{ ok: boolean; events: any[]; error?: string }>
    calendarRefresh: (clientId: string, refreshToken: string) => Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }>
  }
  memory?: {
    people: {
      getAll: () => Promise<any[]>
      get: (id: string) => Promise<any | null>
      upsert: (data: any) => Promise<any>
      delete: (id: string) => Promise<boolean>
      forget: (id: string) => Promise<boolean>
      merge: (keepId: string, mergeId: string) => Promise<boolean>
      getMeetings: (personId: string) => Promise<any[]>
      forNote: (noteId: string) => Promise<any[]>
      update: (id: string, data: { name?: string; email?: string; company?: string; role?: string; relationship?: string; notes?: string }) => Promise<boolean>
      unlinkFromNote: (noteId: string, personId: string) => Promise<boolean>
      linkToNote: (noteId: string, personId: string, role?: string) => Promise<boolean>
    }
    commitments: {
      getAll: (filters?: any) => Promise<any[]>
      forNote: (noteId: string) => Promise<any[]>
      getOpen: () => Promise<any[]>
      add: (data: any) => Promise<any>
      updateStatus: (id: string, status: string) => Promise<boolean>
      update: (id: string, data: any) => Promise<boolean>
      delete: (id: string) => Promise<boolean>
      snooze: (id: string, until: string) => Promise<boolean>
    }
    topics: {
      getAll: () => Promise<any[]>
      forNote: (noteId: string) => Promise<any[]>
      addToNote: (noteId: string, label: string) => Promise<any>
      unlinkFromNote: (noteId: string, topicId: string) => Promise<boolean>
      updateLabel: (id: string, label: string) => Promise<boolean>
    }
    projects: {
      getAll: (filters?: { status?: string }) => Promise<any[]>
      get: (id: string) => Promise<any>
      forNote: (noteId: string) => Promise<any[]>
      create: (name: string) => Promise<any>
      confirm: (id: string) => Promise<boolean>
      archive: (id: string) => Promise<boolean>
      update: (id: string, data: any) => Promise<boolean>
      delete: (id: string) => Promise<boolean>
      merge: (keepId: string, mergeId: string) => Promise<boolean>
      timeline: (projectId: string) => Promise<any>
      linkToNote: (noteId: string, projectId: string) => Promise<boolean>
      unlinkFromNote: (noteId: string, projectId: string) => Promise<boolean>
      linkPerson: (projectId: string, personId: string) => Promise<boolean>
    }
    decisions: {
      forNote: (noteId: string) => Promise<any[]>
      forProject: (projectId: string) => Promise<any[]>
      getAll: (filters?: any) => Promise<any[]>
      create: (data: { text: string; context?: string; noteId?: string; projectId?: string; date?: string }) => Promise<any>
      delete: (id: string) => Promise<boolean>
      updateStatus: (id: string, status: string) => Promise<boolean>
      update: (id: string, data: { text?: string; context?: string; projectId?: string | null }) => Promise<boolean>
      getUnassigned: () => Promise<any[]>
    }
    extractEntities: (data: { noteId: string; summary: any; transcript: any[]; model: string; calendarAttendees?: any[]; calendarTitle?: string }) => Promise<{ ok: boolean; peopleCount?: number; commitmentCount?: number; topicCount?: number; projectId?: string; decisionCount?: number; error?: string }>
    stats: () => Promise<MemoryStats>
  }
  sync?: {
    getStatus: () => Promise<{
      enabled: boolean
      icloudAvailable: boolean
      lastSyncAt: string | null
      deviceCount: number
      pendingChanges: number
      state: 'synced' | 'syncing' | 'offline' | 'error' | 'disabled'
      error?: string
    }>
    isICloudAvailable: () => Promise<boolean>
    enable: () => Promise<{ ok: boolean; error?: string }>
    disable: () => Promise<boolean>
    forceSync: () => Promise<boolean>
    onDataChanged: (callback: (data: { count: number }) => void) => () => void
  }
  agentApi?: {
    enable: () => Promise<boolean>
    disable: () => Promise<boolean>
    getStatus: () => Promise<{ enabled: boolean; running: boolean; token: string | null; socketPath: string }>
    regenerateToken: () => Promise<string>
  }
  coaching?: {
    generateRoleInsights: (metrics: any, roleId: string, model?: string) => Promise<{ roleInsights: string[]; roleId: string }>
    analyzeConversation: (payload: {
      transcript: { speaker: string; time: string; text: string }[]
      metrics: Record<string, unknown>
      heuristics?: {
        yourTurns: number
        yourTurnsWithQuestion: number
        questionRatioYou: number
        longestYouMonologueWords: number
        longestYouMonologueLines: number
        totalYouWords: number
        suggestedHabitTags: string[]
      } | null
      roleId: string
      model?: string
    }) => Promise<ConversationAnalysisResponse>
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
    ) => Promise<{
      summaryHeadline: string
      themesParagraph: string
      focusNext: string
      recurringTags: string[]
    } | null>
    analyzeAll: () => Promise<{ ok: boolean; total: number; completed: number; errors: string[] }>
    onAnalyzeProgress: (callback: (data: { current: number; total: number; noteTitle?: string }) => void) => () => void
  }
  digest?: {
    getWeekly: () => Promise<any>
  }
  kb?: {
    pickFolder: () => Promise<{ ok: boolean; path?: string; added?: number; updated?: number; removed?: number; total?: number; error?: string }>
    scan: () => Promise<{ ok: boolean; added?: number; updated?: number; removed?: number; total?: number; error?: string }>
    search: (query: string, topK?: number) => Promise<any[]>
    getChunkCount: () => Promise<number>
    clear: () => Promise<{ ok: boolean }>
    getLiveSuggestions: (recentTranscript: string, model?: string) => Promise<{ text: string; source: string }[]>
  }
  contentProtection?: {
    set: (enabled: boolean) => Promise<boolean>
  }
  jira?: {
    testToken: (siteUrl: string, email: string, apiToken: string) => Promise<{ ok: boolean; displayName?: string; error?: string }>
    getProjects: (configJson: string) => Promise<any[]>
    getIssueTypes: (configJson: string, projectKey: string) => Promise<any[]>
    searchUsers: (configJson: string, query: string) => Promise<any[]>
    createIssue: (configJson: string, issueData: any) => Promise<{ ok: boolean; issue?: any; error?: string }>
    bulkCreate: (configJson: string, issues: any[]) => Promise<{ results: any[] }>
    getIssue: (configJson: string, issueKey: string) => Promise<any>
  }
  asana?: {
    testToken: (token: string) => Promise<{ ok: boolean; name?: string; email?: string; error?: string }>
    getWorkspaces: (token: string) => Promise<{ gid: string; name: string }[]>
    getProjects: (token: string, workspaceGid: string) => Promise<{ gid: string; name: string }[]>
    createTask: (token: string, taskData: any) => Promise<{ ok: boolean; task?: { gid: string; permalink_url: string }; error?: string }>
    getTask: (token: string, taskGid: string) => Promise<any>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export const isElectron = typeof window !== 'undefined' && !!window.electronAPI

export function getElectronAPI(): ElectronAPI | null {
  return window.electronAPI ?? null
}
