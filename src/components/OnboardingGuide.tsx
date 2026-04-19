import { useState, useEffect } from 'react'
import { Mic, FileText, Users, Download, CheckCircle, AlertCircle, ArrowRight, ExternalLink } from 'lucide-react'

interface Props {
  onComplete: () => void
}

interface ModelInfo {
  name: string
  sizeBytes: number
  fileCount: number
}

interface ModelInfoResponse {
  models: ModelInfo[]
  totalSize: number
  status: 'ok' | 'not_found' | 'empty' | 'error'
}

export default function OnboardingGuide({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null)
  const [modelLoading, setModelLoading] = useState(false)

  // Fetch model info when step 2 is shown
  useEffect(() => {
    if (step === 2 && !modelInfo) {
      setModelLoading(true)
      window.electronAPI.pythonCall('get_model_info', {}).then((result: ModelInfoResponse) => {
        setModelInfo(result)
        setModelLoading(false)
      }).catch(() => {
        setModelInfo({ models: [], totalSize: 0, status: 'error' })
        setModelLoading(false)
      })
    }
  }, [step, modelInfo])

  const handleOpenMicPermission = () => {
    window.electronAPI.requestMicrophoneAccess().then((result) => {
      if (!result.granted) {
        window.electronAPI.openMicrophonePermission()
      }
    }).catch(() => {
      window.electronAPI.openMicrophonePermission()
    })
  }

  const handleComplete = () => {
    localStorage.setItem('onboardingCompleted', 'true')
    onComplete()
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-8">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                欢迎使用会议录音机
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                智能会议录音 · 实时转写 · 说话人分离
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <Mic size={32} className="text-primary-500 mb-2" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">录音</span>
              </div>
              <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <FileText size={32} className="text-primary-500 mb-2" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">转写</span>
              </div>
              <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <Users size={32} className="text-primary-500 mb-2" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">说话人分离</span>
              </div>
              <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <Download size={32} className="text-primary-500 mb-2" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">导出</span>
              </div>
            </div>

            <button
              onClick={() => setStep(1)}
              className="w-full py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              开始设置
              <ArrowRight size={18} />
            </button>
          </>
        )}

        {/* Step 1: Microphone Permission */}
        {step === 1 && (
          <>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                <Mic size={24} className="text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">步骤 1/3</p>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">需要麦克风权限</h2>
              </div>
            </div>

            <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
              会议录音机需要访问您的麦克风来录制会议内容
            </p>

            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">macOS 设置路径</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                系统偏好设置 → 隐私与安全性 → 麦克风 → 找到 MeetingRecorder 并勾选
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleOpenMicPermission}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <ExternalLink size={18} />
                打开系统设置
              </button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
              >
                已完成，继续
              </button>
            </div>
          </>
        )}

        {/* Step 2: Model Status */}
        {step === 2 && (
          <>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center">
                <FileText size={24} className="text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">步骤 2/3</p>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {modelLoading ? '正在加载模型...' : '模型状态'}
                </h2>
              </div>
            </div>

            {modelLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-500 dark:text-gray-400">检查模型状态...</p>
              </div>
            ) : modelInfo && modelInfo.status === 'ok' && modelInfo.models.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <CheckCircle size={24} className="text-green-500" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-400">模型已就绪</p>
                    <p className="text-sm text-green-600 dark:text-green-500">
                      {modelInfo.models.length} 个模型 · {formatSize(modelInfo.totalSize)}
                    </p>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                  {modelInfo.models.map((model, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{model.name}</span>
                      <span className="text-gray-500 dark:text-gray-400">{formatSize(model.sizeBytes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <AlertCircle size={24} className="text-yellow-500" />
                <div>
                  <p className="font-medium text-yellow-700 dark:text-yellow-400">模型状态异常</p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-500">未检测到完整模型包，请重新安装当前版本应用</p>
                </div>
              </div>
            )}

            <button
              onClick={() => setStep(3)}
              className="w-full mt-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
            >
              继续
            </button>
          </>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <>
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={40} className="text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                一切就绪！
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                您已准备好开始使用会议录音机
              </p>
            </div>

            <button
              onClick={handleComplete}
              className="w-full py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
            >
              开始使用
            </button>
          </>
        )}

        {/* Progress dots */}
        <div className="flex gap-2 mt-8 justify-center">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-primary-500' : i < step ? 'bg-primary-300' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
