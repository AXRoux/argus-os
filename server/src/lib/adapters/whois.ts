// ═══════════════════════════════════════════════════════════════
// WHOIS Adapter — Domain registration lookup (no API key needed)
// ═══════════════════════════════════════════════════════════════

import type { IOSINTAdapter, AdapterMetadata, AdapterResult } from '@argus/shared'

export class WhoisAdapter implements IOSINTAdapter {
  metadata: AdapterMetadata = {
    id: 'whois',
    name: 'WHOIS',
    description: 'Domain registration and ownership lookup via WHOIS protocol',
    version: '1.0.0',
    category: 'infrastructure',
    requiresApiKey: false,
    entityTypes: ['domain'],
  }

  isConfigured(): boolean {
    return true // No API key needed
  }

  async execute(query: string, entityType: string): Promise<AdapterResult> {
    const domain = query.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim()

    try {
      // Use RDAP (REST-based WHOIS replacement) — free, no key needed
      const response = await fetch(`https://rdap.org/domain/${domain}`)

      if (!response.ok) {
        throw new Error(`RDAP lookup failed: ${response.status}`)
      }

      const data = await response.json()

      // Extract key fields
      const result: Record<string, unknown> = {
        name: data.ldhName || domain,
        status: data.status || [],
        registrar: data.entities?.find((e: Record<string, unknown>) =>
          (e.roles as string[])?.includes('registrar')
        )?.vcardArray?.[1]?.find((v: unknown[]) => v[0] === 'fn')?.[3] || 'Unknown',
        nameservers: data.nameservers?.map((ns: Record<string, unknown>) => ns.ldhName) || [],
        events: data.events?.map((e: Record<string, unknown>) => ({
          action: e.eventAction,
          date: e.eventDate,
        })) || [],
        links: data.links?.map((l: Record<string, unknown>) => l.href) || [],
      }

      return {
        provider: 'WHOIS (RDAP)',
        entityType,
        value: domain,
        results: result,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      const err = error as Error
      return {
        provider: 'WHOIS',
        entityType,
        value: domain,
        results: {},
        error: err.message,
        timestamp: new Date().toISOString(),
      }
    }
  }
}
