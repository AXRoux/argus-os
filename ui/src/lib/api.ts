// ═══════════════════════════════════════════════════════════════
// Argus API Client — Communicates with the Express backend
// ═══════════════════════════════════════════════════════════════

import type { ChatSession, ChatMessage, ChatResponse, HealthResponse } from '@argus/shared'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error((errorData as { error?: string }).error || `Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

// ─── Health ──────────────────────────────────────────────────

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

// ─── Sessions ────────────────────────────────────────────────

export async function getSessions(): Promise<ChatSession[]> {
  const data = await request<{ sessions: ChatSession[] }>('/sessions')
  return data.sessions
}

export async function createSession(title: string): Promise<ChatSession> {
  return request<ChatSession>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  await request(`/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}

export async function deleteSession(id: string): Promise<void> {
  await request(`/sessions/${id}`, { method: 'DELETE' })
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const data = await request<{ messages: ChatMessage[] }>(`/sessions/${sessionId}/messages`)
  return data.messages
}

// ─── Chat ────────────────────────────────────────────────────

export async function sendChat(
  messages: Array<{ role: string; content: string }>,
  options?: {
    sessionId?: string
    researchMode?: string
    focusMode?: string
  }
): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({
      messages,
      sessionId: options?.sessionId,
      researchMode: options?.researchMode,
      focusMode: options?.focusMode,
    }),
  })
}

// ─── Chat (SSE Streaming) ────────────────────────────────────

import type { StreamEvent } from '@argus/shared'

export async function* sendChatStream(
  messages: Array<{ role: string; content: string }>,
  options?: {
    sessionId?: string
    researchMode?: string
    focusMode?: string
    signal?: AbortSignal
  }
): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      sessionId: options?.sessionId,
      researchMode: options?.researchMode,
      focusMode: options?.focusMode,
    }),
    signal: options?.signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error((errorData as { error?: string }).error || `Request failed: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as StreamEvent
            yield event
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.startsWith('data: ')) {
      try {
        const event = JSON.parse(buffer.slice(6)) as StreamEvent
        yield event
      } catch {
        // Skip malformed JSON
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ─── Adapters ────────────────────────────────────────────────

export async function getAdapters(): Promise<Array<{ id: string; name: string; description: string; requiresApiKey?: boolean; entityTypes: string[] }>> {
  const data = await request<{ adapters: Array<{ id: string; name: string; description: string; requiresApiKey?: boolean; entityTypes: string[] }> }>('/adapters')
  return data.adapters
}

// ─── Settings (BYOK Key Management) ─────────────────────────

import type { SettingsResponse } from '@argus/shared'

export async function getSettings(): Promise<SettingsResponse> {
  return request<SettingsResponse>('/settings')
}

export async function setApiKey(adapterId: string, apiKey: string): Promise<{ ok: boolean; valid: boolean }> {
  return request<{ ok: boolean; valid: boolean }>(`/settings/keys/${adapterId}`, {
    method: 'PUT',
    body: JSON.stringify({ apiKey }),
  })
}

export async function deleteApiKey(adapterId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/settings/keys/${adapterId}`, {
    method: 'DELETE',
  })
}

export async function validateApiKey(adapterId: string, apiKey: string): Promise<{ valid: boolean }> {
  return request<{ valid: boolean }>(`/settings/keys/${adapterId}/validate`, {
    method: 'POST',
    body: JSON.stringify({ apiKey }),
  })
}
