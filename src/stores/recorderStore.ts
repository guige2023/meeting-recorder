import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

interface Caption {
  id: string
  speaker: string
  text: string
  startTime: number
}

interface RecorderState {
  status: 'idle' | 'recording' | 'paused' | 'processing'
  duration: number
  audioLevel: number
  realtimeCaptions: Caption[]
  speakersCount: number
  recordingId: string | null

  startRecording: () => Promise<void>
  pauseRecording: () => Promise<void>
  resumeRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  updateAudioLevel: (level: number) => void
  addCaption: (caption: Omit<Caption, 'id'>) => void
  setSpeakersCount: (count: number) => void
}

export const useRecorderStore = create<RecorderState>((set, get) => ({
  status: 'idle',
  duration: 0,
  audioLevel: 0,
  realtimeCaptions: [],
  speakersCount: 0,
  recordingId: null,

  startRecording: async () => {
    try {
      const result = await window.electronAPI.pythonCall('capture_start', {
        sampleRate: 16000,
        channels: 1
      })
      set({
        status: 'recording',
        recordingId: result.recordingId,
        duration: 0,
        realtimeCaptions: [],
        speakersCount: 0
      })

      // 开始监听状态更新
      window.electronAPI.onCaptureStatus((data) => {
        if (data.recordingId !== get().recordingId) return
        set({
          duration: data.duration || get().duration + 0.1,
          audioLevel: data.audioLevel || 0,
          speakersCount: data.speakersCount || 0
        })
      })

      window.electronAPI.onRealtimeCaption((data) => {
        if (data.recordingId !== get().recordingId) return
        get().addCaption({
          speaker: data.speaker || '未知',
          text: data.text,
          startTime: data.startTime || 0
        })
      })
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  },

  pauseRecording: async () => {
    try {
      await window.electronAPI.pythonCall('capture_pause', {
        recordingId: get().recordingId
      })
      set({ status: 'paused' })
    } catch (err) {
      console.error('Failed to pause recording:', err)
    }
  },

  resumeRecording: async () => {
    try {
      await window.electronAPI.pythonCall('capture_resume', {
        recordingId: get().recordingId
      })
      set({ status: 'recording' })
    } catch (err) {
      console.error('Failed to resume recording:', err)
    }
  },

  stopRecording: async () => {
    try {
      set({ status: 'processing' })
      const result = await window.electronAPI.pythonCall('capture_stop', {
        recordingId: get().recordingId
      })

      // 自动触发转写（后台进行，不阻塞）
      if (result?.filePath) {
        window.electronAPI.pythonCall('process_file', {
          filePath: result.filePath,
          language: 'zh'
        }).catch(err => console.error('process_file error:', err))
      }

      set({
        status: 'idle',
        recordingId: null
      })
      return result
    } catch (err) {
      console.error('Failed to stop recording:', err)
      set({ status: 'idle' })
    }
  },

  updateAudioLevel: (level) => {
    set({ audioLevel: level })
  },

  addCaption: (caption) => {
    set(state => ({
      realtimeCaptions: [...state.realtimeCaptions, { ...caption, id: uuidv4() }]
    }))
  },

  setSpeakersCount: (count) => {
    set({ speakersCount: count })
  }
}))
