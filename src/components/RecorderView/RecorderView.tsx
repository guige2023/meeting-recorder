import { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, Square, Pause, Play, Loader2, Upload, Volume2 } from 'lucide-react'
import Waveform from './Waveform'
import RealtimeCaptions from './RealtimeCaptions'
import { useRecorderStore } from '@/stores/recorderStore'

type RecordingStatus = 'idle' | 'recording' | 'paused'

export default function RecorderView() {
  const {
    status,
    duration,
    realtimeCaptions,
    speakersCount,
    audioLevel,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording
  } = useRecorderStore()

  const [showImport, setShowImport] = useState(false)

  const handleStart = async () => {
    await startRecording()
  }

  const handlePause = () => {
    pauseRecording()
  }

  const handleResume = () => {
    resumeRecording()
  }

  const handleStop = async () => {
    await stopRecording()
  }

  const handleImport = async () => {
    const files = await window.electronAPI.selectFile()
    if (files.length > 0) {
      // TODO: 调用 Python 处理导入的文件
      console.log('Selected files:', files)
    }
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const getStatusText = () => {
    switch (status) {
      case 'recording':
        return '正在录音'
      case 'paused':
        return '已暂停'
      default:
        return '就绪'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'recording':
        return 'text-red-500'
      case 'paused':
        return 'text-yellow-500'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      {/* Recording Status */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 ${getStatusColor()}`}>
            {status === 'recording' && (
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
            <span className="text-lg font-medium">{getStatusText()}</span>
          </div>
          {speakersCount > 0 && (
            <div className="text-sm text-gray-500">
              检测到 {speakersCount} 位说话人
            </div>
          )}
        </div>
        <div className="text-3xl font-mono text-gray-700">
          {formatTime(duration)}
        </div>
      </div>

      {/* Waveform */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
        <Waveform />
      </div>

      {/* Audio Level Indicator */}
      <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Volume2 size={20} className="text-gray-400" />
          <div className="flex-1">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-100"
                style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
              />
            </div>
          </div>
          <span className="text-sm text-gray-400 w-12">
            {Math.round(audioLevel * 100)}%
          </span>
        </div>
      </div>

      {/* Realtime Captions */}
      {status === 'recording' && (
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm flex-1 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-700">实时字幕</h3>
          </div>
          <RealtimeCaptions captions={realtimeCaptions} />
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-4">
        {status === 'idle' && (
          <>
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-full font-medium text-lg transition-colors shadow-lg"
            >
              <Mic size={24} />
              开始录音
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-2 px-6 py-4 bg-white hover:bg-gray-50 text-gray-700 rounded-full font-medium border border-gray-200 transition-colors"
            >
              <Upload size={20} />
              导入音频
            </button>
          </>
        )}

        {status === 'recording' && (
          <>
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-6 py-4 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full font-medium transition-colors shadow-lg"
            >
              <Pause size={20} />
              暂停
            </button>
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-6 py-4 bg-gray-800 hover:bg-gray-900 text-white rounded-full font-medium transition-colors shadow-lg"
            >
              <Square size={20} />
              停止
            </button>
          </>
        )}

        {status === 'paused' && (
          <>
            <button
              onClick={handleResume}
              className="flex items-center gap-2 px-6 py-4 bg-green-500 hover:bg-green-600 text-white rounded-full font-medium transition-colors shadow-lg"
            >
              <Play size={20} />
              继续
            </button>
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-6 py-4 bg-gray-800 hover:bg-gray-900 text-white rounded-full font-medium transition-colors shadow-lg"
            >
              <Square size={20} />
              停止
            </button>
          </>
        )}
      </div>

      {/* Loading State */}
      {status === 'processing' && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 size={48} className="text-primary-500 animate-spin mb-4" />
          <p className="text-gray-600">处理中，请稍候...</p>
        </div>
      )}
    </div>
  )
}
