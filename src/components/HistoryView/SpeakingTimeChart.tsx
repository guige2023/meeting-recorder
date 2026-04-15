import { Segment, Speaker } from '@/stores/meetingStore'

interface SpeakingTimeChartProps {
  segments: Segment[]
  speakers: Record<string, Speaker>
}

interface SpeakerStats {
  id: string
  name: string
  color: string
  duration: number
  percentage: number
}

export default function SpeakingTimeChart({ segments, speakers }: SpeakingTimeChartProps) {
  // Calculate per-speaker duration
  const stats: Map<string, number> = new Map()
  for (const seg of segments) {
    const spId = seg.speakerId || 'unknown'
    const duration = seg.endTime - seg.startTime
    stats.set(spId, (stats.get(spId) || 0) + duration)
  }

  const total = Array.from(stats.values()).reduce((a, b) => a + b, 0)

  const speakerStats: SpeakerStats[] = Array.from(stats.entries())
    .map(([spId, duration]) => {
      const sp = speakers[spId]
      return {
        id: spId,
        name: sp?.name || '未知',
        color: sp?.color || '#9ca3af',
        duration,
        percentage: total > 0 ? (duration / total) * 100 : 0,
      }
    })
    .sort((a, b) => b.duration - a.duration)

  if (speakerStats.length === 0) return null

  // Build SVG pie
  const size = 140
  const radius = 54
  const cx = size / 2
  const cy = size / 2
  const startAngle = -90 // start from top

  let currentAngle = startAngle
  const slices = speakerStats.map(sp => {
    const angle = (sp.percentage / 100) * 360
    const start = currentAngle
    const end = currentAngle + angle
    currentAngle = end

    const startRad = (start * Math.PI) / 180
    const endRad = (end * Math.PI) / 180

    const x1 = cx + radius * Math.cos(startRad)
    const y1 = cy + radius * Math.sin(startRad)
    const x2 = cx + radius * Math.cos(endRad)
    const y2 = cy + radius * Math.sin(endRad)

    const largeArc = angle > 180 ? 1 : 0

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`

    return { ...sp, d, angle }
  })

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}分${s}秒`
  }

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
      <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeDasharray="4 2" />
        </svg>
        发言时长统计
      </h4>

      <div className="flex items-center gap-4">
        {/* Pie chart */}
        <svg width={size} height={size} className="flex-shrink-0">
          {slices.map((slice, i) => (
            <path
              key={slice.id}
              d={slice.d}
              fill={slice.color}
              opacity={0.85}
              stroke="white"
              strokeWidth={2}
              className="transition-opacity hover:opacity-100"
              style={{ opacity: undefined }}
            />
          ))}
          {/* Center hole (donut) */}
          <circle cx={cx} cy={cy} r={34} fill="white" />
          {/* Center text */}
          <text x={cx} y={cy - 4} textAnchor="middle" className="fill-gray-500" style={{ fontSize: 11 }}>
            {speakerStats.length}人
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" className="fill-gray-400" style={{ fontSize: 9 }}>
            {formatDuration(total)}
          </text>
        </svg>

        {/* Legend */}
        <div className="flex-1 space-y-2">
          {speakerStats.map(sp => (
            <div key={sp.id} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: sp.color }}
              />
              <span className="text-xs text-gray-600 flex-shrink-0 max-w-[80px] truncate">
                {sp.name}
              </span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${sp.percentage}%`, backgroundColor: sp.color }}
                />
              </div>
              <span className="text-xs text-gray-400 font-mono w-12 text-right flex-shrink-0">
                {sp.percentage.toFixed(0)}%
              </span>
              <span className="text-xs text-gray-400 w-14 text-right flex-shrink-0">
                {formatDuration(sp.duration)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
