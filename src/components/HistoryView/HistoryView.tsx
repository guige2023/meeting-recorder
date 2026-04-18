import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Calendar, Users, Clock, Star, Trash2, FileAudio, X, ChevronRight, Copy, Filter, Tag, Edit3, Check, AudioLines, Mic, BarChart2, Upload, Loader2 } from 'lucide-react'
import { useMeetingStore, MeetingDetail, SearchFilters, DateRange, DurationRange, Segment } from '@/stores/meetingStore'
import AudioPlayer from './AudioPlayer'
import BatchExportModal from './BatchExportModal'

export default function HistoryView() {
  const {
    meetings,
    loading,
    processingProgress,
    fetchMeetings,
    deleteMeeting,
    toggleFavorite,
    updateMeeting,
    getMeetingDetail,
    searchMeetings,
    setProcessingProgress,
    clearProcessingProgress
  } = useMeetingStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [filterTimeRange, setFilterTimeRange] = useState<DateRange>('all')
  const [filterFavorites, setFilterFavorites] = useState<boolean | null>(null)
  const [filterSpeakerCount, setFilterSpeakerCount] = useState<number | null>(null)
  const [filterDurationRange, setFilterDurationRange] = useState<DurationRange>('all')
  const [filterMonth, setFilterMonth] = useState<string>('all') // 'YYYY-MM' or 'all'
  const [filterCustomStart, setFilterCustomStart] = useState<string>('')
  const [filterCustomEnd, setFilterCustomEnd] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MeetingDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [displayMeetings, setDisplayMeetings] = useState(meetings)
  const [searchHighlight, setSearchHighlight] = useState<string>('')
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set())
  const [batchModalOpen, setBatchModalOpen] = useState(false)

  // 录音导入状态
  const [isDragging, setIsDragging] = useState(false)
  const [importingFile, setImportingFile] = useState<string | null>(null)
  const dragCounterRef = useRef(0)

  useEffect(() => { fetchMeetings() }, [])

  // 计算可用月份列表（从所有 meetings 提取， newest first）
  const availableMonths = [...new Set(
    meetings.map(m => {
      const d = new Date(m.createdAt)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  )].sort().reverse()

  // 按月份预过滤（月份筛选独立于全文搜索，月份内再做关键词过滤）
  const monthMeetings = filterMonth === 'all'
    ? meetings
    : meetings.filter(m => {
      const d = new Date(m.createdAt)
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return mKey === filterMonth
    })

  const buildFilters = useCallback((): SearchFilters => {
    const filters: SearchFilters = {
      query: searchQuery.trim() || undefined,
      dateRange: filterTimeRange,
      favorites: filterFavorites,
      speakerCount: filterSpeakerCount,
      durationRange: filterDurationRange,
    }
    if (filterTimeRange === 'custom' && filterCustomStart) {
      filters.customStart = new Date(filterCustomStart).setHours(0, 0, 0, 0)
    }
    if (filterTimeRange === 'custom' && filterCustomEnd) {
      filters.customEnd = new Date(filterCustomEnd).setHours(23, 59, 59, 999)
    }
    return filters
  }, [searchQuery, filterTimeRange, filterFavorites, filterSpeakerCount, filterDurationRange, filterCustomStart, filterCustomEnd])

  useEffect(() => {
    if (!searchQuery && filterTimeRange === 'all' && filterFavorites === null && filterSpeakerCount === null && filterDurationRange === 'all') {
      setDisplayMeetings(monthMeetings)
    }
  }, [meetings, searchQuery, filterTimeRange, filterFavorites, filterSpeakerCount, filterMonth])

  useEffect(() => {
    const timer = setTimeout(async () => {
      const filters = buildFilters()
      const hasFilters = !!(filters.query || filters.dateRange !== 'all' || filters.favorites !== null || filters.speakerCount !== null || filters.durationRange !== 'all')
      if (hasFilters) {
        setSearchHighlight(searchQuery.trim())
        const results = await searchMeetings(filters)
        // 进一步按月份过滤（月份筛选独立于后端全文搜索）
        const monthFiltered = filterMonth === 'all'
          ? results
          : results.filter((m) => {
            const d = new Date(m.createdAt)
            const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            return mKey === filterMonth
          })
        setDisplayMeetings(monthFiltered)
      } else {
        setSearchHighlight('')
        await fetchMeetings()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, filterTimeRange, filterFavorites, filterSpeakerCount, filterDurationRange, filterCustomStart, filterCustomEnd, filterMonth])

  const handleMeetingClick = async (id: string) => {
    if (id === selectedId) { setSelectedId(null); setDetail(null); return }
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
      if (prog) return <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-full">{prog.message} {Math.round(prog.progress * 100)}%</span>
      return <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 rounded-full">处理中</span>
    }
    switch (status) {
      case 'completed': return <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 rounded-full">已完成</span>
      case 'failed': return <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded-full">失败</span>
      default: return <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 rounded-full">待处理</span>
    }
  }

  const copyToClipboard = (text: string, segId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(segId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  // 录音导入处理
  const handleImportFile = async (filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath
    setImportingFile(fileName)
    try {
      // 1. 复制文件到 app data 目录
      const importResult = await window.electronAPI.importAudioFile(filePath)
      if (!importResult || !importResult.audioPath) {
        console.error('Import failed: no audioPath returned')
        return
      }

      // 2. 调用 process_file 开始转写（后台进行）
      const processResult = await window.electronAPI.pythonCall('process_file', {
        filePath: importResult.audioPath,
        language: 'zh'
      }) as { meetingId?: string; status?: string }

      if (processResult && processResult.meetingId) {
        // 刷新列表
        await fetchMeetings()
        // 设置处理进度
        setProcessingProgress(processResult.meetingId, 0, '正在导入并转写...')
      }
    } catch (err) {
      console.error('Import failed:', err)
    } finally {
      setImportingFile(null)
    }
  }

  const handleFileSelect = async () => {
    const files = await window.electronAPI.selectFile()
    if (files && files.length > 0) {
      handleImportFile(files[0])
    }
  }

  // 拖拽处理
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    dragCounterRef.current = 0
    const files = Array.from(e.dataTransfer.files)
    const audioFile = files.find(f => /\.(wav|mp3|m4a|flac|ogg|opus|aac|wma)$/i.test(f.name))
    if (audioFile) {
      // @ts-ignore — path 在 Electron 文件对象上可用
      handleImportFile(audioFile.path)
    }
  }

  // 高亮搜索关键词
  const highlightText = (text: string, query: string) => {
    if (!query) return text
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{part}</mark>
        : part
    )
  }

  const segmentsBySpeaker = detail ? groupSegmentsBySpeaker(detail.segments) : {}

  // --- Duration statistics from meetings data ---
  const totalCount = meetings.length
  const totalDuration = meetings.reduce((sum, m) => sum + (m.duration || 0), 0)
  const avgDuration = totalCount > 0 ? totalDuration / totalCount : 0
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthCount = meetings.filter(m => {
    const d = new Date(m.createdAt)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === thisMonth
  }).length
  const monthDuration = meetings
    .filter(m => {
      const d = new Date(m.createdAt)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === thisMonth
    })
    .reduce((sum, m) => sum + (m.duration || 0), 0)

  // 格式化为：X小时Y分钟（总有时长用）
  const fmtHours = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}小时${m > 0 ? `${m}分钟` : ''}`
    return `${m}分钟`
  }
  // 格式化为：X分钟（平均时长用）
  const fmtMins = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}秒`
    return `${Math.round(seconds / 60)}分钟`
  }

  const statCards = [
    { icon: <Mic size={18} />, label: '本月录音', value: `${monthCount} 次`, bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-300' },
    { icon: <Clock size={18} />, label: '总时长', value: fmtHours(totalDuration), bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-600 dark:text-purple-300' },
    { icon: <BarChart2 size={18} />, label: '平均时长', value: fmtMins(avgDuration), bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-600 dark:text-green-300' },
  ]

  return (
    <div className="h-full flex flex-col p-6">
      {/* Duration stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {statCards.map(card => (
          <div key={card.label} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${card.bg}`}>
            <div className={`flex-shrink-0 ${card.text}`}>{card.icon}</div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{card.label}</div>
              <div className={`font-semibold text-sm ${card.text}`}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
          <input
            type="text"
            placeholder="搜索会议内容..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>
        <select value={filterTimeRange} onChange={e => setFilterTimeRange(e.target.value as DateRange)}
          className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
          <option value="all">全部时间</option>
          <option value="today">今天</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
          <option value="custom">自定义</option>
        </select>
        {filterTimeRange === 'custom' && (
          <div className="flex items-center gap-1">
            <input type="date" value={filterCustomStart} onChange={e => setFilterCustomStart(e.target.value)}
              className="px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
            <span className="text-gray-400">—</span>
            <input type="date" value={filterCustomEnd} onChange={e => setFilterCustomEnd(e.target.value)}
              className="px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
          </div>
        )}
        <select value={filterSpeakerCount ?? ''} onChange={e => setFilterSpeakerCount(e.target.value ? Number(e.target.value) : null)}
          className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
          <option value="">所有人数</option>
          <option value="1">1人+</option>
          <option value="2">2人+</option>
          <option value="3">3人+</option>
          <option value="4">4人+</option>
        </select>
        <select value={filterDurationRange} onChange={e => setFilterDurationRange(e.target.value as DurationRange)}
          className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
          <option value="all">全部时长</option>
          <option value="under10">10分钟以下</option>
          <option value="10to30">10-30分钟</option>
          <option value="over30">30分钟以上</option>
        </select>
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {([[null, '全部'], [true, '已收藏'], [false, '未收藏']] as const).map(([val, label]) => (
            <button key={String(val)} onClick={() => setFilterFavorites(val)}
              className={`px-3 py-2.5 text-sm transition-colors ${filterFavorites === val ? 'bg-gray-800 dark:bg-gray-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              {label === '已收藏' ? <Star size={14} className={`inline mr-1 ${filterFavorites === true ? 'fill-yellow-400 text-yellow-400' : ''}`} /> : null}
              {label}
            </button>
          ))}
        </div>
        {(searchQuery || filterTimeRange !== 'all' || filterFavorites !== null || filterSpeakerCount !== null || filterDurationRange !== 'all' || filterMonth !== 'all') && (
          <button onClick={() => { setSearchQuery(''); setFilterTimeRange('all'); setFilterFavorites(null); setFilterSpeakerCount(null); setFilterDurationRange('all'); setFilterCustomStart(''); setFilterCustomEnd(''); setFilterMonth('all') }}
            className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1">
            <X size={14} /> 清除筛选
          </button>
        )}
      </div>

      {/* Month tab bar — like a file manager */}
      {availableMonths.length > 0 && (
        <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setFilterMonth('all')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterMonth === 'all'
                ? 'bg-primary-500 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            全部
          </button>
          {availableMonths.map(month => {
            const [year, monthNum] = month.split('-')
            const label = `${year}年${parseInt(monthNum)}月`
            const count = meetings.filter(m => {
              const d = new Date(m.createdAt)
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === month
            }).length
            return (
              <button
                key={month}
                onClick={() => setFilterMonth(month)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  filterMonth === month
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {label}
                <span className={`text-xs px-1 rounded-full ${
                  filterMonth === month
                    ? 'bg-primary-400/40 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Batch export toolbar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filterMonth !== 'all' ? (
            <>
              {filterMonth.split('-')[0]}年{parseInt(filterMonth.split('-')[1])}月 · {displayMeetings.length} 个会议
            </>
          ) : (
            <>{displayMeetings.length} 个会议</>
          )}
        </span>
        <div className="flex items-center gap-2">
          {displayMeetings.length > 0 && (
            <>
              <button
                onClick={() => {
                  if (batchSelectedIds.size === displayMeetings.length) {
                    setBatchSelectedIds(new Set())
                  } else {
                    setBatchSelectedIds(new Set(displayMeetings.map((m: any) => m.id)))
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <span className="text-xs">☐</span> 全选
              </button>
              {batchSelectedIds.size > 0 && (
                <button
                  onClick={() => setBatchModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white dark:bg-primary-600 dark:hover:bg-primary-700 rounded-lg transition-colors"
                >
                  ↓ 批量导出 ({batchSelectedIds.size})
                </button>
              )}
              <button
                onClick={handleFileSelect}
                disabled={!!importingFile}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 text-white dark:bg-green-600 dark:hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                title="导入本地录音文件（.wav / .mp3 / .m4a）"
              >
                {importingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {importingFile ? `导入中: ${importingFile.slice(0, 20)}...` : '导入录音'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Meeting List + Drag-Drop Zone */}
      <div
        className={`flex-1 overflow-y-auto space-y-3 relative ${isDragging ? 'ring-2 ring-dashed ring-primary-400 dark:ring-primary-600 rounded-xl' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-primary-50/80 dark:bg-primary-900/30 rounded-xl pointer-events-none">
            <Upload size={48} className="text-primary-500 mb-3" />
            <p className="text-primary-600 dark:text-primary-300 font-medium">松开以导入录音</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">支持 .wav / .mp3 / .m4a</p>
          </div>
        )}
        {loading ? <div className="text-center py-12 text-gray-400">加载中...</div>
         : displayMeetings.length === 0 ? <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            {searchQuery || filterFavorites !== null || filterSpeakerCount !== null || filterDurationRange !== 'all' || filterTimeRange !== 'all' ? '没有找到匹配的会议' : '暂无会议记录'}
           </div>
         : displayMeetings.map(meeting => (
            <div key={meeting.id}>
              <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${selectedId === meeting.id ? 'ring-2 ring-primary-300 dark:ring-primary-700' : ''}`}
                onClick={() => handleMeetingClick(meeting.id)}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={batchSelectedIds.has(meeting.id)}
                    onChange={e => {
                      e.stopPropagation()
                      setBatchSelectedIds(prev => {
                        const next = new Set(prev)
                        if (next.has(meeting.id)) next.delete(meeting.id)
                        else next.add(meeting.id)
                        return next
                      })
                    }}
                    onClick={e => e.stopPropagation()}
                    className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-500 cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-medium text-gray-900 dark:text-white">{highlightText(meeting.title, searchHighlight)}</h3>
                      {getStatusBadge(meeting.status, meeting.id)}
                      {meeting.favorite && <Star size={14} className="text-yellow-500 fill-yellow-500" />}
                      <ChevronRight size={16} className={`text-gray-400 dark:text-gray-500 transition-transform ml-auto ${selectedId === meeting.id ? 'rotate-90' : ''}`} />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1"><Calendar size={14} />{formatDate(meeting.createdAt)}</span>
                      {meeting.duration > 0 && <span className="flex items-center gap-1"><Clock size={14} />{formatDuration(meeting.duration)}</span>}
                      {meeting.speakerCount > 0 && <span className="flex items-center gap-1"><Users size={14} />{meeting.speakerCount}人</span>}
                    </div>
                    {meeting.tags?.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {meeting.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded flex items-center gap-1">
                            <Tag size={10} />{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleFavorite(meeting.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                      <Star size={18} className={meeting.favorite ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400 dark:text-gray-500'} />
                    </button>
                    <button onClick={() => deleteMeeting(meeting.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-400 hover:text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {selectedId === meeting.id && (
                <div className="bg-white dark:bg-gray-800 rounded-xl mt-2 p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
                  {loadingDetail ? <div className="text-center py-8 text-gray-400 dark:text-gray-500">加载转写内容...</div>
                   : detail ? <MeetingDetailView detail={detail} segmentsBySpeaker={segmentsBySpeaker}
                        formatTime={formatTime} copyToClipboard={copyToClipboard} copiedId={copiedId}
                        searchHighlight={searchHighlight} formatDuration={formatDuration} />
                   : <div className="text-center py-8 text-gray-400">{meeting.status === 'processing' ? 'AI 正在处理中，请稍候...' : '暂无转写内容'} dark:text-gray-500</div>}
                </div>
              )}
            </div>
          ))}
      </div>

      {batchModalOpen && (
        <BatchExportModal
          selectedCount={batchSelectedIds.size}
          onClose={() => setBatchModalOpen(false)}
          onExport={async (formats, includeAudio) => {
            const result = await window.electronAPI.pythonCall('batch_export_meetings', {
              ids: Array.from(batchSelectedIds),
              formats,
              include_audio: includeAudio,
            })
            if (result.zipPath) {
              await window.electronAPI.showItemInFolder(result.zipPath)
            }
            setBatchSelectedIds(new Set())
          }}
        />
      )}
    </div>
  )
}

function groupSegmentsBySpeaker(segments: Segment[]) {
  const groups: Record<string, Segment[]> = {}
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
  copiedId,
  searchHighlight,
  formatDuration
}: {
  detail: MeetingDetail
  segmentsBySpeaker: Record<string, Segment[]>
  formatTime: (s: number) => string
  copyToClipboard: (text: string, segId: string) => void
  copiedId: string | null
  searchHighlight: string
  formatDuration: (s: number) => string
}) {
  const speakerList = Object.values(detail.speakers)
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(detail.meeting.title)
  const [addingTag, setAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null)
  const [speakerNameValue, setSpeakerNameValue] = useState('')
  const [showAudioPlayer, setShowAudioPlayer] = useState(false)
  const { updateMeeting, updateSpeaker } = useMeetingStore()

  if (detail.segments.length === 0) return <div className="text-center py-8 text-gray-400 dark:text-gray-500">暂无转写内容</div>

  const displaySegments = activeSpeaker ? segmentsBySpeaker[activeSpeaker] || [] : detail.segments

  // 发言时长统计
  const totalDuration = Object.values(detail.speakers).reduce((sum, sp) => sum + (sp.total_duration || 0), 0)

  const highlightText = (text: string, query: string) => {
    if (!query) return text
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">{part}</mark>
        : part
    )
  }

  const handleSaveTitle = async () => {
    await updateMeeting(detail.meeting.id, { title: titleValue })
    detail.meeting.title = titleValue
    setEditingTitle(false)
  }

  const handleAddTag = async () => {
    const tags = [...(detail.meeting.tags || []), tagInput.trim()]
    await updateMeeting(detail.meeting.id, { tags })
    detail.meeting.tags = tags
    setTagInput('')
    setAddingTag(false)
  }

  const handleRemoveTag = async (tag: string) => {
    const tags = (detail.meeting.tags || []).filter(t => t !== tag)
    await updateMeeting(detail.meeting.id, { tags })
    detail.meeting.tags = tags
  }

  const handleSaveSpeakerName = async () => {
    if (!editingSpeakerId) return
    await updateSpeaker(editingSpeakerId, { name: speakerNameValue })
    if (detail.speakers[editingSpeakerId]) {
      detail.speakers[editingSpeakerId].name = speakerNameValue
    }
    setEditingSpeakerId(null)
  }

  // 构建 audio URL
  const audioSrc = detail.meeting.audioPath
    ? (detail.meeting.audioPath.startsWith('file://') ? detail.meeting.audioPath : `file://${detail.meeting.audioPath}`)
    : null

  return (
    <div>
      {/* 标题编辑 */}
      <div className="flex items-center gap-2 mb-4">
        {editingTitle ? (
          <div className="flex items-center gap-2 flex-1">
            <input value={titleValue} onChange={e => setTitleValue(e.target.value)}
              className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-lg font-medium bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveTitle()} />
            <button onClick={handleSaveTitle} className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600"><Check size={16} /></button>
            <button onClick={() => setEditingTitle(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X size={16} /></button>
          </div>
        ) : (
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex-1">{detail.meeting.title}</h3>
        )}
        {!editingTitle && (
          <button onClick={() => { setTitleValue(detail.meeting.title); setEditingTitle(true) }}
            className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="编辑标题">
            <Edit3 size={16} />
          </button>
        )}
      </div>

      {/* 标签 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(detail.meeting.tags || []).map(tag => (
          <span key={tag} className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded flex items-center gap-1">
            <Tag size={10} />{tag}
            <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500 ml-1">✕</button>
          </span>
        ))}
        {addingTag ? (
          <div className="flex items-center gap-1">
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              placeholder="标签名"
              className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none"
              autoFocus onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); if (e.key === 'Escape') setAddingTag(false) }} />
            <button onClick={handleAddTag} className="p-1 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"><Check size={14} /></button>
            <button onClick={() => setAddingTag(false)} className="p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => setAddingTag(true)} className="px-2 py-1 text-xs border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded flex items-center gap-1">
            <Tag size={10} /> 添加标签
          </button>
        )}
      </div>

      {/* 音频播放器 */}
      {audioSrc && (
        <div className="mb-4">
          <button onClick={() => setShowAudioPlayer(v => !v)}
            className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 mb-2">
            <AudioLines size={16} /> {showAudioPlayer ? '隐藏' : '显示'} 音频播放器
          </button>
          {showAudioPlayer && (
            <AudioPlayer src={audioSrc} duration={detail.meeting.duration || 0}
              segments={detail.segments.map(s => ({ id: s.id, startTime: s.startTime, endTime: s.endTime, text: s.text, speakerColor: s.speakerColor }))} />
          )}
        </div>
      )}

      {/* 发言时长统计 */}
      {totalDuration > 0 && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">发言时长统计</p>
          <div className="space-y-1.5">
            {speakerList.map(sp => {
              const dur = sp.total_duration || 0
              const pct = totalDuration > 0 ? (dur / totalDuration) * 100 : 0
              return (
                <div key={sp.id} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sp.color }} />
                  {editingSpeakerId === sp.id ? (
                    <div className="flex items-center gap-1 flex-1">
                      <input value={speakerNameValue} onChange={e => setSpeakerNameValue(e.target.value)}
                        className="flex-1 px-2 py-0.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveSpeakerName() }} />
                      <button onClick={handleSaveSpeakerName} className="text-green-500"><Check size={12} /></button>
                      <button onClick={() => setEditingSpeakerId(null)} className="text-gray-400 dark:text-gray-500"><X size={12} /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 cursor-pointer hover:text-primary-600"
                        onClick={() => { setSpeakerNameValue(sp.name || sp.label); setEditingSpeakerId(sp.id) }}>
                        {sp.name || sp.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: sp.color }} />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono w-12 text-right">{formatDuration(dur)}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 w-10">{pct.toFixed(0)}%</span>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 说话人筛选 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setActiveSpeaker(null)}
          className={`px-3 py-1 rounded-full text-sm transition-colors ${!activeSpeaker ? 'bg-gray-800 dark:bg-gray-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
          全部
        </button>
        {speakerList.map(sp => (
          <button key={sp.id} onClick={() => setActiveSpeaker(sp.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm transition-colors ${activeSpeaker === sp.id ? 'text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
            style={activeSpeaker === sp.id ? { backgroundColor: sp.color } : {}}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sp.color }} />
            {sp.name || sp.label}
          </button>
        ))}
      </div>

      {/* 转写内容 */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {displaySegments.map(seg => (
          <div key={seg.id} className="flex gap-3 group">
            <div className="text-xs text-gray-400 dark:text-gray-500 font-mono w-10 flex-shrink-0 pt-0.5">
              {formatTime(seg.startTime)}
            </div>
            <div className="w-1.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: seg.speakerColor || '#9ca3af' }} />
            <div className="flex-1 relative">
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed pr-8">
                {highlightText(seg.text, searchHighlight)}
              </p>
              <button onClick={() => copyToClipboard(seg.text, seg.id)}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 transition-opacity"
                title="复制">
                {copiedId === seg.id ? <span className="text-xs text-green-500">已复制</span> : <Copy size={12} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 导出操作 */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        <button onClick={() => exportAsTxt(detail)} className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors">导出 TXT</button>
        <button onClick={() => exportAsMarkdown(detail)} className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors">导出 Markdown</button>
        <button onClick={() => exportAsJson(detail)} className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors">导出 JSON</button>
        <button onClick={() => exportAsSrt(detail)} className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors">导出 SRT</button>
      </div>
    </div>
  )
}

function exportAsTxt(detail: MeetingDetail) {
  const lines: string[] = [detail.meeting.title, '='.repeat(40), '']
  const speakerMap: Record<string, string> = {}
  for (const sp of Object.values(detail.speakers)) speakerMap[sp.id] = sp.name
  for (const seg of detail.segments) {
    const speaker = speakerMap[seg.speakerId] || '未知'
    lines.push(`[${formatTime2(seg.startTime)}] ${speaker}: ${seg.text}`)
  }
  downloadFile(detail.meeting.title + '.txt', lines.join('\n'), 'text/plain')
}

function exportAsMarkdown(detail: MeetingDetail) {
  const lines: string[] = [`# ${detail.meeting.title}`, '']
  const speakerMap: Record<string, string> = {}
  for (const sp of Object.values(detail.speakers)) speakerMap[sp.id] = sp.name
  let currentSpeaker = ''
  for (const seg of detail.segments) {
    const speaker = speakerMap[seg.speakerId] || '未知'
    if (speaker !== currentSpeaker) { lines.push(''); lines.push(`## ${speaker}`); lines.push(''); currentSpeaker = speaker }
    lines.push(`> [${formatTime2(seg.startTime)}] ${seg.text}`)
  }
  downloadFile(detail.meeting.title + '.md', lines.join('\n'), 'text/markdown')
}

function exportAsJson(detail: MeetingDetail) {
  // 构建完整结构化数据
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    meeting: {
      id: detail.meeting.id,
      title: detail.meeting.title,
      // SQLite stores seconds, JS Date expects milliseconds
      createdAt: new Date(detail.meeting.createdAt * 1000).toISOString(),
      duration: detail.meeting.duration,
      audioPath: detail.meeting.audioPath,
      status: detail.meeting.status,
      favorite: detail.meeting.favorite,
      tags: detail.meeting.tags,
      speakerCount: detail.meeting.speakerCount,
      notes: detail.meeting.notes,
    },
    speakers: Object.values(detail.speakers).map(sp => ({
      id: sp.id,
      label: sp.label,
      name: sp.name,
      color: sp.color,
      totalDuration: sp.total_duration,
    })),
    segments: detail.segments.map(seg => ({
      id: seg.id,
      speakerId: seg.speakerId,
      speakerLabel: seg.speakerLabel,
      speakerName: seg.speakerName,
      speakerColor: seg.speakerColor,
      startTime: seg.startTime,
      endTime: seg.endTime,
      text: seg.text,
      confidence: seg.confidence,
      duration: seg.endTime - seg.startTime,
    })),
    statistics: {
      totalSegments: detail.segments.length,
      totalSpeakers: Object.keys(detail.speakers).length,
      totalDuration: detail.meeting.duration,
      speakerDurations: Object.values(detail.speakers).reduce((acc, sp) => {
        acc[sp.name] = sp.total_duration || 0
        return acc
      }, {} as Record<string, number>),
    },
  }
  downloadFile(
    detail.meeting.title + '.json',
    JSON.stringify(exportData, null, 2),
    'application/json'
  )
}

function exportAsSrt(detail: MeetingDetail) {
  // SRT 格式: index\nHH:MM:SS,mmm --> HH:MM:SS,mmm\ntext\n\n
  const srtTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 1000)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
  }

  const speakerMap: Record<string, string> = {}
  for (const sp of Object.values(detail.speakers)) speakerMap[sp.id] = sp.name

  const lines: string[] = []
  detail.segments.forEach((seg, i) => {
    const speaker = speakerMap[seg.speakerId] || '未知'
    const index = i + 1
    const start = srtTime(seg.startTime)
    const end = srtTime(seg.endTime)
    lines.push(`${index}`)
    lines.push(`${start} --> ${end}`)
    lines.push(`[${speaker}] ${seg.text}`)
    lines.push('')
  })

  downloadFile(detail.meeting.title + '.srt', lines.join('\n'), 'text/plain')
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
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
