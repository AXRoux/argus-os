// ═══════════════════════════════════════════════════════════════
// Web Scraper Adapter — Scrapling-Inspired Stealth Extraction
//
// Enhanced stealth: 12 UA fingerprints, TLS-aware header sets,
// DuckDuckGo HTML search for queries, configurable timeout
// ═══════════════════════════════════════════════════════════════

import type { IOSINTAdapter, AdapterMetadata, AdapterResult } from '@argus/shared'

// ─── Browser Fingerprint Profiles ────────────────────────────
// Each profile pairs a UA with matching Sec-Ch-Ua headers
// to avoid TLS fingerprint mismatches that trigger anti-bot

type BrowserProfile = {
  ua: string
  secChUa: string
  platform: string
}

const BROWSER_PROFILES: BrowserProfile[] = [
  // Chrome 131 — macOS
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', secChUa: '"Chromium";v="131", "Not_A Brand";v="24"', platform: '"macOS"' },
  // Chrome 131 — Windows
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', secChUa: '"Chromium";v="131", "Not_A Brand";v="24"', platform: '"Windows"' },
  // Chrome 131 — Linux
  { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', secChUa: '"Chromium";v="131", "Not_A Brand";v="24"', platform: '"Linux"' },
  // Chrome 130 — macOS
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', secChUa: '"Chromium";v="130", "Not_A Brand";v="24"', platform: '"macOS"' },
  // Chrome 130 — Windows
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', secChUa: '"Chromium";v="130", "Not_A Brand";v="24"', platform: '"Windows"' },
  // Edge 131 — Windows
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', secChUa: '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"', platform: '"Windows"' },
  // Safari 18.2 — macOS (no Sec-Ch-Ua for Safari)
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15', secChUa: '', platform: '' },
  // Safari 17.6 — macOS
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15', secChUa: '', platform: '' },
  // Firefox 133 — Windows
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0', secChUa: '', platform: '' },
  // Firefox 133 — macOS
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0', secChUa: '', platform: '' },
  // Firefox 133 — Linux
  { ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0', secChUa: '', platform: '' },
  // Chrome 131 — Android (mobile variation)
  { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', secChUa: '"Chromium";v="131", "Not_A Brand";v="24"', platform: '"Android"' },
]

function getRandomProfile(): BrowserProfile {
  return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)]
}

// Build TLS-fingerprint-aware stealth headers
function getStealthHeaders(url: string): Record<string, string> {
  const profile = getRandomProfile()
  const host = new URL(url).hostname

  const headers: Record<string, string> = {
    'User-Agent': profile.ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Referer': `https://www.google.com/search?q=${host}`,
    'DNT': '1',
  }

  // Only add Sec-Ch-Ua headers for Chrome/Edge (Safari and Firefox don't send them)
  if (profile.secChUa) {
    headers['Sec-Ch-Ua'] = profile.secChUa
    headers['Sec-Ch-Ua-Mobile'] = profile.platform === '"Android"' ? '?1' : '?0'
    headers['Sec-Ch-Ua-Platform'] = profile.platform
  }

  return headers
}

// ─── DuckDuckGo HTML Search Result Parser ────────────────────

function parseDuckDuckGoResults(html: string): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = []

  // DuckDuckGo HTML results are in <div class="result"> blocks
  const resultRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*result|$)/gi
  let match

  while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
    const block = match[1]

    // Extract URL from the link
    const urlMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!urlMatch) continue

    let url = urlMatch[1]
    const title = urlMatch[2].replace(/<[^>]+>/g, '').trim()

    // DuckDuckGo uses redirect URLs — extract the real URL
    if (url.includes('uddg=')) {
      const realUrl = new URL(url, 'https://duckduckgo.com').searchParams.get('uddg')
      if (realUrl) url = realUrl
    }

    // Extract snippet
    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : ''

    if (title && url) {
      results.push({ title, url, snippet })
    }
  }

  return results
}

// ─── Intelligent Content Extraction ──────────────────────────

function extractContent(html: string, url: string): {
  title: string
  description: string
  text: string
  links: Array<{ text: string; href: string }>
  headings: string[]
  meta: Record<string, string>
} {
  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : ''

  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)
  const description = descMatch ? descMatch[1].trim() : ''

  // Meta tags
  const meta: Record<string, string> = {}
  const metaRegex = /<meta[^>]*(?:name|property)=["']([^"']*)["'][^>]*content=["']([^"']*)["']/gi
  let metaMatch
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    meta[metaMatch[1]] = metaMatch[2]
  }

  // Strip scripts, styles, and noise elements
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Extract headings with hierarchy
  const headings: string[] = []
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
  let headingMatch
  while ((headingMatch = headingRegex.exec(cleaned)) !== null) {
    const level = headingMatch[1]
    const text = headingMatch[2].replace(/<[^>]+>/g, '').trim()
    if (text) headings.push(`h${level}: ${text}`)
  }

  // Extract links
  const links: Array<{ text: string; href: string }> = []
  const linkRegex = /<a[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let linkMatch
  while ((linkMatch = linkRegex.exec(cleaned)) !== null) {
    const text = linkMatch[2].replace(/<[^>]+>/g, '').trim()
    let href = linkMatch[1].trim()
    if (text && href && !href.startsWith('javascript:')) {
      try {
        href = new URL(href, url).href
      } catch { /* keep as-is */ }
      links.push({ text: text.slice(0, 100), href })
    }
  }

  // Extract body text
  const bodyMatch = cleaned.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i)
  const bodyHtml = bodyMatch ? bodyMatch[1] : cleaned
  const text = bodyHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000)

  return {
    title,
    description,
    text,
    links: links.slice(0, 25),
    headings: headings.slice(0, 20),
    meta,
  }
}

// ═══════════════════════════════════════════════════════════════

export class WebScraperAdapter implements IOSINTAdapter {
  metadata: AdapterMetadata = {
    id: 'webscraper',
    name: 'Web Scraper',
    description: 'Stealth web content extraction and DuckDuckGo HTML search — fetches pages with anti-detection headers, extracts text/links/metadata. For queries, searches DuckDuckGo HTML directly.',
    version: '2.0.0',
    category: 'extraction',
    requiresApiKey: false,
    entityTypes: ['domain', 'url', 'query'],
  }

  isConfigured(): boolean {
    return true
  }

  async execute(query: string, entityType: string, options?: Record<string, unknown>): Promise<AdapterResult> {
    const timeoutMs = Math.min(
      (options?.timeout as number) || 15000,
      30000
    )

    // Determine if this is a search query or a direct page fetch
    const isSearch = entityType === 'query' &&
      !query.startsWith('http://') && !query.startsWith('https://') &&
      !query.match(/^[a-z0-9.-]+\.[a-z]{2,}$/i)

    if (isSearch) {
      return this.searchDuckDuckGo(query, entityType, timeoutMs)
    }

    return this.scrapePage(query, entityType, timeoutMs)
  }

  // ─── Direct Page Scraping ──────────────────────────────────

  private async scrapePage(query: string, entityType: string, timeoutMs: number): Promise<AdapterResult> {
    let url: string
    if (query.startsWith('http://') || query.startsWith('https://')) {
      url = query
    } else {
      url = `https://${query}`
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(url, {
        headers: getStealthHeaders(url),
        signal: controller.signal,
        redirect: 'follow',
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      const content = extractContent(html, url)

      return {
        provider: 'Web Scraper',
        entityType,
        value: query,
        results: {
          url: response.url,
          statusCode: response.status,
          title: content.title,
          description: content.description,
          headings: content.headings,
          textContent: content.text,
          links: content.links,
          meta: content.meta,
          contentLength: html.length,
        },
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      const err = error as Error
      return {
        provider: 'Web Scraper',
        entityType,
        value: query,
        results: {},
        error: err.name === 'AbortError' ? `Request timed out (${timeoutMs / 1000}s)` : err.message,
        timestamp: new Date().toISOString(),
      }
    }
  }

  // ─── DuckDuckGo HTML Search ────────────────────────────────

  private async searchDuckDuckGo(query: string, entityType: string, timeoutMs: number): Promise<AdapterResult> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(url, {
        headers: getStealthHeaders(url),
        signal: controller.signal,
        redirect: 'follow',
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`DuckDuckGo search failed: ${response.status}`)
      }

      const html = await response.text()
      const searchResults = parseDuckDuckGoResults(html)

      return {
        provider: 'Web Search (DuckDuckGo)',
        entityType,
        value: query,
        results: {
          query,
          resultCount: searchResults.length,
          results: searchResults,
        },
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      const err = error as Error
      return {
        provider: 'Web Search (DuckDuckGo)',
        entityType,
        value: query,
        results: {},
        error: err.name === 'AbortError' ? `Search timed out (${timeoutMs / 1000}s)` : err.message,
        timestamp: new Date().toISOString(),
      }
    }
  }
}
