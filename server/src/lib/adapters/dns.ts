// ═══════════════════════════════════════════════════════════════
// DNS Adapter — DNS record resolution (no API key, Node.js built-in)
// ═══════════════════════════════════════════════════════════════

import dns from 'node:dns/promises'
import type { IOSINTAdapter, AdapterMetadata, AdapterResult } from '@argus/shared'

export class DnsAdapter implements IOSINTAdapter {
  metadata: AdapterMetadata = {
    id: 'dns',
    name: 'DNS Resolver',
    description: 'DNS record resolution — A, AAAA, MX, TXT, NS, CNAME, SOA records',
    version: '1.0.0',
    category: 'infrastructure',
    requiresApiKey: false,
    entityTypes: ['domain'],
  }

  isConfigured(): boolean {
    return true
  }

  async execute(query: string, entityType: string): Promise<AdapterResult> {
    const domain = query.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim()
    const results: Record<string, unknown> = { domain }

    const lookups: Array<{ type: string; fn: () => Promise<unknown> }> = [
      { type: 'A', fn: () => dns.resolve4(domain) },
      { type: 'AAAA', fn: () => dns.resolve6(domain) },
      { type: 'MX', fn: () => dns.resolveMx(domain) },
      { type: 'TXT', fn: () => dns.resolveTxt(domain) },
      { type: 'NS', fn: () => dns.resolveNs(domain) },
      { type: 'CNAME', fn: () => dns.resolveCname(domain) },
      { type: 'SOA', fn: () => dns.resolveSoa(domain) },
    ]

    await Promise.allSettled(
      lookups.map(async ({ type, fn }) => {
        try {
          results[type] = await fn()
        } catch {
          // Record type not found — skip
        }
      })
    )

    return {
      provider: 'DNS',
      entityType,
      value: domain,
      results,
      timestamp: new Date().toISOString(),
    }
  }
}
