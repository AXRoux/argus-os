// ═══════════════════════════════════════════════════════════════
// OSINT Industries Adapter — Identity Intelligence (BYOK)
//
// Lookups: email, phone, username
// Requires API key from https://osint.industries
//
// API: POST /v2/request with `api-key` header
// Response: Array of module results, each with module name,
//           category, data, status, and spec_format fields.
// ═══════════════════════════════════════════════════════════════

import type { IOSINTAdapter, AdapterMetadata, AdapterResult } from '@argus/shared'
import * as db from '../db/database.js'

const OSINT_BASE = 'https://api.osint.industries/v2'

export class OsintIndustriesAdapter implements IOSINTAdapter {
  metadata: AdapterMetadata = {
    id: 'osint-industries',
    name: 'OSINT Industries',
    description: 'Identity intelligence — discover social profiles, registered accounts, and digital footprint from email addresses, phone numbers, and usernames',
    version: '1.0.0',
    author: 'OSINT Industries',
    category: 'identity',
    requiresApiKey: true,
    apiKeyEnvVar: 'OSINT_INDUSTRIES_API_KEY',
    signupUrl: 'https://osint.industries',
    docsUrl: 'https://docs.osint.industries',
    entityTypes: ['email', 'phone', 'username'],
  }

  private get apiKey(): string | undefined {
    return db.getApiKey('osint-industries') || process.env.OSINT_INDUSTRIES_API_KEY
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  /**
   * Validate an API key by making a lightweight request to the
   * real /v2/request endpoint with a short timeout. A 401 means
   * the key is invalid; any other response (200, 422, 5xx) means
   * the key itself is accepted by the API.
   */
  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const resp = await fetch(`${OSINT_BASE}/request`, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'email',
          query: 'test@example.com',
          timeout: 5,
          exact_match: true,
          premium: false,
          premium_modules_only: false,
        }),
      })
      // 401 = definitely bad key
      if (resp.status === 401) return false
      // Anything else (200, 422, etc.) means the key was accepted
      return true
    } catch {
      // Network error — can't validate; accept optimistically
      return true
    }
  }

  async execute(query: string, entityType: string): Promise<AdapterResult> {
    if (!this.apiKey) {
      return {
        provider: 'OSINT Industries',
        entityType,
        value: query,
        results: {},
        error: 'OSINT Industries API key not configured. Add it in Settings or get one at https://osint.industries',
        timestamp: new Date().toISOString(),
      }
    }

    try {
      // Map entity type to API type parameter
      const apiType = entityType === 'phone' ? 'phone'
        : entityType === 'username' ? 'username'
        : 'email'

      const response = await fetch(`${OSINT_BASE}/request`, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: apiType,
          query,
          timeout: 60,
          exact_match: true,
          premium: false,
          premium_modules_only: false,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>
        throw new Error(
          (errorData.error as string)
          || (errorData.message as string)
          || `OSINT Industries API error: ${response.status}`
        )
      }

      const data = await response.json() as unknown[]

      return {
        provider: 'OSINT Industries',
        entityType,
        value: query,
        results: { modules: data },
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      const err = error as Error
      return {
        provider: 'OSINT Industries',
        entityType,
        value: query,
        results: {},
        error: err.message,
        timestamp: new Date().toISOString(),
      }
    }
  }
}
