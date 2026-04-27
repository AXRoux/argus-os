// ═══════════════════════════════════════════════════════════════
// GeoIP Adapter — IP geolocation (free API, no key needed)
// ═══════════════════════════════════════════════════════════════

import type { IOSINTAdapter, AdapterMetadata, AdapterResult } from '@argus/shared'

export class GeoIpAdapter implements IOSINTAdapter {
  metadata: AdapterMetadata = {
    id: 'geoip',
    name: 'GeoIP',
    description: 'IP address geolocation — country, city, ISP, organization, ASN',
    version: '1.0.0',
    category: 'enrichment',
    requiresApiKey: false,
    entityTypes: ['ip'],
  }

  isConfigured(): boolean {
    return true
  }

  async execute(query: string, entityType: string): Promise<AdapterResult> {
    const ip = query.trim()

    try {
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,query`)

      if (!response.ok) {
        throw new Error(`GeoIP lookup failed: ${response.status}`)
      }

      const data = await response.json() as Record<string, unknown>

      if (data.status === 'fail') {
        throw new Error(data.message as string || 'GeoIP lookup failed')
      }

      return {
        provider: 'GeoIP',
        entityType,
        value: ip,
        results: {
          ip: data.query,
          country: data.country,
          countryCode: data.countryCode,
          region: data.regionName,
          city: data.city,
          zip: data.zip,
          latitude: data.lat,
          longitude: data.lon,
          timezone: data.timezone,
          isp: data.isp,
          organization: data.org,
          asn: data.as,
          asName: data.asname,
        },
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      const err = error as Error
      return {
        provider: 'GeoIP',
        entityType,
        value: ip,
        results: {},
        error: err.message,
        timestamp: new Date().toISOString(),
      }
    }
  }
}
