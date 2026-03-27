import { useState, useRef, useEffect } from 'react'
import { cn } from '@lib/utils'

// Curated emoji set for agent icons — grouped by theme
const emojiGroups: { label: string; emojis: string[] }[] = [
  {
    label: 'Roles',
    emojis: ['🤖', '🧠', '👨‍💻', '👩‍💻', '🦊', '🐙', '🦾', '⚡', '🔧', '🎯']
  },
  {
    label: 'Nature',
    emojis: ['🌊', '🔥', '🌿', '❄️', '🌙', '☀️', '⭐', '🌈', '💎', '🪨']
  },
  {
    label: 'Objects',
    emojis: ['🚀', '📡', '🛡️', '⚙️', '🔬', '📊', '💡', '🎨', '📝', '🗂️']
  }
]

interface EmojiPickerProps {
  value: string | null
  onChange: (emoji: string | null) => void
  onClose: () => void
  anchorRef?: React.RefObject<HTMLElement | null>
}

export function EmojiPicker({ value, onChange, onClose, anchorRef }: EmojiPickerProps): JSX.Element {
  const [custom, setCustom] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const handleCustomSubmit = (): void => {
    if (custom.trim()) {
      onChange(custom.trim())
      setCustom('')
    }
  }

  return (
    <div
      ref={panelRef}
      className="absolute z-50 bg-card border border-border rounded-lg shadow-xl p-2 w-[220px]"
      style={{ top: '100%', left: 0 }}
    >
      {emojiGroups.map((group) => (
        <div key={group.label} className="mb-1.5">
          <div className="text-[9px] text-muted-foreground font-medium px-1 mb-0.5 uppercase tracking-wider">
            {group.label}
          </div>
          <div className="flex flex-wrap gap-0.5">
            {group.emojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onChange(emoji)}
                className={cn(
                  'w-7 h-7 rounded flex items-center justify-center text-sm hover:bg-accent transition-colors',
                  value === emoji && 'bg-primary/20 ring-1 ring-primary'
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Custom emoji input */}
      <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="✏️ Custom..."
          className="flex-1 text-xs bg-secondary rounded px-1.5 py-1 border-none outline-none"
          onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
        />
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-[9px] text-muted-foreground hover:text-foreground px-1"
            title="Reset to initials"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
