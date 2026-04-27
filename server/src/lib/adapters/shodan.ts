// ═══════════════════════════════════════════════════════════════
// Shodan Adapter — 5 Free-Tier Sub-Tools (zero credits consumed)
//
// Tools:
//   shodan_host_info    — GET /shodan/host/{ip}     (Free)
//   shodan_search_count — GET /shodan/host/count    (Free)
//   shodan_dns_resolve  — GET /dns/resolve          (Free)
//   shodan_dns_reverse  — GET /dns/reverse          (Free)
//   shodan_api_info     — GET /api-info             (Free)
// ═══════════════════════════════════════════════════════════════

import type { IOSINTAdapter, AdapterMetadata, AdapterResult, LLMTool } from '@argus/shared'
import * as db from '../db/database.js'

const SHODAN_BASE = 'https://api.shodan.io'

export class ShodanAdapter implements IOSINTAdapter {
  metadata: AdapterMetadata = {
    id: 'shodan',
    name: 'Shodan',
    description: 'Internet-connected device search — open ports, services, vulnerabilities, banners. 5 free-tier tools, zero credits consumed.',
    version: '2.0.0',
    author: 'Shodan.io',
    category: 'infrastructure',
    requiresApiKey: true,
    apiKeyEnvVar: 'SHODAN_API_KEY',
    signupUrl: 'https://account.shodan.io/register',
    docsUrl: 'https://developer.shodan.io/api',
    entityTypes: ['ip', 'domain', 'query'],
    rateLimit: '1 req/sec',
  }

  private get apiKey(): string | undefined {
    return db.getApiKey('shodan') || process.env.SHODAN_API_KEY
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  async validateKey(apiKey: string): Promise<boolean> {
    try {
      const resp = await fetch(`${SHODAN_BASE}/api-info?key=${apiKey}`)
      return resp.ok
    } catch {
      return false
    }
  }

  // ─── Multi-Tool Definitions ────────────────────────────────

  toToolDefinitions(): LLMTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'osint_shodan_host_info',
          description: 'Get detailed host information from Shodan — open ports, services, banners, OS, vulnerabilities, geolocation. FREE endpoint.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The IP address to look up (e.g. "8.8.8.8")' },
              entityType: { type: 'string', enum: ['ip'], description: 'Must be "ip"' },
            },
            required: ['query', 'entityType'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'osint_shodan_search_count',
          description: 'Count search results for a Shodan query with optional facets (e.g. org, country, port). FREE endpoint — no query credits consumed. Use to get aggregate intelligence.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Shodan search query (e.g. "port:22 country:US", "apache", "org:Google")' },
              entityType: { type: 'string', enum: ['query'], description: 'Must be "query"' },
              facets: { type: 'string', description: 'Comma-separated facets (e.g. "org,country,port"). Returns top-5 breakdown per facet.' },
            },
            required: ['query', 'entityType'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'osint_shodan_dns_resolve',
          description: 'Resolve hostnames to IP addresses via Shodan DNS. FREE endpoint. Accepts comma-separated hostnames.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Comma-separated hostnames to resolve (e.g. "google.com,cloudflare.com")' },
              entityType: { type: 'string', enum: ['domain'], description: 'Must be "domain"' },
            },
            required: ['query', 'entityType'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'osint_shodan_dns_reverse',
          description: 'Reverse DNS lookup — resolve IPs to hostnames via Shodan. FREE endpoint. Accepts comma-separated IPs.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Comma-separated IPs to reverse lookup (e.g. "8.8.8.8,1.1.1.1")' },
              entityType: { type: 'string', enum: ['ip'], description: 'Must be "ip"' },
            },
            required: ['query', 'entityType'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'osint_shodan_api_info',
          description: 'Check Shodan API key status — remaining query credits, scan credits, and plan info. FREE endpoint.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Not used, pass empty string' },
              entityType: { type: 'string', enum: ['query'], description: 'Must be "query"' },
            },
            required: ['query', 'entityType'],
          },
        },
      },
    ]
  }

  // ─── Unified Executor ──────────────────────────────────────

  async execute(query: string, entityType: string, options?: Record<string, unknown>): Promise<AdapterResult> {
    if (!this.apiKey) {
      return this.error(query, entityType, 'SHODAN_API_KEY not configured. Add it in Settings or .env')
    }

    const toolName = (options?.toolName as string) || 'shodan'

    try {
      // Dispatch to the correct sub-tool
      if (toolName === 'shodan_host_info' || (toolName === 'shodan' && entityType === 'ip')) {
        return await this.hostInfo(query, entityType)
      }
      if (toolName === 'shodan_search_count') {
        return await this.searchCount(query, entityType, options?.facets as string | undefined)
      }
      if (toolName === 'shodan_dns_resolve' || (toolName === 'shodan' && entityType === 'domain')) {
        return await this.dnsResolve(query, entityType)
      }
      if (toolName === 'shodan_dns_reverse') {
        return await this.dnsReverse(query, entityType)
      }
      if (toolName === 'shodan_api_info') {
        return await this.apiInfo(entityType)
      }

      // Fallback: try host info for IPs, dns resolve for domains
      if (entityType === 'ip') return await this.hostInfo(query, entityType)
      if (entityType === 'domain') return await this.dnsResolve(query, entityType)
      return await this.searchCount(query, entityType)
    } catch (err) {
      return this.error(query, entityType, (err as Error).message)
    }
  }

  // ─── Sub-Tool Implementations ──────────────────────────────

  private async hostInfo(ip: string, entityType: string): Promise<AdapterResult> {
    const resp = await fetch(`${SHODAN_BASE}/shodan/host/${ip}?key=${this.apiKey}`)
    if (!resp.ok) throw new Error(await this.parseError(resp))
    const data = await resp.json() as Record<string, unknown>

    return {
      provider: 'Shodan',
      entityType,
      value: ip,
      results: {
        ip: data.ip_str,
        os: data.os,
        ports: data.ports,
        hostnames: data.hostnames,
        city: data.city,
        country: data.country_name,
        org: data.org,
        isp: data.isp,
        asn: data.asn,
        vulns: data.vulns || [],
        lastUpdate: data.last_update,
        services: Array.isArray(data.data)
          ? (data.data as Array<Record<string, unknown>>).slice(0, 15).map(s => ({
              port: s.port,
              protocol: s.transport,
              product: s.product,
              version: s.version,
              banner: typeof s.data === 'string' ? s.data.slice(0, 300) : undefined,
              module: s._shodan ? (s._shodan as Record<string, unknown>).module : undefined,
            }))
          : [],
      },
      timestamp: new Date().toISOString(),
    }
  }

  private async searchCount(query: string, entityType: string, facets?: string): Promise<AdapterResult> {
    let url = `${SHODAN_BASE}/shodan/host/count?key=${this.apiKey}&query=${encodeURIComponent(query)}`
    if (facets) url += `&facets=${encodeURIComponent(facets)}`

    const resp = await fetch(url)
    if (!resp.ok) throw new Error(await this.parseError(resp))
    const data = await resp.json() as Record<string, unknown>

    return {
      provider: 'Shodan',
      entityType,
      value: query,
      results: {
        total: data.total,
        facets: data.facets || {},
      },
      timestamp: new Date().toISOString(),
    }
  }

  private async dnsResolve(hostnames: string, entityType: string): Promise<AdapterResult> {
    const resp = await fetch(`${SHODAN_BASE}/dns/resolve?hostnames=${encodeURIComponent(hostnames)}&key=${this.apiKey}`)
    if (!resp.ok) throw new Error(await this.parseError(resp))
    const data = await resp.json() as Record<string, string>

    return {
      provider: 'Shodan',
      entityType,
      value: hostnames,
      results: { resolved: data },
      timestamp: new Date().toISOString(),
    }
  }

  private async dnsReverse(ips: string, entityType: string): Promise<AdapterResult> {
    const resp = await fetch(`${SHODAN_BASE}/dns/reverse?ips=${encodeURIComponent(ips)}&key=${this.apiKey}`)
    if (!resp.ok) throw new Error(await this.parseError(resp))
    const data = await resp.json() as Record<string, string[]>

    return {
      provider: 'Shodan',
      entityType,
      value: ips,
      results: { reversed: data },
      timestamp: new Date().toISOString(),
    }
  }

  private async apiInfo(entityType: string): Promise<AdapterResult> {
    const resp = await fetch(`${SHODAN_BASE}/api-info?key=${this.apiKey}`)
    if (!resp.ok) throw new Error(await this.parseError(resp))
    const data = await resp.json() as Record<string, unknown>

    return {
      provider: 'Shodan',
      entityType,
      value: 'api-info',
      results: {
        plan: data.plan,
        queryCredits: data.query_credits,
        scanCredits: data.scan_credits,
        monitorsLeft: data.monitored_ips,
        usage: data.usage_limits,
      },
      timestamp: new Date().toISOString(),
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  private async parseError(resp: Response): Promise<string> {
    try {
      const data = await resp.json() as Record<string, unknown>
      return (data.error as string) || `Shodan API error: ${resp.status}`
    } catch {
      return `Shodan API error: ${resp.status}`
    }
  }

  private error(query: string, entityType: string, message: string): AdapterResult {
    return {
      provider: 'Shodan',
      entityType,
      value: query,
      results: {},
      error: message,
      timestamp: new Date().toISOString(),
    }
  }
}
