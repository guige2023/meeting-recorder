import { useState, useEffect } from 'react'
import { Mic, Square, Pause, Play, Upload, Volume2, X, FileAudio } from 'lucide-react'
import Waveform from './Waveform'
import RealtimeCaptions from './RealtimeCaptions'
import { useRecorderStore } from '@/stores/recorderStore'
import { useMeetingStore, MeetingDetail } from '@/stores/meetingStore'
import { startAudioProcessing } from '@/lib/audioProcessing'

interface ImportProgress {
  meetingId: string
  fileName: string
  progress: number
  message: string
}

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

  const {
    processingProgress,
    setProcessingProgress,
    clearProcessingProgress,
    getMeetingDetail
  } = useMeetingStore()

  // Import state
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)

  // Subscribe to backend progress updates during import
  useEffect(() => {
    if (!importProgress) return
    const unsubscribe = window.electronAPI.onProcessingProgress((data) => {
      if (data.meetingId === importProgress.meetingId) {
        setImportProgress(prev => prev ? {
          ...prev,
          progress: data.progress,
          message: data.message
        } : null)
      }
    })
    return unsubscribe
  }, [importProgress])
  const [transcriptionResult, setTranscriptionResult] = useState<MeetingDetail | null>(null)
  const [showResult, setShowResult] = useState(false)

  useEffect(() => {
    const currentImport = importProgress
    if (!currentImport) {
      return
    }

    const meetingProgress = processingProgress[currentImport.meetingId]
    if (!meetingProgress || meetingProgress.progress < 1) {
      return
    }

    const timer = window.setTimeout(async () => {
      const detail = await getMeetingDetail(currentImport.meetingId)
      if (detail) {
        setTranscriptionResult(detail)
        setShowResult(true)
      }
      clearProcessingProgress(currentImport.meetingId)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [clearProcessingProgress, getMeetingDetail, importProgress, processingProgress])

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
    if (files.length === 0) return

    const filePath = files[0]
    const fileName = filePath.split(/[/\\]/).pop() || '未知文件'

    try {
      const result = await startAudioProcessing(filePath)
      if (result.meetingId) {
        setProcessingProgress(result.meetingId, 0, '正在导入并转写...')
        setImportProgress({
          meetingId: result.meetingId,
          fileName,
          progress: 0,
          message: '等待处理...'
        })
      }
    } catch (err) {
      console.error('Failed to start processing:', err)
      alert(`导入失败: ${err instanceof Error ? err.message : '无法处理该音频文件'}`)
    }
  }

  const closeResult = () => {
    setShowResult(false)
    setTranscriptionResult(null)
    setImportProgress(null)
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

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getStatusText = () => {
    switch (status) {
      case 'recording': return '正在录音'
      case 'paused': return '已暂停'
      case 'processing': return '处理中...'
      default: return '就绪'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'recording': return 'text-red-500'
      case 'paused': return 'text-yellow-500'
      case 'processing': return 'text-blue-500'
      default: return 'text-gray-400'
    }
  }

  // Show import progress modal
  if (importProgress) {
    const meetingProg = processingProgress[importProgress.meetingId]
    const prog = meetingProg?.progress ?? importProgress.progress
    const msg = meetingProg?.message ?? importProgress.message

    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 w-full max-w-md mx-4">
          <div className="flex items-center gap-3 mb-6">
            <FileAudio size={32} className="text-primary-500" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{importProgress.fileName}</p>
              <p className="text-sm text-gray-500">{msg}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-500"
                style={{ width: `${Math.round(prog * 100)}%` }}
              />
            </div>
            <p className="text-center text-sm text-gray-400 mt-2">
              {Math.round(prog * 100)}%
            </p>
          </div>

          {showResult && transcriptionResult ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">{transcriptionResult.meeting.title}</h3>
              <TranscriptionResultView detail={transcriptionResult} formatTime={formatTimestamp} />
              <button
                onClick={closeResult}
                className="w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm transition-colors"
              >
                关闭
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-gray-400">
              请稍候，AI 正在识别说话人和转写内容...
            </p>
          )}
        </div>
      </div>
    )
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
        <div className="text-3xl font-mono text-gray-700 dark:text-gray-200">
          {formatTime(duration)}
        </div>
      </div>

      {/* Waveform */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 shadow-sm">
        <Waveform />
      </div>

      {/* Audio Level Indicator */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Volume2 size={20} className="text-gray-400" />
          <div className="flex-1">
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
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
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 shadow-sm flex-1 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-700 dark:text-gray-200">实时字幕</h3>
          </div>
          <RealtimeCaptions
            captions={realtimeCaptions}
            audioLevel={audioLevel}
            isRecording={status === 'recording'}
          />
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex items-center justify-center gap-4 mt-auto">
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
    </div>
  )
}

// Transcription result view component
function TranscriptionResultView({ detail, formatTime }: { detail: MeetingDetail; formatTime: (s: number) => string }) {
  const speakerList = Object.values(detail.speakers)

  return (
    <div className="space-y-4">
      {/* Speaker chips */}
      <div className="flex flex-wrap gap-2">
        {speakerList.map(sp => (
          <div
            key={sp.id}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm"
            style={{ backgroundColor: sp.color + '20', color: sp.color }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sp.color }} />
            {sp.name}
          </div>
        ))}
      </div>

      {/* Segments */}
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {detail.segments.map(seg => (
          <div key={seg.id} className="flex gap-3">
            {/* Timestamp */}
            <div className="text-xs text-gray-400 font-mono w-10 flex-shrink-0 pt-0.5">
              {formatTime(seg.startTime)}
            </div>
            {/* Speaker badge */}
            <div
              className="w-1.5 rounded-full flex-shrink-0 mt-1"
              style={{ backgroundColor: seg.speakerColor || '#9ca3af' }}
            />
            {/* Text */}
            <div className="flex-1">
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{seg.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
