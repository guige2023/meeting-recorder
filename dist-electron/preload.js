"use strict";
const electron = require("electron");
console.log("[preload] script loaded, electron:", process.versions.electron);
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Python RPC 调用
  pythonCall: (method, params) => electron.ipcRenderer.invoke("python_call", method, params),
  // 文件选择
  selectFile: () => electron.ipcRenderer.invoke("select_file"),
  // 导入录音文件（复制到 app data 目录）
  importAudioFile: (srcPath) => electron.ipcRenderer.invoke("import_audio_file", srcPath),
  // 获取应用数据路径
  getAppPath: () => electron.ipcRenderer.invoke("get_app_path"),
  // 获取音频文件的 file:// URL
  getAudioUrl: (filePath) => electron.ipcRenderer.invoke("get_audio_url", filePath),
  // 主题
  getDarkMode: () => electron.ipcRenderer.invoke("get_dark_mode"),
  setDarkMode: (dark) => electron.ipcRenderer.invoke("set_dark_mode", dark),
  onThemeChanged: (callback) => {
    electron.ipcRenderer.on("theme_changed", (_event, isDark) => callback(isDark));
  },
  // 设置
  saveSettings: (settings) => electron.ipcRenderer.invoke("save_settings", settings),
  getSettings: () => electron.ipcRenderer.invoke("get_settings"),
  // 在文件夹中显示
  showItemInFolder: (path) => electron.ipcRenderer.invoke("show_item_in_folder", path),
  // 清理旧录音
  getOldRecordings: (days) => electron.ipcRenderer.invoke("get_old_recordings", days != null ? { days } : {}),
  cleanupOldRecordings: (days) => electron.ipcRenderer.invoke("cleanup_old_recordings", days != null ? { days } : {}),
  // 监听 Python 推送的消息
  onCaptureStatus: (callback) => {
    electron.ipcRenderer.on("capture_status", (_event, data) => callback(data));
  },
  onRealtimeCaption: (callback) => {
    electron.ipcRenderer.on("realtime_caption", (_event, data) => callback(data));
  },
  onProcessingProgress: (callback) => {
    electron.ipcRenderer.on("processing_progress", (_event, data) => callback(data));
  },
  onPythonReady: (callback) => {
    electron.ipcRenderer.on("python_ready", () => callback());
  },
  onPythonError: (callback) => {
    electron.ipcRenderer.on("python_error", (_event, msg) => callback(msg));
  },
  onEnvNotice: (callback) => {
    electron.ipcRenderer.on("env_notice", (_event, data) => callback(data));
  },
  onModelDownload: (callback) => {
    electron.ipcRenderer.on("model_download", (_event, data) => callback(data));
  },
  onTrayAction: (callback) => {
    electron.ipcRenderer.on("tray_action", (_event, action) => callback(action));
  },
  removeAllListeners: (channel) => {
    electron.ipcRenderer.removeAllListeners(channel);
  }
});
console.log("[preload] electronAPI exposed");
