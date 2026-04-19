import { contextBridge, ipcRenderer } from 'electron'

// 调试日志
console.log('[preload] script loaded, electron:', process.versions.electron)

function subscribe(channel: string, callback: (...args: any[]) => void) {
  const listener = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Python RPC 调用
  pythonCall: (method: string, params?: any) => ipcRenderer.invoke('python_call', method, params),

  // 文件选择
  selectFile: () => ipcRenderer.invoke('select_file'),

  // 保存文件对话框（用于数据库导出）
  selectSavePath: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('select_save_path', options || {}),

  // 导入录音文件（复制到 app data 目录）
  importAudioFile: (srcPath: string) => ipcRenderer.invoke('import_audio_file', srcPath),

  // 获取应用数据路径
  getAppPath: () => ipcRenderer.invoke('get_app_path'),

  // 获取音频文件的 file:// URL
  getAudioUrl: (filePath: string) => ipcRenderer.invoke('get_audio_url', filePath),

  // 主题
  getDarkMode: () => ipcRenderer.invoke('get_dark_mode'),
  setDarkMode: (dark: boolean) => ipcRenderer.invoke('set_dark_mode', dark),
  onThemeChanged: (callback: (isDark: boolean) => void) => subscribe('theme_changed', callback),

  // 打开系统麦克风权限设置
  openMicrophonePermission: () => ipcRenderer.invoke('open_microphone_permission'),
  requestMicrophoneAccess: () => ipcRenderer.invoke('request_microphone_access'),

  // 设置
  saveSettings: (settings: Record<string, any>) => ipcRenderer.invoke('save_settings', settings),
  getSettings: () => ipcRenderer.invoke('get_settings'),

  // 在文件夹中显示
  showItemInFolder: (path: string) => ipcRenderer.invoke('show_item_in_folder', path),

  // 清理旧录音
  getOldRecordings: (days?: number) =>
    ipcRenderer.invoke('get_old_recordings', days != null ? { days } : {}),
  cleanupOldRecordings: (days?: number) =>
    ipcRenderer.invoke('cleanup_old_recordings', days != null ? { days } : {}),

  // 监听 Python 推送的消息
  onCaptureStatus: (callback: (data: any) => void) => subscribe('capture_status', callback),
  onRealtimeCaption: (callback: (data: any) => void) => subscribe('realtime_caption', callback),
  onProcessingProgress: (callback: (data: any) => void) => subscribe('processing_progress', callback),
  onProcessingError: (callback: (data: any) => void) => subscribe('processing_error', callback),
  onPythonReady: (callback: () => void) => subscribe('python_ready', callback),
  onPythonError: (callback: (msg: string) => void) => subscribe('python_error', callback),
  onEnvNotice: (callback: (data: any) => void) => subscribe('env_notice', callback),
  onModelDownload: (callback: (data: any) => void) => subscribe('model_download', callback),
  onTrayAction: (callback: (action: string) => void) => subscribe('tray_action', callback),
})

console.log('[preload] electronAPI exposed')
