// Type declarations for Electron preload API

interface ModelInfo {
  name: string
  path: string
  sizeBytes: number
  fileCount: number
}

interface ModelInfoResponse {
  models: ModelInfo[]
  totalSize: number
  totalFiles: number
  status: 'ok' | 'not_found' | 'empty' | 'error'
  error?: string
}

interface RedownloadModelsResponse {
  status: 'ok' | 'readonly' | 'error'
  message: string
}

interface ProcessingProgressData {
  meetingId: string
  progress: number
  message: string
}

interface ProcessingErrorData {
  meetingId: string
  error: string
}

interface CaptureStatusData {
  recordingId: string
  duration: number
  audioLevel: number
  speakersCount: number
}

interface RealtimeCaptionData {
  recordingId: string
  speaker: string
  text: string
  startTime: number
}

interface EnvNoticeData {
  type: 'info' | 'warning' | 'error' | 'installing' | 'success'
  message: string
}

interface ModelDownloadData {
  message: string
  progress?: number
}

interface ElectronAPI {
  pythonCall: (method: string, params?: Record<string, unknown>) => Promise<any>
  openMicrophonePermission: () => Promise<{ status: string }>
  requestMicrophoneAccess: () => Promise<{ status: string; granted: boolean; error?: string }>
  selectFile: () => Promise<string[]>
  importAudioFile: (srcPath: string) => Promise<{ audioPath: string }>
  selectSavePath: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>
  getAppPath: () => Promise<string>
  getAudioUrl: (filePath: string) => Promise<string>
  getDarkMode: () => Promise<boolean>
  setDarkMode: (dark: boolean) => Promise<any>
  onThemeChanged: (callback: (isDark: boolean) => void) => () => void
  saveSettings: (settings: Record<string, any>) => Promise<any>
  getSettings: () => Promise<Record<string, any>>
  showItemInFolder: (path: string) => Promise<void>
  getOldRecordings: (days?: number) => Promise<{ count: number; fileCount: number; totalBytes: number; meetings: any[] }>
  cleanupOldRecordings: (days?: number) => Promise<{ deletedFiles: number; deletedRecords: number; freedBytes: number }>
  onCaptureStatus: (callback: (data: CaptureStatusData) => void) => () => void
  onRealtimeCaption: (callback: (data: RealtimeCaptionData) => void) => () => void
  onProcessingProgress: (callback: (data: ProcessingProgressData) => void) => () => void
  onProcessingError: (callback: (data: ProcessingErrorData) => void) => () => void
  onPythonReady: (callback: () => void) => () => void
  onPythonError: (callback: (msg: string) => void) => () => void
  onEnvNotice: (callback: (data: EnvNoticeData) => void) => () => void
  onModelDownload: (callback: (data: ModelDownloadData) => void) => () => void
  onTrayAction: (callback: (action: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
