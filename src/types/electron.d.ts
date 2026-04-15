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

interface ElectronAPI {
  pythonCall: (method: string, params?: Record<string, unknown>) => Promise<any>
  selectFile: () => Promise<string[]>
  getAppPath: () => Promise<string>
  onCaptureStatus: (callback: (data: CaptureStatusData) => void) => void
  onRealtimeCaption: (callback: (data: RealtimeCaptionData) => void) => void
  onProcessingProgress: (callback: (data: ProcessingProgressData) => void) => void
  removeAllListeners: (channel: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
