import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Python RPC 调用
  pythonCall: (method: string, params?: any) => ipcRenderer.invoke('python_call', method, params),

  // 文件选择
  selectFile: () => ipcRenderer.invoke('select_file'),

  // 获取应用数据路径
  getAppPath: () => ipcRenderer.invoke('get_app_path'),

  // 监听 Python 推送的消息
  onCaptureStatus: (callback: (data: any) => void) => {
    ipcRenderer.on('capture_status', (_event, data) => callback(data))
  },

  onRealtimeCaption: (callback: (data: any) => void) => {
    ipcRenderer.on('realtime_caption', (_event, data) => callback(data))
  },

  onProcessingProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('processing_progress', (_event, data) => callback(data))
  },

  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  }
})

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
