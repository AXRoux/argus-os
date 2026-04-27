// ═══════════════════════════════════════════════════════════════
// Argus Sidebar — Icon rail + expandable session list
// ═══════════════════════════════════════════════════════════════

import { useState, memo } from 'react'
import {
  Home,
  Plus,
  MessageSquare,
  Edit2,
  Trash2,
  Pin,
  Settings,
} from 'lucide-react'
import argusIcon from '../assets/argus-icon.svg'
import type { ChatSession } from '@argus/shared'

export type ActiveView = 'chat' | 'settings'

type SidebarProps = {
  sessions: ChatSession[]
  activeSessionId: string | null
  activeView: ActiveView
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  onViewChange: (view: ActiveView) => void
}

export const Sidebar = memo<SidebarProps>(({
  sessions,
  activeSessionId,
  activeView,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onViewChange,
}) => {
  const [expanded, setExpanded] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const handleStartEdit = (session: ChatSession) => {
    setEditingId(session.id)
    setEditTitle(session.title)
  }

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      onRenameSession(id, editTitle.trim())
    }
    setEditingId(null)
  }

  const handleHomeClick = () => {
    onViewChange('chat')
    setExpanded(!expanded)
  }

  return (
    <aside className={`sidebar ${expanded ? 'expanded' : ''}`}>
      {/* Icon Rail */}
      <div className="icon-rail">
        <div className="brand-icon">
          <img src={argusIcon} alt="Argus" style={{ width: 24, height: 24 }} />
        </div>

        <div className="nav-icons">
          <button
            className={`nav-icon ${activeView === 'chat' ? 'active' : ''}`}
            onClick={handleHomeClick}
            title="Investigations"
          >
            <Home size={22} strokeWidth={1.5} />
            <span>Home</span>
          </button>
        </div>

        {/* Bottom icons */}
        <div className="nav-icons-bottom">
          <button
            className={`nav-icon ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => onViewChange('settings')}
            title="Settings"
          >
            <Settings size={22} strokeWidth={1.5} />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Expandable Panel */}
      <div className="expand-panel">
        <div className="panel-header">
          <span className="panel-title">Investigations</span>
          <button className="pin-btn" title="Pin sidebar">
            <Pin size={14} />
          </button>
        </div>

        <div className="panel-content">
          <button className="new-query-btn" onClick={onNewSession}>
            <Plus size={16} />
            <span>New Investigation</span>
            <span className="shortcut">⌘I</span>
          </button>

          <div className="section-label">Recent</div>
          <div className="sessions-list">
            {sessions.slice(0, 20).map(session => (
              <div
                key={session.id}
                className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                onClick={() => { onSelectSession(session.id); onViewChange('chat') }}
              >
                <MessageSquare size={14} className="session-icon" />
                {editingId === session.id ? (
                  <input
                    className="session-edit-input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(session.id)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => handleSaveEdit(session.id)}
                    autoFocus
                  />
                ) : (
                  <span className="session-title">{session.title}</span>
                )}
                <div className="session-actions">
                  <button onClick={(e) => { e.stopPropagation(); handleStartEdit(session) }}>
                    <Edit2 size={12} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id) }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}

            {sessions.length === 0 && (
              <div style={{ padding: '16px 10px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                No investigations yet. Start one above.
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
})

Sidebar.displayName = 'Sidebar'
