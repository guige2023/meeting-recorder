import { useRef, useEffect } from 'react'
import { useRecorderStore } from '@/stores/recorderStore'

export default function Waveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
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

      // 绘制波形
      const bars = 60
      const barWidth = (width - bars * 2) / bars
      const centerY = height / 2

      for (let i = 0; i < bars; i++) {
        // 生成随机但稳定的高度，基于 audioLevel
        const baseHeight = audioLevel * height * 0.8 * (0.3 + Math.random() * 0.7)
        const barHeight = Math.max(4, baseHeight)

        const x = i * (barWidth + 2)
        const y = centerY - barHeight / 2

        // 渐变色
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight)
        if (status === 'recording') {
          gradient.addColorStop(0, '#0ea5e9')
          gradient.addColorStop(1, '#0369a1')
        } else {
          gradient.addColorStop(0, '#d1d5db')
          gradient.addColorStop(1, '#9ca3af')
        }

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2)
        ctx.fill()
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
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
