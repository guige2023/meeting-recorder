import { useState } from 'react'
import RecorderView from './components/RecorderView/RecorderView'
import HistoryView from './components/HistoryView/HistoryView'
import SettingsView from './components/SettingsView/SettingsView'
import { Mic, FileText, Settings } from 'lucide-react'

type Tab = 'recorder' | 'history' | 'settings'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('recorder')

  const tabs = [
    { id: 'recorder' as Tab, label: '录音', icon: Mic },
    { id: 'history' as Tab, label: '历史', icon: FileText },
    { id: 'settings' as Tab, label: '设置', icon: Settings },
  ]

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Top Navigation */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
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
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="text-sm text-gray-400">
          MeetingRecorder v1.0
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'recorder' && <RecorderView />}
        {activeTab === 'history' && <HistoryView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}

export default App
