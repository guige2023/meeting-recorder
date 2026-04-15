import { useRef, useEffect } from 'react'
import { useRecorderStore } from '@/stores/recorderStore'

const BARS = 64
const HISTORY_SEC = 3  // 3秒历史

export default function Waveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const historyRef = useRef<number[]>(new Array(HISTORY_SEC * 10).fill(0))
  const lastLevelRef = useRef(0)
  const frameCountRef = useRef(0)

  const { audioLevel, status } = useRecorderStore()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const height = rect.height

      ctx.clearRect(0, 0, width, height)

      const barWidth = width / BARS
      const centerY = height / 2
      const isDark = document.documentElement.classList.contains('dark')

      if (status === 'recording') {
        // 将新音量推入历史缓冲区
        historyRef.current.push(audioLevel)
        if (historyRef.current.length > HISTORY_SEC * 10) {
          historyRef.current.shift()
        }

        const history = historyRef.current
        for (let i = 0; i < BARS; i++) {
          const histIdx = Math.floor((i / BARS) * history.length)
          const level = history[Math.min(histIdx, history.length - 1)] || 0

          // EMA 平滑
          const smooth = lastLevelRef.current * 0.3 + level * 0.7
          lastLevelRef.current = smooth

          const maxBarH = height * 0.85
          const barH = Math.max(4, smooth * maxBarH)
          const x = i * barWidth
          const y = centerY - barH / 2

          const gradient = ctx.createLinearGradient(0, y, 0, y + barH)
          // 深色模式下用亮蓝，浅色用标准蓝
          gradient.addColorStop(0, isDark ? '#38bdf8' : '#0ea5e9')
          gradient.addColorStop(1, isDark ? '#0284c7' : '#0369a1')

          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.roundRect(x + 1, y, barWidth - 2, barH, (barWidth - 2) / 2)
          ctx.fill()
        }
      } else if (status === 'paused') {
        const history = historyRef.current
        for (let i = 0; i < BARS; i++) {
          const histIdx = Math.floor((i / BARS) * history.length)
          const level = history[Math.min(histIdx, history.length - 1)] || 0
          const barH = Math.max(4, level * height * 0.85 * 0.4)
          const x = i * barWidth
          const y = centerY - barH / 2
          ctx.fillStyle = isDark ? '#4b5563' : '#9ca3af'
          ctx.beginPath()
          ctx.roundRect(x + 1, y, barWidth - 2, barH, (barWidth - 2) / 2)
          ctx.fill()
        }
      } else {
        // 空闲：呼吸式静态波形（低幅）
        frameCountRef.current += 1
        for (let i = 0; i < BARS; i++) {
          const phase = (i / BARS) * Math.PI * 2
          const t = frameCountRef.current / 30
          const breath = 0.08 + Math.sin(t + phase) * 0.05
          const barH = Math.max(4, breath * height)
          const x = i * barWidth
          const y = centerY - barH / 2
          ctx.fillStyle = isDark ? '#374151' : '#d1d5db'
          ctx.beginPath()
          ctx.roundRect(x + 1, y, barWidth - 2, barH, (barWidth - 2) / 2)
          ctx.fill()
        }
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [audioLevel, status])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-32 rounded-lg"
      style={{ display: 'block' }}
    />
  )
}
