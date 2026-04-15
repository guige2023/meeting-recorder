import { useState } from 'react'
import { X, Download } from 'lucide-react'

interface BatchExportModalProps {
  selectedCount: number
  onClose: () => void
  onExport: (formats: string[], includeAudio: boolean) => Promise<void>
}

export default function BatchExportModal({ selectedCount, onClose, onExport }: BatchExportModalProps) {
  const [formats, setFormats] = useState<Set<string>>(new Set(['json']))
  const [includeAudio, setIncludeAudio] = useState(false)
  const [exporting, setExporting] = useState(false)

  const allFormats = ['json', 'txt', 'md', 'srt'] as const

  const handleExport = async () => {
    if (formats.size === 0) return
    setExporting(true)
    try {
      await onExport(Array.from(formats), includeAudio)
      onClose()
    } catch (err) {
      console.error('批量导出失败:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={() => !exporting && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-[420px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">批量导出</h3>
          {!exporting && (
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <X size={18} className="text-gray-500" />
            </button>
          )}
        </div>

        <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          已选择 <span className="font-medium text-primary-500">{selectedCount}</span> 个会议
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">导出格式</label>
          <div className="flex flex-wrap gap-2">
            {allFormats.map(fmt => (
              <label
                key={fmt}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                style={{ background: formats.has(fmt) ? 'rgba(59,130,246,0.08)' : undefined }}
              >
                <input
                  type="checkbox"
                  checked={formats.has(fmt)}
                  onChange={() => {
                    setFormats(prev => {
                      const next = new Set(prev)
                      if (next.has(fmt)) next.delete(fmt)
                      else next.add(fmt)
                      return next
                    })
                  }}
                  className="rounded border-gray-300 text-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-200">.{fmt.toUpperCase()}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={e => setIncludeAudio(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">包含音频文件（.wav）</span>
          </label>
          <p className="mt-1 text-xs text-gray-400 ml-7">音频文件会增加 ZIP 体积</p>
        </div>

        <div className="flex items-center justify-end gap-3">
          {exporting ? (
            <span className="text-sm text-gray-500 dark:text-gray-400">导出中...</span>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleExport}
                disabled={formats.size === 0}
                className="px-5 py-2 text-sm bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Download size={15} />
                开始导出
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
