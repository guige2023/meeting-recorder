export {}

declare global {
  interface Window {
    electronAPI: {
      pythonCall: (method: string, params?: any) => Promise<any>
      selectFile: () => Promise<string[]>
      getAppPath: () => Promise<string>
      onCaptureStatus: (callback: (data: any) => void) => void
      onRealtimeCaption: (callback: (data: any) => void) => void
      onProcessingProgress: (callback: (data: any) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}
