// ═══════════════════════════════════════════════════════════════
// Message List — Renders chat messages with live tool status
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, memo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  Copy,
  Check,
  RotateCw,
  Database,
  Server,
  Shield,
  AlertTriangle,
  Hash,
  Fingerprint,
  Search,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { MarkdownRenderer } from './MarkdownRenderer'
import argusIcon from '../assets/argus-icon.svg'
import type { ChatMessage, StreamEvent } from '@argus/shared'

// ─── Types ──────────────────────────────────────────────────

export type LiveAction = {
  tool: string
  status: 'running' | 'done' | 'error'
  provider?: string
  error?: string
}

type MessageListProps = {
  messages: ChatMessage[]
  busy: boolean
  liveActions: LiveAction[]
  statusText: string | null
  streamingContent: string
  onRetry?: (index: number) => void
}

// ─── Helpers ────────────────────────────────────────────────

// Strip <think> tags from AI responses
function stripThinkingTags(content: string): string {
  if (!content) return ''
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '')
  cleaned = cleaned.replace(/^<think>[\s\S]*$/gi, '')
  return cleaned.trim()
}

// Get provider icon
function getProviderIcon(provider: string) {
  const lower = provider.toLowerCase()
  if (lower.includes('shodan')) return Server
  if (lower.includes('dehashed') || lower.includes('breach')) return Shield
  if (lower.includes('threat') || lower.includes('malware')) return AlertTriangle
  if (lower.includes('osint') || lower.includes('social')) return Hash
  if (lower.includes('hudson')) return Fingerprint
  return Database
}

// Pretty-print tool names: "osint_shodan_host_info" → "Shodan Host Info"
function formatToolName(name: string): string {
  return name
    .replace(/^osint_/, '')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ─── Argus Avatar ───────────────────────────────────────────

function ArgusAvatar() {
  return (
    <div className="message-avatar assistant">
      <img src={argusIcon} alt="Argus" style={{ width: 18, height: 18 }} />
    </div>
  )
}

// ─── Component ──────────────────────────────────────────────

export const MessageList = memo<MessageListProps>(({
  messages,
  busy,
  liveActions,
  statusText,
  streamingContent,
  onRetry,
}) => {
  const endRef = useRef<HTMLDivElement>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // Auto-scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy, liveActions, streamingContent])

  const handleCopy = async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    } catch { /* noop */ }
  }

  return (
    <div className="messages-scroll">
      {messages.map((msg, i) => (
        <div key={i} className={`message-wrapper ${msg.role}`}>
          <div className="message-header">
            <div className={`message-avatar ${msg.role}`}>
              {msg.role === 'assistant'
                ? <img src={argusIcon} alt="Argus" style={{ width: 18, height: 18 }} />
                : <User size={14} />
              }
            </div>
            <span className="message-author">
              {msg.role === 'assistant' ? 'Argus' : 'You'}
            </span>
          </div>

          <div className="message-content">
            {msg.role === 'assistant' ? (
              <>
                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="sources-section">
                    <div className="sources-header">
                      <Database size={13} />
                      <span>SOURCES</span>
                    </div>
                    <div className="sources-row">
                      {msg.sources.map((source, idx) => {
                        const Icon = getProviderIcon(source)
                        return (
                          <div key={idx} className="source-chip">
                            <Icon size={12} />
                            <span>{source}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <MarkdownRenderer content={stripThinkingTags(msg.content)} />

                {/* Footer actions */}
                <div className="response-footer">
                  <button
                    className={`footer-action ${copiedIdx === i ? 'copied' : ''}`}
                    onClick={() => handleCopy(stripThinkingTags(msg.content), i)}
                  >
                    {copiedIdx === i ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  {onRetry && (
                    <button
                      className="footer-action"
                      onClick={() => onRetry(i)}
                      disabled={busy}
                    >
                      <RotateCw size={14} />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="user-text">{msg.content}</div>
            )}
          </div>
        </div>
      ))}

      {/* Live Streaming State */}
      {busy && (
        <div className="message-wrapper assistant loading-message fade-in">
          <div className="message-header">
            <ArgusAvatar />
            <span className="message-author">Argus</span>
          </div>
          <div className="message-content">
            {/* Live tool actions */}
            {(liveActions.length > 0 || statusText) && (
              <div className="loading-indicator">
                {/* Status text */}
                {statusText && (
                  <div className="loading-action status-action">
                    <div className="pulse-dot" />
                    <span>{statusText}</span>
                  </div>
                )}

                {/* Real tool calls */}
                <AnimatePresence>
                  {liveActions.map((action, idx) => (
                    <motion.div
                      key={`${action.tool}-${idx}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`loading-action ${action.status === 'error' ? 'action-error' : action.status === 'done' ? 'action-done' : 'action-running'}`}
                    >
                      {action.status === 'running' && <Search size={14} style={{ color: '#60A5FA' }} />}
                      {action.status === 'done' && <CheckCircle2 size={14} style={{ color: '#34D399' }} />}
                      {action.status === 'error' && <XCircle size={14} style={{ color: '#F87171' }} />}
                      <span>{formatToolName(action.tool)}{action.provider && action.status === 'done' ? ` — ${action.provider}` : ''}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Streamed content (typewriter) */}
            {streamingContent && (
              <MarkdownRenderer content={stripThinkingTags(streamingContent)} />
            )}
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  )
})

MessageList.displayName = 'MessageList'
