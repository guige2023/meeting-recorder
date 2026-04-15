import { useState, useEffect, useCallback } from 'react'
import { Search, Calendar, Users, Clock, Star, Trash2, FileAudio, X, ChevronRight, Copy, Filter } from 'lucide-react'
import { useMeetingStore, MeetingDetail, SearchFilters, DateRange } from '@/stores/meetingStore'

export default function HistoryView() {
  const {
    meetings,
    loading,
    processingProgress,
    fetchMeetings,
    deleteMeeting,
    toggleFavorite,
    getMeetingDetail,
    searchMeetings
  } = useMeetingStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [filterTimeRange, setFilterTimeRange] = useState<DateRange>('all')
  const [filterFavorites, setFilterFavorites] = useState<boolean | null>(null)
  const [filterSpeakerCount, setFilterSpeakerCount] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [displayMeetings, setDisplayMeetings] = useState(meetings)

  useEffect(() => {
    fetchMeetings()
  }, [])

  // Build filters object
  const buildFilters = useCallback((): SearchFilters => ({
    query: searchQuery.trim() || undefined,
    dateRange: filterTimeRange,
    favorites: filterFavorites,
    speakerCount: filterSpeakerCount,
  }), [searchQuery, filterTimeRange, filterFavorites, filterSpeakerCount])

  // Sync store meetings -> displayMeetings when fetchMeetings completes (filter cleared)
  useEffect(() => {
    if (!searchQuery && filterTimeRange === 'all' && filterFavorites === null && filterSpeakerCount === null) {
      setDisplayMeetings(meetings)
    }
  }, [meetings, searchQuery, filterTimeRange, filterFavorites, filterSpeakerCount])

  // Debounced search: call backend FTS5 when filters active, else fetch all
  useEffect(() => {
    const timer = setTimeout(async () => {
      const filters = buildFilters()
      const hasFilters = !!(filters.query || filters.dateRange !== 'all' || filters.favorites !== null || filters.speakerCount !== null)
      if (hasFilters) {
        const results = await searchMeetings(filters)
        setDisplayMeetings(results)
      } else {
        await fetchMeetings()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, filterTimeRange, filterFavorites, filterSpeakerCount])

  const handleMeetingClick = async (id: string) => {
    if (id === selectedId) {
      setSelectedId(null)
      setDetail(null)
      return
    }
    setSelectedId(id)
    setLoadingDetail(true)
    const d = await getMeetingDetail(id)
    setDetail(d)
    setLoadingDetail(false)
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}小时${m}分钟`
    if (m > 0) return `${m}分钟${s}秒`
    return `${s}秒`
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - timestamp
    const dayMs = 24 * 60 * 60 * 1000
    if (diff < dayMs) return '今天'
    if (diff < 2 * dayMs) return '昨天'
    if (diff < 7 * dayMs) return `${Math.floor(diff / dayMs)}天前`
    return date.toLocaleDateString('zh-CN')
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const getStatusBadge = (status: string, meetingId: string) => {
    if (status === 'processing') {
      const prog = processingProgress[meetingId]
      if (prog) {
        return (
          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
            {prog.message} {Math.round(prog.progress * 100)}%
          </span>
        )
      }
      return <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">处理中</span>
    }
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">已完成</span>
      case 'failed':
        return <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">失败</span>
      default:
        return <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">待处理</span>
    }
  }

  const copyToClipboard = (text: string, segId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(segId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  // Group segments by speaker
  const segmentsBySpeaker = detail ? groupSegmentsBySpeaker(detail.segments) : {}

  return (
    <div className="h-full flex flex-col p-6">
      {/* Search and Filter */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Search input */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="搜索会议内容...（FTS5全文搜索）"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Date range */}
        <select
          value={filterTimeRange}
          onChange={e => setFilterTimeRange(e.target.value as DateRange)}
          className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">全部时间</option>
          <option value="today">今天</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
        </select>

        {/* Speaker count */}
        <select
          value={filterSpeakerCount ?? ''}
          onChange={e => setFilterSpeakerCount(e.target.value ? Number(e.target.value) : null)}
          className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">所有人数</option>
          <option value="1">1人+</option>
          <option value="2">2人+</option>
          <option value="3">3人+</option>
          <option value="4">4人+</option>
          <option value="5">5人+</option>
        </select>

        {/* Favorites filter */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setFilterFavorites(null)}
            className={`px-3 py-2.5 text-sm transition-colors ${filterFavorites === null ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            全部
          </button>
          <button
            onClick={() => setFilterFavorites(true)}
            className={`px-3 py-2.5 text-sm transition-colors flex items-center gap-1 ${filterFavorites === true ? 'bg-yellow-50 text-yellow-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            <Star size={14} className={filterFavorites === true ? 'fill-yellow-400 text-yellow-400' : ''} />
            已收藏
          </button>
          <button
            onClick={() => setFilterFavorites(false)}
            className={`px-3 py-2.5 text-sm transition-colors ${filterFavorites === false ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            未收藏
          </button>
        </div>

        {/* Clear all filters */}
        {(searchQuery || filterTimeRange !== 'all' || filterFavorites !== null || filterSpeakerCount !== null) && (
          <button
            onClick={() => {
              setSearchQuery('')
              setFilterTimeRange('all')
              setFilterFavorites(null)
              setFilterSpeakerCount(null)
            }}
            className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
          >
            <X size={14} />
            清除筛选
          </button>
        )}
      </div>

      {/* Meeting List */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : displayMeetings.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {searchQuery || filterFavorites !== null || filterSpeakerCount !== null || filterTimeRange !== 'all' ? '没有找到匹配的会议' : '暂无会议记录'}
          </div>
        ) : (
          displayMeetings.map(meeting => (
            <div key={meeting.id}>
              <div
                className={`bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${selectedId === meeting.id ? 'ring-2 ring-primary-300' : ''}`}
                onClick={() => handleMeetingClick(meeting.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-gray-900">{meeting.title}</h3>
                      {getStatusBadge(meeting.status, meeting.id)}
                      {meeting.favorite && <Star size={14} className="text-yellow-500 fill-yellow-500" />}
                      <ChevronRight
                        size={16}
                        className={`text-gray-400 transition-transform ml-auto ${selectedId === meeting.id ? 'rotate-90' : ''}`}
                      />
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {formatDate(meeting.createdAt)}
                      </span>
                      {meeting.duration > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {formatDuration(meeting.duration)}
                        </span>
                      )}
                      {meeting.speakerCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Users size={14} />
                          {meeting.speakerCount}人
                        </span>
                      )}
                    </div>

                    {meeting.tags && meeting.tags.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {meeting.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => toggleFavorite(meeting.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <Star size={18} className={meeting.favorite ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'} />
                    </button>
                    <button
                      onClick={() => deleteMeeting(meeting.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded detail view */}
              {selectedId === meeting.id && (
                <div className="bg-white rounded-xl mt-2 p-4 border border-gray-100 shadow-sm">
                  {loadingDetail ? (
                    <div className="text-center py-8 text-gray-400">加载转写内容...</div>
                  ) : detail ? (
                    <MeetingDetailView
                      detail={detail}
                      segmentsBySpeaker={segmentsBySpeaker}
                      formatTime={formatTime}
                      copyToClipboard={copyToClipboard}
                      copiedId={copiedId}
                    />
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      {meeting.status === 'processing' ? 'AI 正在处理中，请稍候...' : '暂无转写内容'}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function groupSegmentsBySpeaker(segments: MeetingDetail['segments']) {
  const groups: Record<string, MeetingDetail['segments']> = {}
  for (const seg of segments) {
    const key = seg.speakerId || 'unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(seg)
  }
  return groups
}

function MeetingDetailView({
  detail,
  segmentsBySpeaker,
  formatTime,
  copyToClipboard,
  copiedId
}: {
  detail: MeetingDetail
  segmentsBySpeaker: Record<string, MeetingDetail['segments']>
  formatTime: (s: number) => string
  copyToClipboard: (text: string, segId: string) => void
  copiedId: string | null
}) {
  const speakerList = Object.values(detail.speakers)
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)

  if (detail.segments.length === 0) {
    return <div className="text-center py-8 text-gray-400">暂无转写内容</div>
  }

  const displaySegments = activeSpeaker
    ? segmentsBySpeaker[activeSpeaker] || []
    : detail.segments

  return (
    <div>
      {/* Speaker filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setActiveSpeaker(null)}
          className={`px-3 py-1 rounded-full text-sm transition-colors ${!activeSpeaker ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          全部
        </button>
        {speakerList.map(sp => (
          <button
            key={sp.id}
            onClick={() => setActiveSpeaker(sp.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm transition-colors ${activeSpeaker === sp.id ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            style={activeSpeaker === sp.id ? { backgroundColor: sp.color, color: '#fff' } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sp.color }} />
            {sp.name}
          </button>
        ))}
      </div>

      {/* Transcript */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {displaySegments.map(seg => (
          <div key={seg.id} className="flex gap-3 group">
            {/* Timestamp */}
            <div className="text-xs text-gray-400 font-mono w-10 flex-shrink-0 pt-0.5">
              {formatTime(seg.startTime)}
            </div>
            {/* Speaker color bar */}
            <div
              className="w-1.5 rounded-full flex-shrink-0 mt-1"
              style={{ backgroundColor: seg.speakerColor || '#9ca3af' }}
            />
            {/* Text + copy */}
            <div className="flex-1 relative">
              <p className="text-sm text-gray-800 leading-relaxed pr-8">{seg.text}</p>
              <button
                onClick={() => copyToClipboard(seg.text, seg.id)}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded text-gray-400 transition-opacity"
                title="复制"
              >
                {copiedId === seg.id ? (
                  <span className="text-xs text-green-500">已复制</span>
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Export actions */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
        <button
          onClick={() => exportAsTxt(detail)}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
        >
          导出 TXT
        </button>
        <button
          onClick={() => exportAsMarkdown(detail)}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
        >
          导出 Markdown
        </button>
      </div>
    </div>
  )
}

function exportAsTxt(detail: MeetingDetail) {
  const lines: string[] = [
    detail.meeting.title,
    '='.repeat(40),
    '',
  ]
  const speakerMap: Record<string, string> = {}
  for (const sp of Object.values(detail.speakers)) {
    speakerMap[sp.id] = sp.name
  }
  for (const seg of detail.segments) {
    const speaker = speakerMap[seg.speakerId] || '未知'
    lines.push(`[${formatTime2(seg.startTime)}] ${speaker}: ${seg.text}`)
  }
  downloadFile(detail.meeting.title + '.txt', lines.join('\n'), 'text/plain')
}

function exportAsMarkdown(detail: MeetingDetail) {
  const lines: string[] = [
    `# ${detail.meeting.title}`,
    '',
  ]
  const speakerMap: Record<string, string> = {}
  for (const sp of Object.values(detail.speakers)) {
    speakerMap[sp.id] = sp.name
  }
  let currentSpeaker = ''
  for (const seg of detail.segments) {
    const speaker = speakerMap[seg.speakerId] || '未知'
    if (speaker !== currentSpeaker) {
      lines.push('')
      lines.push(`## ${speaker}`)
      lines.push('')
      currentSpeaker = speaker
    }
    lines.push(`> [${formatTime2(seg.startTime)}] ${seg.text}`)
  }
  downloadFile(detail.meeting.title + '.md', lines.join('\n'), 'text/markdown')
}

function formatTime2(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
