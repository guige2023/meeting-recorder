export interface AppSettings {
  language?: string
  realtimeCaption?: boolean
  audioQuality?: string
}

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const settings = await window.electronAPI.getSettings()
    if (settings && typeof settings === 'object') {
      return settings as AppSettings
    }
  } catch (error) {
    console.error('Failed to load settings from Electron:', error)
  }

  try {
    const raw = localStorage.getItem('meetingRecorderSettings')
    if (raw) {
      return JSON.parse(raw) as AppSettings
    }
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error)
  }

  return {}
}

export function normalizeLanguage(language?: string): string {
  const value = (language || 'zh').trim().toLowerCase()
  const allowed = new Set(['zh', 'en', 'ja', 'ko', 'yue', 'auto'])
  return allowed.has(value) ? value : 'zh'
}
