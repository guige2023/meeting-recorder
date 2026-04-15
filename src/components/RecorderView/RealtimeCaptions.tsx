interface Caption {
  id: string
  speaker: string
  text: string
  startTime: number
}

interface RealtimeCaptionsProps {
  captions: Caption[]
}

export default function RealtimeCaptions({ captions }: RealtimeCaptionsProps) {
  const scrollRef = typeof window !== 'undefined' ? null : null

  return (
    <div className="flex-1 overflow-y-auto max-h-60 space-y-3">
      {captions.length === 0 ? (
        <p className="text-gray-400 text-center py-4">等待语音输入...</p>
      ) : (
        captions.map(caption => (
          <div key={caption.id} className="flex gap-3">
            <div className="flex-shrink-0 w-16 text-xs text-gray-400 font-mono pt-1">
              {Math.floor(caption.startTime / 60)}:{(caption.startTime % 60).toString().padStart(2, '0')}
            </div>
            <div className="flex-1">
              <div className="text-xs text-primary-500 font-medium mb-1">
                {caption.speaker}
              </div>
              <div className="text-gray-700 text-sm leading-relaxed">
                {caption.text}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
