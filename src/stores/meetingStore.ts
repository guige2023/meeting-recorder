import { create } from 'zustand'

export interface Meeting {
  id: string
  title: string
  createdAt: number
  duration: number
  audioPath: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  favorite: boolean
  tags: string[]
  speakerCount: number
  notes: string
}

export interface Speaker {
  id: string
  label: string
  name: string
  color: string
  total_duration?: number
}

export interface Segment {
  id: string
  speakerId: string
  speakerLabel: string
  speakerName: string
  speakerColor: string
  startTime: number
  endTime: number
  text: string
  confidence: number
}

export interface MeetingDetail {
  meeting: Meeting
  speakers: Record<string, Speaker>
  segments: Segment[]
}

export type DateRange = 'all' | 'today' | 'week' | 'month' | 'custom'

export interface SearchFilters {
  query?: string
  dateRange?: DateRange
  customStart?: number
  customEnd?: number
  favorites?: boolean | null
  speakerCount?: number | null
}

interface MeetingState {
  meetings: Meeting[]
  loading: boolean
  processingProgress: Record<string, { progress: number; message: string }>

  fetchMeetings: () => Promise<void>
  deleteMeeting: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  updateMeeting: (id: string, updates: Partial<Meeting>) => Promise<void>
  getMeetingDetail: (id: string) => Promise<MeetingDetail | null>
  searchMeetings: (filters: SearchFilters) => Promise<Meeting[]>
  setProcessingProgress: (meetingId: string, progress: number, message: string) => void
  clearProcessingProgress: (meetingId: string) => void
  updateSpeaker: (speakerId: string, updates: Partial<Speaker>) => Promise<void>
  clearCache: () => Promise<{ cleared: number }>
  clearData: () => Promise<void>
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  meetings: [],
  loading: false,
  processingProgress: {},

  fetchMeetings: async () => {
    set({ loading: true })
    try {
      const result = await window.electronAPI.pythonCall('get_meetings', {})
      set({ meetings: result.meetings || [], loading: false })
    } catch (err) {
      console.error('Failed to fetch meetings:', err)
      set({ loading: false })
    }
  },

  deleteMeeting: async (id) => {
    try {
      await window.electronAPI.pythonCall('delete_meeting', { id })
      set(state => ({
        meetings: state.meetings.filter(m => m.id !== id)
      }))
    } catch (err) {
      console.error('Failed to delete meeting:', err)
    }
  },

  toggleFavorite: async (id) => {
    try {
      await window.electronAPI.pythonCall('toggle_favorite', { id })
      set(state => ({
        meetings: state.meetings.map(m =>
          m.id === id ? { ...m, favorite: !m.favorite } : m
        )
      }))
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  },

  updateMeeting: async (id, updates) => {
    try {
      await window.electronAPI.pythonCall('update_meeting', { id, updates })
      set(state => ({
        meetings: state.meetings.map(m =>
          m.id === id ? { ...m, ...updates } : m
        )
      }))
    } catch (err) {
      console.error('Failed to update meeting:', err)
    }
  },

  getMeetingDetail: async (id) => {
    try {
      const result = await window.electronAPI.pythonCall('get_meeting_detail', { id })
      if (!result) return null
      return {
        meeting: result.meeting,
        speakers: result.speakers,
        segments: result.segments.map((s: any) => ({
          id: s.id,
          speakerId: s.speaker_id,
          speakerLabel: s.speaker_label,
          speakerName: s.speaker_name,
          speakerColor: s.speaker_color,
          startTime: s.start_time,
          endTime: s.end_time,
          text: s.text,
          confidence: s.confidence
        }))
      }
    } catch (err) {
      console.error('Failed to get meeting detail:', err)
      return null
    }
  },

  searchMeetings: async (filters) => {
    try {
      return await window.electronAPI.pythonCall('search_meetings', filters as Record<string, unknown>)
    } catch (err) {
      console.error('Failed to search meetings:', err)
      return []
    }
  },

  setProcessingProgress: (meetingId, progress, message) => {
    set(state => ({
      processingProgress: {
        ...state.processingProgress,
        [meetingId]: { progress, message }
      }
    }))
  },

  clearProcessingProgress: (meetingId) => {
    set(state => {
      const next = { ...state.processingProgress }
      delete next[meetingId]
      return { processingProgress: next }
    })
  },

  updateSpeaker: async (speakerId, updates) => {
    try {
      await window.electronAPI.pythonCall('update_meeting', {
        id: null,
        updates: { speakerUpdates: { [speakerId]: updates } }
      })
    } catch (err) {
      console.error('Failed to update speaker:', err)
    }
  },

  clearCache: async () => {
    const result = await window.electronAPI.pythonCall('clear_cache', {})
    return result || { cleared: 0 }
  },

  clearData: async () => {
    await window.electronAPI.pythonCall('clear_data', {})
    set({ meetings: [] })
  }
}))
