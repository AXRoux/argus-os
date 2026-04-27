# Writing an Argus OSINT Adapter

Adapters are the OSINT data sources that Argus can query. Each adapter is a single TypeScript file that implements the `IOSINTAdapter` interface.

## Adapter Interface

```typescript
import type { IOSINTAdapter, AdapterMetadata, AdapterResult } from '@argus/shared'

export class MyAdapter implements IOSINTAdapter {
  metadata: AdapterMetadata = {
    id: 'myadapter',              // Unique ID (used in tool names)
    name: 'My Adapter',           // Display name
    description: 'What it does',  // LLM reads this to decide when to use it
    version: '1.0.0',
    requiresApiKey: false,        // Set to true if BYOK
    entityTypes: ['domain', 'ip'] // What entity types it supports
  }

  isConfigured(): boolean {
    // Return true if the adapter is ready to use
    // For BYOK adapters, check for the API key in process.env
    return true
  }

  async execute(query: string, entityType: string): Promise<AdapterResult> {
    // Do the actual lookup
    const results = await fetchSomeData(query)

    return {
      provider: 'My Source',
      entityType,
      value: query,
      results: { /* structured data */ },
      timestamp: new Date().toISOString(),
    }
  }
}
```

## Registration

Add your adapter to `server/src/lib/adapters/index.ts`:

```typescript
import { MyAdapter } from './myadapter.js'

// Inside loadBuiltinAdapters():
registry.register(new MyAdapter())
```

## How It Works

1. The **adapter registry** converts your adapter into an LLM tool definition
2. The tool name becomes `osint_<your-adapter-id>` (e.g., `osint_myadapter`)
3. When the LLM decides to use your adapter, the **agent runner** calls `execute()`
4. Results are fed back to the LLM for analysis

## Entity Types

Common entity types:
- `domain` — e.g., `example.com`
- `ip` — e.g., `93.184.216.34`
- `email` — e.g., `user@example.com`
- `person` — e.g., `John Doe`
- `organization` — e.g., `Acme Corp`
- `url` — Full URL
- `query` — Free-text search

## Tips

- **Description matters** — The LLM reads `metadata.description` to decide when to use your adapter. Be specific about what data it provides.
- **Handle errors** — Always catch exceptions and return an `AdapterResult` with an `error` field rather than throwing.
- **Timeout** — Use `AbortController` for HTTP requests with a 15-second timeout.
- **Rate limits** — If your API has rate limits, implement a simple throttle.
- **BYOK** — For paid APIs, check `process.env.YOUR_API_KEY` in `isConfigured()`.

## Example: VirusTotal Adapter

```typescript
export class VirusTotalAdapter implements IOSINTAdapter {
  metadata: AdapterMetadata = {
    id: 'virustotal',
    name: 'VirusTotal',
    description: 'Malware scanning and threat intelligence — file hashes, URLs, domains, IPs',
    version: '1.0.0',
    requiresApiKey: true,
    entityTypes: ['domain', 'ip', 'url'],
  }

  private get apiKey() { return process.env.VIRUSTOTAL_API_KEY }

  isConfigured() { return !!this.apiKey }

  async execute(query: string, entityType: string): Promise<AdapterResult> {
    const response = await fetch(
      `https://www.virustotal.com/api/v3/${entityType}s/${query}`,
      { headers: { 'x-apikey': this.apiKey! } }
    )

    if (!response.ok) throw new Error(`VT API error: ${response.status}`)
    const data = await response.json()

    return {
      provider: 'VirusTotal',
      entityType,
      value: query,
      results: data.data?.attributes || {},
      timestamp: new Date().toISOString(),
    }
  }
}
```
