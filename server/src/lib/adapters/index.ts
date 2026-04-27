// ═══════════════════════════════════════════════════════════════
// Builtin Adapter Loader
// ═══════════════════════════════════════════════════════════════

import { registry } from './registry.js'
import { WhoisAdapter } from './whois.js'
import { DnsAdapter } from './dns.js'
import { GeoIpAdapter } from './geoip.js'
import { ShodanAdapter } from './shodan.js'
import { WebScraperAdapter } from './webscraper.js'
import { OsintIndustriesAdapter } from './osint-industries.js'

export function loadBuiltinAdapters(): void {
  console.log('[adapters] Loading OSINT adapters...')

  // Always-active (no API key required)
  registry.register(new WhoisAdapter())
  registry.register(new DnsAdapter())
  registry.register(new GeoIpAdapter())
  registry.register(new WebScraperAdapter())

  // BYOK adapters (require API key)
  registry.register(new ShodanAdapter())
  registry.register(new OsintIndustriesAdapter())

  console.log(`   ${registry.getConfigured().length}/${registry.getAll().length} adapters ready\n`)
}

export { registry }
