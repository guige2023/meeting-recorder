import { getAppSettings, normalizeLanguage } from './settings'

export interface StartAudioProcessingResult {
  audioPath: string
  meetingId: string
}

export async function startAudioProcessing(filePath: string, language?: string): Promise<StartAudioProcessingResult> {
  const settings = await getAppSettings()
  const resolvedLanguage = normalizeLanguage(language || settings.language)
  const imported = await window.electronAPI.importAudioFile(filePath)
  const result = await window.electronAPI.pythonCall('process_file', {
    filePath: imported.audioPath,
    language: resolvedLanguage,
  }) as { meetingId?: string; error?: string }

  if (result?.error) {
    throw new Error(result.error)
  }

  if (!result?.meetingId) {
    throw new Error('Failed to start audio processing')
  }

  return {
    audioPath: imported.audioPath,
    meetingId: result.meetingId,
  }
}
