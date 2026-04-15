// Type declarations for Electron preload API

interface ProcessingProgressData {
  meetingId: string
  progress: number
  message: string
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
  selectFile: () => Promise<string[]>
  getAppPath: () => Promise<string>
  getAudioUrl: (filePath: string) => Promise<string>
  getDarkMode: () => Promise<boolean>
  setDarkMode: (dark: boolean) => Promise<any>
  onThemeChanged: (callback: (isDark: boolean) => void) => void
  saveSettings: (settings: Record<string, any>) => Promise<any>
  getSettings: () => Promise<Record<string, any>>
  showItemInFolder: (path: string) => Promise<void>
  onCaptureStatus: (callback: (data: CaptureStatusData) => void) => void
  onRealtimeCaption: (callback: (data: RealtimeCaptionData) => void) => void
  onProcessingProgress: (callback: (data: ProcessingProgressData) => void) => void
  onPythonReady: (callback: () => void) => void
  onPythonError: (callback: (msg: string) => void) => void
  onEnvNotice: (callback: (data: EnvNoticeData) => void) => void
  onModelDownload: (callback: (data: ModelDownloadData) => void) => void
  onTrayAction: (callback: (action: string) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
