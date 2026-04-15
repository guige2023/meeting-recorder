import { useState, useEffect } from 'react'
import RecorderView from './components/RecorderView/RecorderView'
import HistoryView from './components/HistoryView/HistoryView'
import SettingsView from './components/SettingsView/SettingsView'
import OnboardingView from './components/OnboardingView/OnboardingView'
import { Mic, FileText, Settings } from 'lucide-react'

// DEBUG: 检查 electronAPI 是否注入
console.log('[App] electronAPI type:', typeof window.electronAPI)
console.log('[App] electronAPI keys:', window.electronAPI ? Object.keys(window.electronAPI) : 'null/undefined')

type Tab = 'recorder' | 'history' | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('recorder')
  const [darkMode, setDarkMode] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [envError, setEnvError] = useState<string | null>(null)
  const [modelDownload, setModelDownload] = useState<string | null>(null)
  const [installMessage, setInstallMessage] = useState<string | null>(null)
  const [pythonReady, setPythonReady] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) {
      console.error('[App] electronAPI not available yet!')
      return
    }

    // 加载主题
    window.electronAPI.getDarkMode().then(isDark => {
      setDarkMode(isDark)
      if (isDark) {
        document.documentElement.classList.add('dark')
      }
    })

    // 检查环境
    window.electronAPI.pythonCall('check_env', {}).then(result => {
      if (result.error) {
        setEnvError(result.error)
        return
      }
      if (result.missingDeps && result.missingDeps.length > 0) {
        setEnvError(`缺少 Python 依赖: ${result.missingDeps.join(', ')}\n请运行: pip install ${result.missingDeps.join(' ')}`)
        return
      }
      setPythonReady(true)
    }).catch(() => {
      // Python 还未 ready，等 python_ready 事件
    })

    // Python ready
    window.electronAPI.onPythonReady(() => {
      setPythonReady(true)
      // 首次运行检查
      const hasOnboarded = localStorage.getItem('meetingRecorder_onboarded')
      if (!hasOnboarded) {
        setShowOnboarding(true)
      }
    })

    // 环境通知（pip install 进度 / 安装结果）
    window.electronAPI.onEnvNotice((data) => {
      if (data.type === 'installing') {
        setInstallMessage(data.message)
      } else if (data.type === 'success') {
        setInstallMessage(null)
      } else if (data.type === 'warning' || data.type === 'error') {
        setEnvError(data.message)
      }
    })

    // 模型下载进度
    window.electronAPI.onModelDownload((data) => {
      if (data.message) {
        setModelDownload(data.message.slice(-200))
      }
    })

    // 系统主题变化 — 只有用户没有手动设置过时才跟随
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const saved = localStorage.getItem('meetingRecorderSettings')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed._themeSource === 'manual') return
      }
      setDarkMode(e.matches)
      if (e.matches) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    })
  }, [])

  const tabs = [
    { id: 'recorder' as Tab, label: '录音', icon: Mic },
    { id: 'history' as Tab, label: '历史', icon: FileText },
    { id: 'settings' as Tab, label: '设置', icon: Settings },
  ]

  if (showOnboarding) {
    return <OnboardingView onComplete={() => {
      localStorage.setItem('meetingRecorder_onboarded', '1')
      setShowOnboarding(false)
    }} />
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Top Navigation */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3">
          {modelDownload && (
            <span className="text-xs text-blue-500 max-w-xs truncate">{modelDownload}</span>
          )}
          <div className={`w-2 h-2 rounded-full ${pythonReady ? 'bg-green-500' : 'bg-yellow-500'}`}
               title={pythonReady ? 'Python 就绪' : 'Python 初始化中...'} />
          <span className="text-sm text-gray-400 dark:text-gray-500">v1.0.3</span>
        </div>
      </header>

      {/* Env error banner */}
      {envError && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
          <span className="font-medium">环境问题:</span>
          <code className="text-xs bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded flex-1 truncate">{envError}</code>
          <button onClick={() => setEnvError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {!pythonReady && !envError ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-gray-700 dark:text-gray-200 font-medium">正在启动录音服务...</p>
              <p className="text-sm mt-1">
                {modelDownload ? (
                  <span className="text-blue-500">{modelDownload.slice(-80)}</span>
                ) : installMessage ? (
                  <span className="text-yellow-600 dark:text-yellow-400">{installMessage}</span>
                ) : (
                  <span className="text-gray-400">初始化 Python 环境</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'recorder' && <RecorderView />}
            {activeTab === 'history' && <HistoryView />}
            {activeTab === 'settings' && <SettingsView />}
          </>
        )}
      </main>
    </div>
  )
}

export default App
