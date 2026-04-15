import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Python RPC 调用
  pythonCall: (method: string, params?: any) => ipcRenderer.invoke('python_call', method, params),

  // 文件选择
  selectFile: () => ipcRenderer.invoke('select_file'),

  // 获取应用数据路径
  getAppPath: () => ipcRenderer.invoke('get_app_path'),

  // 获取音频文件的 file:// URL
  getAudioUrl: (filePath: string) => ipcRenderer.invoke('get_audio_url', filePath),

  // 主题
  getDarkMode: () => ipcRenderer.invoke('get_dark_mode'),

  // 设置
  saveSettings: (settings: Record<string, any>) => ipcRenderer.invoke('save_settings', settings),
  getSettings: () => ipcRenderer.invoke('get_settings'),

  // 在文件夹中显示
  showItemInFolder: (path: string) => ipcRenderer.invoke('show_item_in_folder', path),

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
  onPythonReady: (callback: () => void) => {
    ipcRenderer.on('python_ready', () => callback())
  },
  onPythonError: (callback: (msg: string) => void) => {
    ipcRenderer.on('python_error', (_event, msg) => callback(msg))
  },
  onEnvNotice: (callback: (data: any) => void) => {
    ipcRenderer.on('env_notice', (_event, data) => callback(data))
  },
  onModelDownload: (callback: (data: any) => void) => {
    ipcRenderer.on('model_download', (_event, data) => callback(data))
  },
  onTrayAction: (callback: (action: string) => void) => {
    ipcRenderer.on('tray_action', (_event, action) => callback(action))
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
      getAudioUrl: (filePath: string) => Promise<string>
      getDarkMode: () => Promise<boolean>
      saveSettings: (settings: Record<string, any>) => Promise<any>
      getSettings: () => Promise<Record<string, any>>
      showItemInFolder: (path: string) => Promise<void>
      onCaptureStatus: (callback: (data: any) => void) => void
      onRealtimeCaption: (callback: (data: any) => void) => void
      onProcessingProgress: (callback: (data: any) => void) => void
      onPythonReady: (callback: () => void) => void
      onPythonError: (callback: (msg: string) => void) => void
      onEnvNotice: (callback: (data: any) => void) => void
      onModelDownload: (callback: (data: any) => void) => void
      onTrayAction: (callback: (action: string) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}
