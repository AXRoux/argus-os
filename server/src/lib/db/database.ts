// ═══════════════════════════════════════════════════════════════
// Argus SQLite Database — Session & Message persistence
// ═══════════════════════════════════════════════════════════════

import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { ChatSession, ChatMessage, ApiKeyConfig } from '@argus/shared'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let db: Database.Database

export function initDatabase(): void {
  const dbPath = path.resolve(__dirname, '../../..', 'argus.db')
  db = new Database(dbPath)

  // Enable WAL mode for better concurrent reads
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_message_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_results TEXT,
      advisory TEXT,
      sources TEXT,
      images TEXT,
      research_mode TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS api_keys (
      adapter_id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_validated TEXT,
      is_valid INTEGER DEFAULT 1
    );
  `)

  console.log(`[db] Database: ${dbPath}`)
}

// ─── Sessions ────────────────────────────────────────────────

export function createSession(title: string): ChatSession {
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run(id, title, now, now)

  return { id, title, createdAt: now, updatedAt: now }
}

export function getSessions(): ChatSession[] {
  const rows = db.prepare(`SELECT id, title, created_at, updated_at, last_message_at FROM sessions ORDER BY updated_at DESC`).all() as Array<{
    id: string; title: string; created_at: string; updated_at: string; last_message_at: string | null
  }>

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastMessageAt: r.last_message_at || undefined,
  }))
}

export function updateSessionTitle(id: string, title: string): void {
  db.prepare(`UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(title, id)
}

export function deleteSession(id: string): void {
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
}

// ─── Messages ────────────────────────────────────────────────

export function addMessage(sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, tool_results, advisory, sources, images, research_mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    message.role,
    message.content,
    message.toolResults ? JSON.stringify(message.toolResults) : null,
    message.advisory ? JSON.stringify(message.advisory) : null,
    message.sources ? JSON.stringify(message.sources) : null,
    message.images ? JSON.stringify(message.images) : null,
    message.researchMode || null,
    now,
  )

  // Update session timestamps
  db.prepare(`UPDATE sessions SET updated_at = ?, last_message_at = ? WHERE id = ?`)
    .run(now, now, sessionId)

  return {
    id,
    ...message,
    timestamp: now,
  }
}

export function getMessages(sessionId: string): ChatMessage[] {
  const rows = db.prepare(`
    SELECT id, role, content, tool_results, advisory, sources, images, research_mode, created_at
    FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as Array<{
    id: string; role: string; content: string; tool_results: string | null; advisory: string | null
    sources: string | null; images: string | null; research_mode: string | null; created_at: string
  }>

  return rows.map(r => ({
    id: r.id,
    role: r.role as ChatMessage['role'],
    content: r.content,
    toolResults: r.tool_results ? JSON.parse(r.tool_results) : undefined,
    advisory: r.advisory ? JSON.parse(r.advisory) : undefined,
    sources: r.sources ? JSON.parse(r.sources) : undefined,
    images: r.images ? JSON.parse(r.images) : undefined,
    researchMode: r.research_mode as ChatMessage['researchMode'],
    timestamp: r.created_at,
  }))
}

// ─── API Keys (BYOK) ────────────────────────────────────────

export function getApiKey(adapterId: string): string | null {
  const row = db.prepare('SELECT api_key FROM api_keys WHERE adapter_id = ? AND is_valid = 1').get(adapterId) as { api_key: string } | undefined
  return row?.api_key ?? null
}

export function setApiKey(adapterId: string, apiKey: string): void {
  db.prepare(`
    INSERT INTO api_keys (adapter_id, api_key, added_at, is_valid)
    VALUES (?, ?, datetime('now'), 1)
    ON CONFLICT(adapter_id) DO UPDATE SET api_key = excluded.api_key, added_at = datetime('now'), is_valid = 1
  `).run(adapterId, apiKey)
}

export function deleteApiKey(adapterId: string): void {
  db.prepare('DELETE FROM api_keys WHERE adapter_id = ?').run(adapterId)
}

export function markKeyValidated(adapterId: string, isValid: boolean): void {
  db.prepare('UPDATE api_keys SET last_validated = datetime(\'now\'), is_valid = ? WHERE adapter_id = ?').run(isValid ? 1 : 0, adapterId)
}

export function getAllApiKeys(): ApiKeyConfig[] {
  const rows = db.prepare('SELECT adapter_id, api_key, added_at, last_validated, is_valid FROM api_keys').all() as Array<{
    adapter_id: string; api_key: string; added_at: string; last_validated: string | null; is_valid: number
  }>

  return rows.map(r => ({
    adapterId: r.adapter_id,
    apiKey: r.api_key,
    addedAt: r.added_at,
    lastValidated: r.last_validated || undefined,
    isValid: r.is_valid === 1,
  }))
}
