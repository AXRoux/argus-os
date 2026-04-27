// ═══════════════════════════════════════════════════════════════
// Argus Shared Types
// ═══════════════════════════════════════════════════════════════

// ─── Chat Types ──────────────────────────────────────────────

export type ToolResult = {
  provider?: string
  entityType?: string
  value?: string
  results?: Record<string, unknown>
  error?: string
  summary?: Record<string, unknown>
}

export type Advisory = {
  proposedAction?: {
    type: string
    entityType: string
    value: string
    providers?: string[]
  }
  rationale?: string
  risks?: string[]
  gaps?: string[]
  providerMapping?: string[]
}

export type ChatMessage = {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'action'
  content: string
  timestamp?: string
  actionType?: 'tool_call' | 'tool_complete' | 'status'
  toolName?: string
  toolResults?: ToolResult[]
  advisory?: Advisory
  sources?: string[]
  images?: Array<{
    url: string
    thumbnail_url?: string
    source_url?: string
    alt_text?: string
  }>
  researchMode?: 'standard' | 'deep' | 'duediligence'
}

export type ChatSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  lastMessageAt?: string
}

// ─── LLM Provider Types ─────────────────────────────────────

export type LLMProvider = 'kimi-k2' | 'openai' | 'ollama'

export type LLMConfig = {
  provider: LLMProvider
  apiKey?: string
  baseUrl?: string
  model?: string
}

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

export type LLMTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// ─── Adapter Types ───────────────────────────────────────────

export type AdapterCategory = 'infrastructure' | 'identity' | 'extraction' | 'enrichment' | 'search'

export type AdapterMetadata = {
  id: string
  name: string
  description: string
  author?: string
  version?: string
  category: AdapterCategory
  requiresApiKey: boolean
  apiKeyEnvVar?: string         // e.g. 'SHODAN_API_KEY'
  signupUrl?: string            // where users get a key
  docsUrl?: string              // API docs link
  entityTypes: string[]         // e.g. ['domain', 'ip', 'email']
  rateLimit?: string            // human-readable, e.g. '1 req/sec'
}

export type AdapterResult = {
  provider: string
  entityType: string
  value: string
  results: Record<string, unknown>
  error?: string
  timestamp: string
}

export type ApiKeyConfig = {
  adapterId: string
  apiKey: string
  addedAt: string
  lastValidated?: string
  isValid?: boolean
}

export type SettingsResponse = {
  adapters: Array<AdapterMetadata & { configured: boolean }>
}

export interface IOSINTAdapter {
  metadata: AdapterMetadata
  execute(query: string, entityType: string, options?: Record<string, unknown>): Promise<AdapterResult>
  isConfigured(): boolean
  /** Optional: validate an API key by making a test API call */
  validateKey?(apiKey: string): Promise<boolean>
}

// ─── API Request/Response Types ──────────────────────────────

export type ChatRequest = {
  messages: Array<{ role: string; content: string }>
  sessionId?: string
  researchMode?: 'standard' | 'deep' | 'duediligence'
  focusMode?: string
}

export type ChatResponse = {
  message: {
    role: 'assistant'
    content: string
  }
  toolResults?: ToolResult[]
  advisory?: Advisory
  sources?: string[]
  images?: ChatMessage['images']
  researchMode?: string
  sessionId?: string
}

// ─── Streaming Event Types ──────────────────────────────────

export type StreamEvent =
  | { type: 'status'; text: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; provider: string; error?: string }
  | { type: 'content'; delta: string }
  | { type: 'done'; sources: string[]; toolResults: ToolResult[] }

export type SessionListResponse = {
  sessions: ChatSession[]
}

export type AdapterListResponse = {
  adapters: AdapterMetadata[]
}

export type HealthResponse = {
  status: 'ok' | 'degraded'
  version: string
  provider: LLMProvider
  adapters: number
  uptime: number
}
