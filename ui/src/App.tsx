// ═══════════════════════════════════════════════════════════════
// Argus App — Root component wiring sidebar, messages, and input
// Uses synchronous /api/chat (Feynman pattern) with client-side
// typewriter effect. SSE streaming is unreliable with Kimi-K2.
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useRef } from 'react'
import { Sidebar, type ActiveView } from './components/Sidebar'
import { MessageList, type LiveAction } from './components/MessageList'
import { InputBar } from './components/InputBar'
import { Settings } from './components/Settings'
import { Sun, Moon } from 'lucide-react'
import * as api from './lib/api'
import type { ChatSession, ChatMessage, ChatResponse } from '@argus/shared'

// ─── Loading action sequences (cosmetic, shown while LLM works) ──
const LOADING_ACTIONS: Array<{ text: string; delay: number }> = [
  { text: 'Initializing investigation...', delay: 0 },
  { text: 'Querying OSINT adapters...', delay: 800 },
  { text: 'Running intelligence lookups...', delay: 1500 },
  { text: 'Aggregating source data...', delay: 2500 },
  { text: 'Analyzing findings...', delay: 3500 },
]

export function App() {
  // ─── State ─────────────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('argus-theme')
    return (saved === 'light' ? 'light' : 'dark')
  })
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeView, setActiveView] = useState<ActiveView>('chat')

  // Streaming / loading state
  const [liveActions, setLiveActions] = useState<LiveAction[]>([])
  const [statusText, setStatusText] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // ─── Busy State (Feynman Pattern) ──────────────────────────
  // busySessionId: which session owns the current in-flight request.
  // busy: derived — true ONLY when viewing the busy session.
  const [pendingBusy, setPendingBusy] = useState(false)
  const [busySessionId, setBusySessionId] = useState<string | null>(null)
  const busy = pendingBusy && activeSessionId === busySessionId

  // ─── Refs ──────────────────────────────────────────────────
  // Ref mirrors of state for use in async callbacks and timers
  // so they always read the *current* value (no stale closures).
  const streamingForRef = useRef<string | null>(null)
  const loadingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const activeSessionIdRef = useRef<string | null>(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const busySessionIdRef = useRef<string | null>(busySessionId)
  busySessionIdRef.current = busySessionId

  // ─── Theme ─────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('argus-theme', theme)
  }, [theme])

  // ─── Load Sessions ─────────────────────────────────────────
  useEffect(() => {
    api.getSessions().then(setSessions).catch(console.error)
  }, [])

  // ─── Load Messages for Active Session ──────────────────────
  useEffect(() => {
    if (activeSessionId) {
      // DON'T reload messages if this session is actively being used
      if (streamingForRef.current === activeSessionId) return
      api.getMessages(activeSessionId).then(setMessages).catch(console.error)
    } else {
      setMessages([])
    }
  }, [activeSessionId])

  // ─── Cleanup loading timers ────────────────────────────────
  const clearLoadingTimers = useCallback(() => {
    loadingTimersRef.current.forEach(clearTimeout)
    loadingTimersRef.current = []
  }, [])

  // ─── Clear ALL visible loading UI ─────────────────────────
  // Call this whenever the user navigates away from the busy session.
  // This is the nuclear option — it guarantees no stale loading UI
  // can appear on a non-busy session regardless of React batching.
  const clearLoadingUI = useCallback(() => {
    clearLoadingTimers()
    setLiveActions([])
    setStatusText(null)
    setStreamingContent('')
  }, [clearLoadingTimers])

  // ─── Start loading animation (session-guarded) ────────────
  // Each timer callback checks whether we're still on the session
  // that started the animation. If the user navigated away, the
  // timer is a no-op — the state updates simply don't fire.
  const startLoadingAnimation = useCallback((forSessionId: string) => {
    clearLoadingTimers()
    setLiveActions([])
    setStatusText(null)

    LOADING_ACTIONS.forEach((action) => {
      const timer = setTimeout(() => {
        // Guard: only update UI if the user is STILL viewing this session
        if (activeSessionIdRef.current !== forSessionId) return
        if (busySessionIdRef.current !== forSessionId) return

        setStatusText(action.text)
        setLiveActions(prev => [...prev, {
          tool: action.text,
          status: 'running' as const,
        }])
      }, action.delay)
      loadingTimersRef.current.push(timer)
    })
  }, [clearLoadingTimers])

  // ─── Stop loading animation ───────────────────────────────
  const stopLoadingAnimation = useCallback(() => {
    clearLoadingUI()
  }, [clearLoadingUI])

  // ─── Typewriter Effect ────────────────────────────────────
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const runTypewriter = useCallback((content: string): Promise<void> => {
    return new Promise((resolve) => {
      if (typewriterRef.current) clearInterval(typewriterRef.current)

      let idx = 0
      const chunkSize = 8
      typewriterRef.current = setInterval(() => {
        if (idx >= content.length) {
          if (typewriterRef.current) clearInterval(typewriterRef.current)
          typewriterRef.current = null
          setStreamingContent('')
          resolve()
          return
        }
        idx = Math.min(idx + chunkSize, content.length)
        setStreamingContent(content.slice(0, idx))
      }, 12)
    })
  }, [])

  // ─── New Session ───────────────────────────────────────────
  const handleNewSession = useCallback(async () => {
    try {
      const session = await api.createSession('New Investigation')
      setSessions(prev => [session, ...prev])
      // Force-clear any visible loading UI before switching
      clearLoadingUI()
      setActiveSessionId(session.id)
      setMessages([])
      setActiveView('chat')
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [clearLoadingUI])

  // ─── Select Session ────────────────────────────────────────
  const handleSelectSession = useCallback((id: string) => {
    // If navigating away from the busy session, clear the messages-
    // loading guard so the useEffect properly reloads from the DB
    // when the user eventually returns to the busy session.
    if (streamingForRef.current && streamingForRef.current !== id) {
      streamingForRef.current = null
    }

    // If switching TO the busy session, restart the loading animation
    // so the user sees progress indicators again. Otherwise, clear
    // any stale loading UI to prevent bleed into non-busy sessions.
    if (busySessionIdRef.current === id && pendingBusy) {
      startLoadingAnimation(id)
    } else {
      clearLoadingUI()
    }

    setActiveSessionId(id)
    setActiveView('chat')
  }, [clearLoadingUI, startLoadingAnimation, pendingBusy])

  // ─── Delete Session ────────────────────────────────────────
  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await api.deleteSession(id)
      setSessions(prev => prev.filter(s => s.id !== id))
      if (activeSessionId === id) {
        setActiveSessionId(null)
        setMessages([])
      }
      if (streamingForRef.current === id) {
        abortRef.current?.abort()
        abortRef.current = null
        streamingForRef.current = null
        setBusySessionId(null)
        setPendingBusy(false)
        stopLoadingAnimation()
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }, [activeSessionId, stopLoadingAnimation])

  // ─── Rename Session ────────────────────────────────────────
  const handleRenameSession = useCallback(async (id: string, title: string) => {
    try {
      await api.updateSessionTitle(id, title)
      setSessions(prev => prev.map(s =>
        s.id === id ? { ...s, title } : s
      ))
    } catch (err) {
      console.error('Failed to rename session:', err)
    }
  }, [])

  // ─── Abort Current Investigation ───────────────────────────
  const handleAbort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (typewriterRef.current) {
      clearInterval(typewriterRef.current)
      typewriterRef.current = null
    }
    streamingForRef.current = null
    setBusySessionId(null)
    setPendingBusy(false)
    stopLoadingAnimation()
  }, [stopLoadingAnimation])

  // ─── Send Message (Sync API + Client Typewriter) ──────────
  const handleSend = useCallback(async (content: string, mode: string, focusMode: string) => {
    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const controller = new AbortController()
    abortRef.current = controller

    // ▶ Show loading IMMEDIATELY (Feynman pattern)
    // Set busySessionId atomically with pendingBusy so we never
    // have a gap where both are null (null===null → busy=true).
    // Use a sentinel for the home-screen case; it gets replaced
    // once the real session is created.
    const initialBusyId = activeSessionId || '__pending__'
    setPendingBusy(true)
    setBusySessionId(initialBusyId)
    startLoadingAnimation(initialBusyId)

    // Resolve session
    let sessionId = activeSessionId
    if (!sessionId) {
      try {
        const title = content.length > 50 ? content.slice(0, 50) + '...' : content
        const session = await api.createSession(title)
        sessionId = session.id
        setSessions(prev => [session, ...prev])
        streamingForRef.current = sessionId
        setBusySessionId(sessionId)
        setActiveSessionId(session.id)
        // Restart loading animation with the real session ID
        startLoadingAnimation(sessionId)
      } catch (err) {
        console.error('Failed to create session:', err)
        setPendingBusy(false)
        setBusySessionId(null)
        stopLoadingAnimation()
        return
      }
    } else if (messages.length === 0) {
      const title = content.length > 50 ? content.slice(0, 50) + '...' : content
      try {
        await api.updateSessionTitle(sessionId, title)
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, title } : s
        ))
      } catch {
        // Non-critical
      }
    }

    // Mark session we're working on
    streamingForRef.current = sessionId
    setBusySessionId(sessionId)

    // Add user message to UI immediately
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMessage])

    // Build message history for context
    const allMessages = [...messages, userMessage].map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      // Use synchronous /api/chat — reliable with Kimi-K2
      const response: ChatResponse = await api.sendChat(allMessages, {
        sessionId: sessionId!,
        researchMode: mode,
        focusMode,
      })

      if (controller.signal.aborted) return

      const assistantContent = response.message?.content || 'Analysis complete.'
      const sources = response.sources || []
      const toolResults = response.toolResults || []

      // ── Session-isolation check ────────────────────────────
      // If the user navigated away while the API was working,
      // don't touch messages (they belong to a different session
      // now). The backend already persisted both the user msg and
      // the assistant msg, so when the user clicks back to this
      // session the useEffect will load everything from the DB.
      const stillViewing = activeSessionIdRef.current === sessionId

      // Stop loading animation
      stopLoadingAnimation()

      if (stillViewing) {
        // Show tool results from the response
        if (toolResults.length > 0) {
          setLiveActions(toolResults.map(tr => ({
            tool: tr.provider || 'unknown',
            status: (tr.error ? 'error' : 'done') as 'running' | 'done' | 'error',
            provider: tr.provider,
            error: tr.error,
          })))
        }

        // Typewriter effect for the content
        await runTypewriter(assistantContent)

        if (controller.signal.aborted) return

        // Finalize: add completed assistant message
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: assistantContent,
          sources: sources.length > 0 ? sources : undefined,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
          researchMode: (response.researchMode || 'standard') as 'standard' | 'deep' | 'duediligence',
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, assistantMessage])
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return

      stopLoadingAnimation()
      // Only show error in UI if user is still viewing this session
      if (activeSessionIdRef.current === sessionId) {
        const errorMsg: ChatMessage = {
          role: 'assistant',
          content: `**Error:** ${err instanceof Error ? err.message : 'An unexpected error occurred.'}\n\nMake sure the Argus server is running at \`http://localhost:3100\` and your LLM provider is configured in \`.env\`.`,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, errorMsg])
      }
    } finally {
      if (!controller.signal.aborted) {
        streamingForRef.current = null
        setBusySessionId(null)
        setPendingBusy(false)
        setLiveActions([])
        setStatusText(null)
        setStreamingContent('')
      }
      abortRef.current = null
    }
  }, [activeSessionId, messages, startLoadingAnimation, stopLoadingAnimation, runTypewriter])

  // ─── Retry ─────────────────────────────────────────────────
  const handleRetry = useCallback(async (messageIndex: number) => {
    const targetMsg = messages[messageIndex]
    if (targetMsg?.role !== 'assistant' || messageIndex < 1) return

    const userMsg = messages[messageIndex - 1]
    if (userMsg?.role !== 'user') return

    setMessages(prev => prev.slice(0, messageIndex))
    handleSend(userMsg.content, 'standard', 'all')
  }, [messages, handleSend])

  // ─── View Change ───────────────────────────────────────────
  const handleViewChange = useCallback((view: ActiveView) => {
    setActiveView(view)
  }, [])

  // Keyboard shortcut: ⌘I for new investigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault()
        handleNewSession()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleNewSession])

  return (
    <div className="argus-container">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        activeView={activeView}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        onViewChange={handleViewChange}
      />

      <main className="argus-main">
        {/* Header */}
        <header className="argus-header">
          <div className="header-actions">
            <button
              className="theme-toggle"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </header>

        {/* View Routing */}
        {activeView === 'settings' ? (
          <Settings />
        ) : (
          <>
            {/* Messages */}
            <div className="content-area">
              {(messages.length > 0 || busy) && (
                <MessageList
                  messages={messages}
                  busy={busy}
                  liveActions={busy ? liveActions : []}
                  statusText={busy ? statusText : null}
                  streamingContent={busy ? streamingContent : ''}
                  onRetry={handleRetry}
                />
              )}
            </div>

            {/* Input */}
            <InputBar
              onSend={handleSend}
              onAbort={handleAbort}
              busy={busy}
              hasMessages={messages.length > 0 || busy}
            />
          </>
        )}
      </main>
    </div>
  )
}
