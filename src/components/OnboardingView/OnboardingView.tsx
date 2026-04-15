import { useState, useEffect } from 'react'
import { Mic, Monitor, Zap, Shield } from 'lucide-react'

interface Props {
  onComplete: () => void
}

const steps = [
  {
    icon: Mic,
    title: '麦克风权限',
    desc: '需要访问麦克风进行录音。macOS 系统会提示授权，请点击允许。',
    platform: 'macOS: 系统偏好设置 → 安全性与隐私 → 隐私 → 麦克风\nWindows: 设置 → 隐私 → 麦克风',
  },
  {
    icon: Monitor,
    title: '模型首次下载',
    desc: '首次转写时，SenseVoice 模型会自动从阿里云下载（约 200MB）。之后完全本地运行。',
    platform: '下载目录: ~/.funasr/\n清理: 设置 → 清除模型缓存',
  },
  {
    icon: Zap,
    title: '本地运行，完全免费',
    desc: '所有录音、转写、说话人分割都在本地完成，不上传任何数据。无需注册账号，无需付费。',
    platform: '技术栈: FunASR SenseVoice + Silero VAD\n数据库: SQLite 本地存储',
  },
  {
    icon: Shield,
    title: '快捷键',
    desc: '使用全局快捷键 Cmd/Ctrl+Shift+R 可以在任何界面快速开始或停止录音。',
    platform: '快捷键: CommandOrControl+Shift+R\n最小化到系统托盘: 设置 → 系统设置',
  },
]

export default function OnboardingView({ onComplete }: Props) {
  const [step, setStep] = useState(0)

  const current = steps[step]
  const Icon = current.icon

  return (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
            <Icon size={24} className="text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">欢迎使用 MeetingRecorder</p>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{current.title}</h2>
          </div>
        </div>

        <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
          {current.desc}
        </p>

        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">提示</p>
          <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
            {current.platform}
          </pre>
        </div>

        {/* Progress dots */}
        <div className="flex gap-2 mb-6 justify-center">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-primary-500' : i < step ? 'bg-primary-300' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              上一步
            </button>
          )}
          <div className="flex-1" />
          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              下一步
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              开始使用
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
