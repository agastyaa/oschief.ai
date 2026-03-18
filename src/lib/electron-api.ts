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
  models: {
    download: (modelId: string) => Promise<boolean>
    cancelDownload: (modelId: string) => Promise<boolean>
    delete: (modelId: string) => Promise<boolean>
    list: () => Promise<string[]>
    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
    onDownloadComplete: (callback: (data: { modelId: string; success: boolean; error?: string }) => void) => () => void
    checkMLXWhisper: () => Promise<boolean>
    installMLXWhisper: () => Promise<boolean>
    checkMLXWhisper8Bit: () => Promise<boolean>
    installMLXWhisper8Bit: () => Promise<boolean>
    checkFfmpeg: () => Promise<boolean>
    installFfmpeg: () => Promise<boolean>
    repairMLXWhisper: () => Promise<{ ok: boolean; error?: string }>
    repairMLXWhisper8Bit: () => Promise<{ ok: boolean; error?: string }>
    uninstallMLXWhisper: () => Promise<{ ok: boolean; error?: string }>
    uninstallMLXWhisper8Bit: () => Promise<{ ok: boolean; error?: string }>
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
    summarize: (data: { transcript: any[]; personalNotes: string; model: string; meetingTemplateId?: string; customPrompt?: string; meetingTitle?: string; meetingDuration?: string | null; attendees?: string[] }) => Promise<any>
    chat: (data: { messages: any[]; context: any; model: string }) => Promise<string>
    onChatChunk: (callback: (chunk: { text: string; done: boolean }) => void) => () => void
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
  copart: {
    test: () => Promise<{ ok: boolean; error?: string }>
    listModels?: () => Promise<{ models: { id: string }[]; sttModels: { id: string }[] }>
  }
  app: {
    getVersion: () => Promise<string>
    getPlatform: () => string
    /** Fetch URL from main process (bypasses CORS for calendar ICS). */
    fetchUrl?: (url: string) => Promise<{ ok: boolean; status: number; body: string }>
    isAppleFoundationAvailable?: () => Promise<boolean>
    setLoginItem?: (enabled: boolean) => Promise<boolean>
    onTrayStartRecording: (callback: () => void) => () => void
    onTrayStopRecording?: (callback: () => void) => () => void
    onTrayNavigateToMeeting?: (callback: () => void) => () => void
    onTrayPauseRecording?: (callback: () => void) => () => void
    onMeetingDetected: (callback: (data: { app: string; title?: string; startTime?: number; calendarEvent?: any }) => void) => () => void
    onMeetingEnded: (callback: (data: { app: string }) => void) => () => void
    onMeetingStartingSoon?: (callback: (data: { eventId?: string; title?: string; start?: number; end?: number; joinLink?: string }) => void) => () => void
    onPowerModeChanged?: (callback: (data: { onBattery: boolean }) => void) => () => void
    setCalendarEvents?: (events: Array<{ id: string; title: string; start: number; end: number; joinLink?: string }>) => Promise<boolean>
    updateTrayMeetingInfo?: (info: { title: string; startTime: number } | null) => Promise<void>
  }
  export?: {
    toDocx: (noteData: any) => Promise<{ ok: boolean; path?: string; error?: string }>
    toPdf: (noteData: any) => Promise<{ ok: boolean; path?: string; error?: string }>
    toObsidian: (noteData: any) => Promise<{ ok: boolean; path?: string; error?: string }>
  }
  slack?: {
    testWebhook: (webhookUrl: string) => Promise<{ ok: boolean; error?: string }>
    sendSummary: (webhookUrl: string, payload: any) => Promise<{ ok: boolean; error?: string }>
  }
  teams?: {
    testWebhook: (webhookUrl: string) => Promise<{ ok: boolean; error?: string }>
    sendSummary: (webhookUrl: string, payload: any) => Promise<{ ok: boolean; error?: string }>
  }
  google?: {
    calendarAuth: (clientId: string) => Promise<{ ok: boolean; accessToken?: string; refreshToken?: string; expiresIn?: number; email?: string; error?: string }>
    calendarFetch: (accessToken: string) => Promise<{ ok: boolean; events: any[]; error?: string }>
    calendarRefresh: (clientId: string, refreshToken: string) => Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }>
  }
  microsoft?: {
    calendarAuth: (clientId: string) => Promise<{ ok: boolean; accessToken?: string; refreshToken?: string; expiresIn?: number; email?: string; error?: string }>
    calendarFetch: (accessToken: string) => Promise<{ ok: boolean; events: any[]; error?: string }>
    calendarRefresh: (clientId: string, refreshToken: string) => Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }>
  }
  memory?: {
    people: {
      getAll: () => Promise<any[]>
      get: (id: string) => Promise<any | null>
      upsert: (data: any) => Promise<any>
      delete: (id: string) => Promise<boolean>
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
    }
    topics: {
      getAll: () => Promise<any[]>
      forNote: (noteId: string) => Promise<any[]>
      addToNote: (noteId: string, label: string) => Promise<any>
      unlinkFromNote: (noteId: string, topicId: string) => Promise<boolean>
      updateLabel: (id: string, label: string) => Promise<boolean>
    }
    extractEntities: (data: { noteId: string; summary: any; transcript: any[]; model: string; calendarAttendees?: any[] }) => Promise<{ ok: boolean; peopleCount?: number; commitmentCount?: number; topicCount?: number; error?: string }>
  }
  agentApi?: {
    enable: () => Promise<boolean>
    disable: () => Promise<boolean>
    getStatus: () => Promise<{ enabled: boolean; running: boolean; token: string | null; socketPath: string }>
    regenerateToken: () => Promise<string>
  }
  coaching?: {
    generateRoleInsights: (metrics: any, roleId: string, model?: string) => Promise<{ roleInsights: string[]; roleId: string }>
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
