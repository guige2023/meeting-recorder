import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'

interface AudioPlayerProps {
  src: string
  duration: number
  segments: Array<{
    id: string
    startTime: number
    endTime: number
    text: string
    speakerColor: string
  }>
  onSeek?: (time: number) => void
}

export default function AudioPlayer({ src, duration, segments, onSeek }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const progressRef = useRef<HTMLDivElement>(null)

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }, [playing])

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    setCurrentTime(audioRef.current.currentTime)
    onSeek?.(audioRef.current.currentTime)
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const newTime = ratio * duration
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
  }

  const skip = (delta: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + delta))
  }

  const handleRateChange = () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2]
    const idx = rates.indexOf(playbackRate)
    const next = rates[(idx + 1) % rates.length]
    setPlaybackRate(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  // 找到当前时间对应的片段
  const activeSegmentId = segments.find(
    seg => currentTime >= seg.startTime && currentTime <= seg.endTime
  )?.id

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={() => setCurrentTime(0)}
      />

      {/* 时间显示 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
          {formatTime(currentTime)}
        </span>
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
          {formatTime(duration)}
        </span>
      </div>

      {/* 进度条 */}
      <div
        ref={progressRef}
        className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full mb-4 cursor-pointer relative group"
        onClick={handleProgressClick}
      >
        {/* 播放头 */}
        <div
          className="absolute top-0 left-0 h-full bg-primary-500 rounded-full transition-all"
          style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 6px)` }}
        />

        {/* 片段高亮 */}
        {segments.map(seg => (
          <div
            key={seg.id}
            className="absolute top-0 h-full opacity-20 rounded-full"
            style={{
              left: `${(seg.startTime / duration) * 100}%`,
              width: `${((seg.endTime - seg.startTime) / duration) * 100}%`,
              backgroundColor: seg.speakerColor || '#9ca3af'
            }}
          />
        ))}
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => skip(-10)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
          title="后退 10 秒"
        >
          <SkipBack size={18} />
        </button>

        <button
          onClick={togglePlay}
          className="w-10 h-10 flex items-center justify-center bg-primary-500 hover:bg-primary-600 text-white rounded-full transition-colors"
        >
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>

        <button
          onClick={() => skip(10)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
          title="前进 10 秒"
        >
          <SkipForward size={18} />
        </button>

        <div className="flex-1" />

        {/* 播放速率 */}
        <button
          onClick={handleRateChange}
          className="px-3 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
        >
          {playbackRate}x
        </button>

        {/* 音量 */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={volume}
          onChange={e => {
            const v = parseFloat(e.target.value)
            setVolume(v)
            if (audioRef.current) audioRef.current.volume = v
          }}
          className="w-20 accent-primary-500"
          title="音量"
        />
      </div>

      {/* 当前播放片段高亮 */}
      {activeSegmentId && (
        <div className="mt-3 px-3 py-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg border-l-2 border-primary-500">
          <p className="text-sm text-primary-700 dark:text-primary-300">
            {segments.find(s => s.id === activeSegmentId)?.text}
          </p>
        </div>
      )}
    </div>
  )
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}
