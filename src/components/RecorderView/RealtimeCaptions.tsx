import { useEffect, useRef } from 'react'

interface Caption {
  id: string
  speaker: string
  text: string
  startTime: number
}

interface RealtimeCaptionsProps {
  captions: Caption[]
  audioLevel?: number  // 0.0 ~ 1.0，用于 VAD 状态指示
  isRecording?: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function RealtimeCaptions({ captions, audioLevel = 0, isRecording = false }: RealtimeCaptionsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 新字幕到来时自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [captions.length])

  const isSpeech = audioLevel > 0.08

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* VAD 状态指示器 */}
      <div className="flex items-center gap-2 px-1 mb-2">
        <div
          className={`w-2 h-2 rounded-full transition-colors ${
            isSpeech ? 'bg-red-500 animate-pulse' : isRecording ? 'bg-green-500' : 'bg-gray-400'
          }`}
        />
        <span className="text-xs text-gray-500">
          {isRecording ? (isSpeech ? '🎤 语音检测中...' : '🔇 等待语音...') : '实时字幕'}
        </span>
        {captions.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto">
            {captions.length} 条
          </span>
        )}
      </div>

      {/* 字幕列表 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto max-h-52 space-y-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
      >
        {captions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-gray-400">
            <div className="text-2xl mb-2">🎙️</div>
            <p className="text-sm">
              {isRecording ? '正在监听语音...' : '开始录音后显示实时字幕'}
            </p>
          </div>
        ) : (
          captions.map((caption, i) => {
            const isLatest = i === captions.length - 1
            return (
              <div
                key={caption.id}
                className={`flex gap-3 rounded-lg px-3 py-2 transition-all ${
                  isLatest
                    ? 'bg-blue-50 border border-blue-100 shadow-sm'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {/* 时间戳 */}
                <div className={`flex-shrink-0 text-xs font-mono w-12 pt-0.5 ${isLatest ? 'text-blue-500 font-medium' : 'text-gray-400'}`}>
                  {formatTime(caption.startTime)}
                </div>

                {/* 文本 */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-relaxed ${isLatest ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
                    {caption.text}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
