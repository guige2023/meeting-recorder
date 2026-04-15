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

interface MeetingState {
  meetings: Meeting[]
  loading: boolean

  fetchMeetings: () => Promise<void>
  deleteMeeting: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  addMeeting: (meeting: Omit<Meeting, 'id'>) => Promise<void>
  updateMeeting: (id: string, updates: Partial<Meeting>) => Promise<void>
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  meetings: [],
  loading: false,

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
    const meeting = get().meetings.find(m => m.id === id)
    if (!meeting) return

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

  addMeeting: async (meeting) => {
    try {
      const result = await window.electronAPI.pythonCall('add_meeting', meeting)
      set(state => ({
        meetings: [{ ...meeting, id: result.id }, ...state.meetings]
      }))
    } catch (err) {
      console.error('Failed to add meeting:', err)
    }
  },

  updateMeeting: async (id, updates) => {
    try {
      await window.electronAPI.pythonCall('update_meeting', { id, ...updates })
      set(state => ({
        meetings: state.meetings.map(m =>
          m.id === id ? { ...m, ...updates } : m
        )
      }))
    } catch (err) {
      console.error('Failed to update meeting:', err)
    }
  }
}))
