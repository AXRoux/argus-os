// ═══════════════════════════════════════════════════════════════
// Argus Settings Panel — Data-driven BYOK adapter management
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  Key,
  ExternalLink,
  Check,
  X,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react'
import type { AdapterMetadata } from '@argus/shared'
import * as api from '../lib/api'

type AdapterWithConfig = AdapterMetadata & { configured: boolean }

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    infrastructure: 'Infrastructure',
    identity: 'Identity',
    extraction: 'Extraction',
    enrichment: 'Enrichment',
    search: 'Search',
  }
  return labels[category] || category
}

function categoryIcon(category: string): string {
  const icons: Record<string, string> = {
    infrastructure: 'INFRA',
    identity: 'ID',
    extraction: 'EXT',
    enrichment: 'ENR',
    search: 'SRCH',
  }
  return icons[category] || 'TOOL'
}

export function Settings() {
  const [adapters, setAdapters] = useState<AdapterWithConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{ adapterId: string; valid: boolean } | null>(null)
  const [showKey, setShowKey] = useState(false)

  // Load adapter data from API
  const loadSettings = useCallback(async () => {
    try {
      const data = await api.getSettings()
      setAdapters(data.adapters)
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Clear validation result after 3s
  useEffect(() => {
    if (validationResult) {
      const timer = setTimeout(() => setValidationResult(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [validationResult])

  const handleSaveKey = async (adapterId: string) => {
    if (!keyInput.trim()) return

    setValidating(true)
    try {
      await api.setApiKey(adapterId, keyInput.trim())
      setValidationResult({ adapterId, valid: true })
      setEditingId(null)
      setKeyInput('')
      setShowKey(false)
      // Reload to get updated status
      await loadSettings()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation failed'
      console.error('Key save failed:', message)
      setValidationResult({ adapterId, valid: false })
    } finally {
      setValidating(false)
    }
  }

  const handleRemoveKey = async (adapterId: string) => {
    try {
      await api.deleteApiKey(adapterId)
      await loadSettings()
    } catch (err) {
      console.error('Failed to remove key:', err)
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setKeyInput('')
    setShowKey(false)
  }

  // Split adapters into BYOK and always-active
  const byokAdapters = adapters.filter(a => a.requiresApiKey)
  const freeAdapters = adapters.filter(a => !a.requiresApiKey)

  if (loading) {
    return (
      <div className="settings-container">
        <div className="settings-loading">
          <Loader2 size={24} className="spin" />
          <span>Loading adapters...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-container">
      <div className="settings-scroll">
        {/* Header */}
        <div className="settings-header">
          <div className="settings-header-icon">
            <Shield size={24} />
          </div>
          <div>
            <h1 className="settings-title">Settings</h1>
            <p className="settings-subtitle">
              Manage API keys for intelligence providers. Keys are encrypted and stored locally.
            </p>
          </div>
        </div>

        {/* BYOK Providers */}
        <div className="settings-section">
          <div className="settings-section-label">
            <Key size={14} />
            <span>BYOK Intelligence Providers</span>
          </div>

          <div className="adapter-cards">
            {byokAdapters.map(adapter => {
              const isEditing = editingId === adapter.id
              const validation = validationResult?.adapterId === adapter.id ? validationResult : null
              const cardClass = `adapter-card ${adapter.configured ? 'configured' : 'unconfigured'} ${validation?.valid === true ? 'valid-pulse' : ''} ${validation?.valid === false ? 'invalid-shake' : ''}`

              return (
                <div key={adapter.id} className={cardClass}>
                  <div className="adapter-header">
                    <div className="adapter-name-row">
                      <span className={`status-dot ${adapter.configured ? 'green' : 'gray'}`} />
                      <span className="adapter-name">{adapter.name}</span>
                    </div>
                    <span className={`adapter-status ${adapter.configured ? 'connected' : 'not-set'}`}>
                      {adapter.configured ? 'Connected' : 'Not Set'}
                    </span>
                  </div>

                  <div className="adapter-meta">
                    <span className="adapter-category">
                      {categoryIcon(adapter.category)} {categoryLabel(adapter.category)}
                    </span>
                    <span className="adapter-entities">
                      {adapter.entityTypes.join(', ')}
                    </span>
                  </div>

                  {adapter.description && (
                    <p className="adapter-description">{adapter.description}</p>
                  )}

                  {/* Key Management */}
                  <div className="adapter-key-section">
                    {isEditing ? (
                      <div className="key-edit-row">
                        <div className="key-input-wrapper">
                          <input
                            className="key-input"
                            type={showKey ? 'text' : 'password'}
                            value={keyInput}
                            onChange={e => setKeyInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveKey(adapter.id)
                              if (e.key === 'Escape') handleCancelEdit()
                            }}
                            placeholder="Paste your API key..."
                            autoFocus
                            spellCheck={false}
                          />
                          <button
                            className="key-visibility-btn"
                            onClick={() => setShowKey(!showKey)}
                            title={showKey ? 'Hide key' : 'Show key'}
                          >
                            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <div className="key-edit-actions">
                          <button
                            className="key-save-btn"
                            onClick={() => handleSaveKey(adapter.id)}
                            disabled={validating || !keyInput.trim()}
                          >
                            {validating ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                            <span>{validating ? 'Validating...' : 'Save'}</span>
                          </button>
                          <button className="key-cancel-btn" onClick={handleCancelEdit}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : adapter.configured ? (
                      <div className="key-configured-row">
                        <span className="key-masked">
                          <Key size={12} />
                          {maskKey('configured-key')}
                        </span>
                        <div className="key-actions">
                          <button
                            className="key-edit-btn"
                            onClick={() => { setEditingId(adapter.id); setKeyInput('') }}
                          >
                            Edit
                          </button>
                          <button
                            className="key-remove-btn"
                            onClick={() => handleRemoveKey(adapter.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="key-unconfigured-row">
                        {adapter.signupUrl && (
                          <a
                            className="signup-link"
                            href={adapter.signupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Get key at {new URL(adapter.signupUrl).hostname}
                            <ExternalLink size={11} />
                          </a>
                        )}
                        <button
                          className="key-add-btn"
                          onClick={() => { setEditingId(adapter.id); setKeyInput('') }}
                        >
                          <Key size={13} />
                          <span>Add Key</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Rate limit and docs */}
                  <div className="adapter-footer">
                    {adapter.rateLimit && (
                      <span className="adapter-rate-limit">{adapter.rateLimit}</span>
                    )}
                    {adapter.docsUrl && (
                      <a
                        className="adapter-docs-link"
                        href={adapter.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Docs <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Always-Active Tools */}
        <div className="settings-section">
          <div className="settings-section-label">
            <Shield size={14} />
            <span>Always-Active Tools</span>
          </div>

          <div className="free-adapters-list">
            {freeAdapters.map(adapter => (
              <div key={adapter.id} className="free-adapter-row">
                <span className="status-dot green" />
                <span className="free-adapter-name">{adapter.name}</span>
                <span className="free-adapter-entities">{adapter.entityTypes.join(', ')}</span>
                <span className="free-adapter-status">Active (no key needed)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
