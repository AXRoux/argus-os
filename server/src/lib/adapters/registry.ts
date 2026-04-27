// ═══════════════════════════════════════════════════════════════
// Argus Adapter Registry — Paperclip-inspired mutable registry
// Manages OSINT adapters with runtime BYOK key injection
// ═══════════════════════════════════════════════════════════════

import type { IOSINTAdapter, AdapterMetadata, AdapterResult, LLMTool } from '@argus/shared'
import * as db from '../db/database.js'

class AdapterRegistry {
  private adapters = new Map<string, IOSINTAdapter>()

  // ─── Core Registration (Paperclip pattern) ─────────────────

  register(adapter: IOSINTAdapter): void {
    this.adapters.set(adapter.metadata.id, adapter)
    const status = adapter.isConfigured() ? '[ok]' : '[--] (no API key)'
    console.log(`  ${status} ${adapter.metadata.name} [${adapter.metadata.entityTypes.join(', ')}]`)
  }

  unregister(id: string): void {
    this.adapters.delete(id)
  }

  get(id: string): IOSINTAdapter | undefined {
    return this.adapters.get(id)
  }

  getAll(): IOSINTAdapter[] {
    return Array.from(this.adapters.values())
  }

  getConfigured(): IOSINTAdapter[] {
    return this.getAll().filter(a => a.isConfigured())
  }

  getMetadata(): AdapterMetadata[] {
    return this.getAll().map(a => a.metadata)
  }

  // ─── BYOK Key Management ──────────────────────────────────

  /**
   * Store an API key in the database for runtime injection.
   * Key resolution: DB key → env var → unconfigured
   */
  setApiKey(adapterId: string, apiKey: string): void {
    db.setApiKey(adapterId, apiKey)
  }

  removeApiKey(adapterId: string): void {
    db.deleteApiKey(adapterId)
  }

  /**
   * Resolve the active API key for an adapter.
   * Priority: DB (user-set via Settings) → process.env → undefined
   */
  resolveApiKey(adapterId: string): string | undefined {
    const adapter = this.get(adapterId)
    if (!adapter) return undefined

    // 1. Check DB first (user-configured via Settings UI)
    const dbKey = db.getApiKey(adapterId)
    if (dbKey) return dbKey

    // 2. Fall back to .env
    const envVar = adapter.metadata.apiKeyEnvVar
    if (envVar && process.env[envVar]) return process.env[envVar]

    return undefined
  }

  /**
   * Validate an API key by calling the adapter's validateKey method.
   * If the adapter doesn't implement validateKey, returns true (optimistic).
   */
  async validateKey(adapterId: string, apiKey: string): Promise<boolean> {
    const adapter = this.get(adapterId)
    if (!adapter) return false

    if (adapter.validateKey) {
      try {
        return await adapter.validateKey(apiKey)
      } catch {
        return false
      }
    }

    // Optimistic: no validation method = assume valid
    return true
  }

  // ─── Settings UI Data ─────────────────────────────────────

  /**
   * Enriched metadata for the Settings panel.
   * Includes `configured` boolean based on key resolution.
   */
  getDetailedMetadata(): Array<AdapterMetadata & { configured: boolean }> {
    return this.getAll().map(adapter => ({
      ...adapter.metadata,
      configured: adapter.isConfigured(),
    }))
  }

  // ─── LLM Tool Definitions ─────────────────────────────────

  /**
   * Convert all configured adapters to LLM tool definitions
   * for the function-calling agent loop.
   *
   * Adapters that return multiple tool definitions (e.g. Shodan's 5 sub-tools)
   * use the `toToolDefinitions()` method if available.
   */
  toToolDefinitions(): LLMTool[] {
    const tools: LLMTool[] = []

    for (const adapter of this.getConfigured()) {
      // Check if adapter provides its own tool definitions (multi-tool adapters)
      if ('toToolDefinitions' in adapter && typeof (adapter as unknown as { toToolDefinitions: () => LLMTool[] }).toToolDefinitions === 'function') {
        tools.push(...(adapter as unknown as { toToolDefinitions: () => LLMTool[] }).toToolDefinitions())
      } else {
        // Default: one tool per adapter
        tools.push({
          type: 'function' as const,
          function: {
            name: `osint_${adapter.metadata.id}`,
            description: `${adapter.metadata.description}. Supports entity types: ${adapter.metadata.entityTypes.join(', ')}`,
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query (domain, IP address, email, etc.)',
                },
                entityType: {
                  type: 'string',
                  enum: adapter.metadata.entityTypes,
                  description: 'The type of entity to investigate',
                },
              },
              required: ['query', 'entityType'],
            },
          },
        })
      }
    }

    return tools
  }

  /**
   * Execute a tool call from the LLM.
   * Supports both single-tool adapters (osint_{id}) and
   * multi-tool adapters (osint_{id}_{subTool}).
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<AdapterResult> {
    const stripped = toolName.replace(/^osint_/, '')

    // Try exact match first (single-tool adapters)
    let adapter = this.get(stripped)

    // Try prefix match for multi-tool adapters (e.g. "shodan_host_info" → adapter "shodan")
    if (!adapter) {
      for (const [id, a] of this.adapters) {
        if (stripped.startsWith(id + '_') || stripped === id) {
          adapter = a
          break
        }
      }
    }

    if (!adapter) {
      return {
        provider: stripped,
        entityType: (args.entityType as string) || 'unknown',
        value: (args.query as string) || '',
        results: {},
        error: `Adapter for "${toolName}" not found`,
        timestamp: new Date().toISOString(),
      }
    }

    if (!adapter.isConfigured()) {
      return {
        provider: adapter.metadata.name,
        entityType: (args.entityType as string) || 'unknown',
        value: (args.query as string) || '',
        results: {},
        error: `${adapter.metadata.name} requires an API key. Configure it in Settings.`,
        timestamp: new Date().toISOString(),
      }
    }

    try {
      // Pass the full tool name so multi-tool adapters can dispatch internally
      return await adapter.execute(
        (args.query as string) || '',
        (args.entityType as string) || 'unknown',
        { toolName: stripped, ...args }
      )
    } catch (error) {
      const err = error as Error
      return {
        provider: adapter.metadata.name,
        entityType: (args.entityType as string) || 'unknown',
        value: (args.query as string) || '',
        results: {},
        error: err.message,
        timestamp: new Date().toISOString(),
      }
    }
  }
}

// Singleton
export const registry = new AdapterRegistry()
