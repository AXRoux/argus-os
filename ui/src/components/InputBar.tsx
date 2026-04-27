// ═══════════════════════════════════════════════════════════════
// Input Bar — Auto-resizing textarea with abort support
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, memo } from 'react'
import {
  ArrowUp,
  Square,
  Globe,
  Search,
} from 'lucide-react'

type InputBarProps = {
  onSend: (message: string, researchMode: string, focusMode: string) => void
  onAbort?: () => void
  busy: boolean
  hasMessages: boolean
}

export const InputBar = memo<InputBarProps>(({ onSend, onAbort, busy, hasMessages }) => {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus when not busy
  useEffect(() => {
    if (!busy) inputRef.current?.focus()
  }, [busy])

  // Keyboard shortcut: ⌘K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSend = () => {
    if (!input.trim()) return

    // If busy, abort current and send new query
    if (busy && onAbort) {
      onAbort()
      // Small delay to let abort propagate, then send
      setTimeout(() => {
        onSend(input.trim(), 'standard', 'all')
        setInput('')
        if (inputRef.current) inputRef.current.style.height = 'auto'
      }, 50)
      return
    }

    onSend(input.trim(), 'standard', 'all')
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  return (
    <div className={`input-area ${hasMessages ? 'bottom' : 'centered'}`}>
      {/* Brand centered when no messages */}
      {!hasMessages && (
        <div className="argus-brand-center">
          <span className="brand-argus">Argus</span>
          <span className="brand-intel">Intelligence</span>
        </div>
      )}

      <div className="input-container">
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Investigate a domain, IP, email, or entity..."
            rows={1}
            className="input-field"
          />

          <div className="input-tools">
            <div className="input-tools-left">
              {/* Standard — static indicator */}
              <div
                className="research-mode-btn"
                style={{ '--mode-color': '#00D4FF', cursor: 'default' } as React.CSSProperties}
              >
                <Search size={14} />
                <span>Standard</span>
              </div>

              {/* All Sources — static indicator */}
              <div className="focus-btn" style={{ cursor: 'default' }}>
                <div className="focus-icon-wrapper">
                  <Globe size={14} />
                </div>
                <span>All Sources</span>
              </div>
            </div>

            {busy ? (
              <button
                className="submit-btn stop-btn"
                onClick={onAbort}
                title="Stop investigation"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className={`submit-btn ${input.trim() ? 'active' : ''}`}
                onClick={handleSend}
                disabled={!input.trim()}
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="footer-text">
        Argus can make mistakes. Verify important findings with primary sources.
      </div>
    </div>
  )
})

InputBar.displayName = 'InputBar'
