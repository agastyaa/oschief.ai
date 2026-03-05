type TranscriptChunk = {
  speaker: string
  time: string
  text: string
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
    checkTheStageWhisper: () => Promise<boolean>
    installTheStageWhisper: () => Promise<boolean>
  }
  recording: {
    start: (options: { sttModel: string; deviceId?: string; meetingTitle?: string; vocabulary?: string[] }) => Promise<boolean>
    stop: () => Promise<any>
    pause: () => Promise<boolean>
    resume: (options?: { sttModel?: string }) => Promise<boolean>
    sendAudioChunk: (pcmData: Float32Array, channel?: number) => Promise<boolean>
    onTranscriptChunk: (callback: (chunk: TranscriptChunk) => void) => () => void
    onRecordingStatus: (callback: (status: { state: string; error?: string }) => void) => () => void
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
