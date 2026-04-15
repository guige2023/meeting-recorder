import { useRef, useState, useEffect, useCallback } from 'react'
import { Play, Pause, Volume2, VolumeX } from 'lucide-react'

interface AudioPlayerProps {
  audioPath: string
  duration: number
  onTimeUpdate?: (currentTime: number) => void
  onPlayStateChange?: (isPlaying: boolean) => void
  startTime?: number
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export default function AudioPlayer({
  audioPath,
  duration,
  onTimeUpdate,
  onPlayStateChange,
  startTime,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string>('')
  const [isLoaded, setIsLoaded] = useState(false)

  // Load audio URL
  useEffect(() => {
    if (!audioPath) return
    window.electronAPI.getAudioUrl(audioPath).then(url => {
      setAudioUrl(url)
      setIsLoaded(true)
    })
  }, [audioPath])

  // Seek when startTime changes
  useEffect(() => {
    if (startTime !== undefined && audioRef.current && isLoaded) {
      audioRef.current.currentTime = startTime
      setCurrentTime(startTime)
    }
  }, [startTime, isLoaded])

  // Sync playback state
  useEffect(() => {
    onPlayStateChange?.(isPlaying)
  }, [isPlaying, onPlayStateChange])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(console.error)
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime)
    onTimeUpdate?.(audio.currentTime)
  }, [onTimeUpdate])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
    setCurrentTime(time)
  }, [])

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackRate(speed)
    if (audioRef.current) {
      audioRef.current.playbackRate = speed
    }
  }, [])

  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
    }
    setIsMuted(!isMuted)
  }, [isMuted])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-14 bg-gray-50 rounded-lg text-sm text-gray-400">
        加载音频中...
      </div>
    )
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      {/* Hidden native audio element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          if (audioRef.current && startTime !== undefined) {
            audioRef.current.currentTime = startTime
          }
        }}
      />

      {/* Controls row */}
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white rounded-full transition-colors"
        >
          {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" className="ml-0.5" />}
        </button>

        {/* Time display */}
        <div className="text-xs text-gray-500 font-mono w-14 flex-shrink-0">
          {formatTime(currentTime)}
        </div>

        {/* Progress bar */}
        <div className="flex-1 relative group">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
            style={{ top: 0, height: '100%' }}
          />
        </div>

        {/* Duration */}
        <div className="text-xs text-gray-400 font-mono w-14 flex-shrink-0 text-right">
          {formatTime(duration)}
        </div>

        {/* Speed selector */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {SPEEDS.map(speed => (
            <button
              key={speed}
              onClick={() => handleSpeedChange(speed)}
              className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                playbackRate === speed
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:bg-gray-200'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        {/* Mute */}
        <button
          onClick={toggleMute}
          className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </div>

      {/* Playback rate active indicator */}
      {playbackRate !== 1 && (
        <div className="mt-2 text-center">
          <span className="text-xs text-primary-600 font-medium">
            当前速度: {playbackRate}x
          </span>
        </div>
      )}
    </div>
  )
}
