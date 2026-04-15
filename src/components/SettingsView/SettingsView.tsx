import { useState, useEffect } from 'react'
import { Mic, Globe, Eye, Download, Monitor, Server, Trash2, FolderOpen, Moon, Sun, HardDrive } from 'lucide-react'
import { useMeetingStore } from '@/stores/meetingStore'

export default function SettingsView() {
  const [settings, setSettings] = useState({
    microphone: 'default',
    language: 'zh',
    realtimeCaption: true,
    captionInterval: 2,
    exportFormat: 'md',
    audioQuality: '16kHz',
    autoStart: false,
    minimizeToTray: true,
    darkMode: false,
  })

  const [mics, setMics] = useState<{ id: string; label: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [cacheSize, setCacheSize] = useState('')
  const [appPath, setAppPath] = useState('')
  const { clearCache, clearData } = useMeetingStore()

  useEffect(() => {
    const saved = localStorage.getItem('meetingRecorderSettings')
    if (saved) setSettings(s => ({ ...s, ...JSON.parse(saved) }))

    navigator.mediaDevices.enumerateDevices().then(devices => {
      const audioInputs = devices.filter(d => d.kind === 'audioinput')
        .map(d => ({ id: d.deviceId, label: d.label || '默认麦克风' }))
      setMics(audioInputs)
    })

    window.electronAPI.getDarkMode().then(isDark => {
      setSettings(s => ({ ...s, darkMode: isDark }))
    })

    window.electronAPI.getAppPath().then(p => setAppPath(p))

    // 监听系统主题变化
    window.electronAPI.onThemeChanged((isDark: boolean) => {
      setSettings(s => {
        // 只有用户没有手动覆盖时才跟随系统
        const followed = localStorage.getItem('meetingRecorderSettings')
        if (followed) {
          const parsed = JSON.parse(followed)
          if (parsed._themeSource === 'manual') return s
        }
        if (isDark) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        return { ...s, darkMode: isDark }
      })
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const toSave = { ...settings, _themeSource: 'manual' as string }
    localStorage.setItem('meetingRecorderSettings', JSON.stringify(toSave))
    await window.electronAPI.saveSettings(toSave)

    // 应用深色模式
    await window.electronAPI.setDarkMode(settings.darkMode)
    if (settings.darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    setSavedMsg('设置已保存')
    setTimeout(() => setSaving(false), 500)
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const handleClearCache = async () => {
    if (!confirm('确定要清除模型缓存吗？重新使用需要重新下载（约 200MB）。')) return
    const result = await clearCache()
    const size = result.cleared > 0 ? `${(result.cleared / 1024 / 1024).toFixed(1)} MB` : '0 KB'
    alert(`模型缓存已清除（${size}）`)
  }

  const handleClearData = async () => {
    if (!confirm('确定要清除所有历史记录吗？此操作不可恢复。')) return
    await clearData()
    alert('历史记录已清除')
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Appearance */}
        <section>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            {settings.darkMode ? <Moon size={20} className="text-primary-500" /> : <Sun size={20} className="text-primary-500" />}
            外观
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">深色模式</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">跟随系统或手动切换</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.darkMode}
                  onChange={e => setSettings({ ...settings, darkMode: e.target.checked })}
                  className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 dark:peer-checked:bg-primary-500"></div>
              </label>
            </div>
          </div>
        </section>

        {/* Audio Settings */}
        <section>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <Mic size={20} className="text-primary-500" /> 音频设置
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-4 shadow-sm">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">麦克风设备</label>
              <select value={settings.microphone}
                onChange={e => setSettings({ ...settings, microphone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                {mics.map(mic => <option key={mic.id} value={mic.id}>{mic.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">录音质量</label>
              <select value={settings.audioQuality}
                onChange={e => setSettings({ ...settings, audioQuality: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <option value="16kHz">16kHz（推荐，转写用）</option>
                <option value="44.1kHz">44.1kHz（高音质）</option>
              </select>
            </div>
          </div>
        </section>

        {/* Language Settings */}
        <section>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <Globe size={20} className="text-primary-500" /> 语言设置
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-4 shadow-sm">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">会议语言</label>
              <select value={settings.language}
                onChange={e => setSettings({ ...settings, language: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <option value="zh">中文</option>
                <option value="yue">粤语</option>
                <option value="ja">日语</option>
                <option value="ko">韩语</option>
                <option value="auto">自动检测</option>
              </select>
            </div>
          </div>
        </section>

        {/* Realtime Caption Settings */}
        <section>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <Eye size={20} className="text-primary-500" /> 实时字幕
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">开启实时字幕</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">录音过程中实时显示字幕</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.realtimeCaption}
                  onChange={e => setSettings({ ...settings, realtimeCaption: e.target.checked })}
                  className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
            {settings.realtimeCaption && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">字幕刷新间隔</label>
                <select value={settings.captionInterval}
                  onChange={e => setSettings({ ...settings, captionInterval: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                  <option value={1}>1 秒（更实时）</option>
                  <option value={2}>2 秒（推荐）</option>
                  <option value={3}>3 秒（较稳定）</option>
                  <option value={5}>5 秒（最稳定）</option>
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Export Settings */}
        <section>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <Download size={20} className="text-primary-500" /> 导出设置
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-4 shadow-sm">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">默认导出格式</label>
              <select value={settings.exportFormat}
                onChange={e => setSettings({ ...settings, exportFormat: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                <option value="md">Markdown (.md)</option>
                <option value="txt">纯文本 (.txt)</option>
                <option value="json">JSON (.json)</option>
              </select>
            </div>
          </div>
        </section>

        {/* System Settings */}
        <section>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <Monitor size={20} className="text-primary-500" /> 系统设置
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">开机启动</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">系统启动时自动运行</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.autoStart}
                  onChange={e => setSettings({ ...settings, autoStart: e.target.checked })}
                  className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">最小化到托盘</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">关闭窗口时最小化到系统托盘</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.minimizeToTray}
                  onChange={e => setSettings({ ...settings, minimizeToTray: e.target.checked })}
                  className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
              </label>
            </div>
          </div>
        </section>

        {/* Data Management */}
        <section>
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <Server size={20} className="text-primary-500" /> 数据管理
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-4 shadow-sm">
            {appPath && (
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <HardDrive size={18} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 dark:text-gray-400">数据存储位置</div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate">{appPath}</div>
                </div>
              </div>
            )}
            <button onClick={handleClearCache}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <FolderOpen size={20} className="text-gray-400" />
                <div className="text-left">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-200">清除模型缓存</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">释放磁盘空间，重新使用需重新下载</div>
                </div>
              </div>
            </button>
            <button onClick={handleClearData}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <Trash2 size={20} className="text-red-400" />
                <div className="text-left">
                  <div className="text-sm font-medium text-red-600 dark:text-red-400">清除所有历史记录</div>
                  <div className="text-xs text-gray-500">此操作不可恢复</div>
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex items-center gap-3 justify-end">
          {savedMsg && <span className="text-sm text-green-600 dark:text-green-400">{savedMsg}</span>}
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  )
}
