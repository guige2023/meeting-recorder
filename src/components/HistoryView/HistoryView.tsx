import { useState, useEffect } from 'react'
import { Search, Calendar, Users, Clock, Star, Trash2, Download, MoreVertical } from 'lucide-react'
import { useMeetingStore } from '@/stores/meetingStore'

export default function HistoryView() {
  const { meetings, loading, fetchMeetings, deleteMeeting, toggleFavorite } = useMeetingStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTimeRange, setFilterTimeRange] = useState('all')

  useEffect(() => {
    fetchMeetings()
  }, [])

  const filteredMeetings = meetings.filter(meeting => {
    // 搜索过滤
    if (searchQuery && !meeting.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    // 时间范围过滤
    if (filterTimeRange !== 'all') {
      const now = Date.now()
      const meetingTime = meeting.createdAt
      const dayMs = 24 * 60 * 60 * 1000
      if (filterTimeRange === 'today' && now - meetingTime > dayMs) return false
      if (filterTimeRange === 'week' && now - meetingTime > 7 * dayMs) return false
      if (filterTimeRange === 'month' && now - meetingTime > 30 * dayMs) return false
    }
    return true
  })

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">已完成</span>
      case 'processing':
        return <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">处理中</span>
      case 'failed':
        return <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">失败</span>
      default:
        return <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">待处理</span>
    }
  }

  return (
    <div className="h-full flex flex-col p-6">
      {/* Search and Filter */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="搜索会议内容..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={filterTimeRange}
          onChange={e => setFilterTimeRange(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">全部时间</option>
          <option value="today">今天</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
        </select>
      </div>

      {/* Meeting List */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : filteredMeetings.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {searchQuery ? '没有找到匹配的会议' : '暂无会议记录'}
          </div>
        ) : (
          filteredMeetings.map(meeting => (
            <div
              key={meeting.id}
              className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-medium text-gray-900">{meeting.title}</h3>
                    {getStatusBadge(meeting.status)}
                    {meeting.favorite && <Star size={14} className="text-yellow-500 fill-yellow-500" />}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {formatDate(meeting.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      {formatDuration(meeting.duration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={14} />
                      {meeting.speakerCount}人
                    </span>
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavorite(meeting.id) }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <Star size={18} className={meeting.favorite ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteMeeting(meeting.id) }}
                    className="p-2 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
