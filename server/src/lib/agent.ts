// ═══════════════════════════════════════════════════════════════
// Argus Agent Runner — Function-calling loop
// Orchestrates LLM + OSINT adapters in an agentic cycle
// Dynamic prompt: tool availability injected at runtime
// ═══════════════════════════════════════════════════════════════

import { getLLMClient } from './llm/client.js'
import { registry } from './adapters/index.js'
import type { LLMMessage, ChatResponse, ToolResult, StreamEvent } from '@argus/shared'

// ─── Dynamic System Prompt Builder ───────────────────────────

function buildSystemPrompt(): string {
  // Build dynamic capability listing from the registry
  const allAdapters = registry.getAll()
  const toolLines: string[] = []

  for (const adapter of allAdapters) {
    const status = adapter.isConfigured() ? '✅' : '⚠️'
    const label = adapter.isConfigured() ? 'Active' : 'NOT CONFIGURED (add key in Settings)'

    let detail = `${status} **${adapter.metadata.name}** — ${label}`

    // Add entity types
    detail += ` | Entities: ${adapter.metadata.entityTypes.join(', ')}`

    // Special annotations
    if (adapter.metadata.id === 'shodan' && adapter.isConfigured()) {
      detail += '\n    5 free tools: host_info, search_count, dns_resolve, dns_reverse, api_info (all FREE — zero credits consumed)'
    }
    if (!adapter.metadata.requiresApiKey) {
      detail += ' (no key needed)'
    }

    toolLines.push(detail)
  }

  const toolListBlock = toolLines.map(l => `- ${l}`).join('\n')

  return `You are Argus, an autonomous open-source intelligence (OSINT) orchestration agent. You conduct thorough, multi-source investigations without human intervention — planning collection, executing tools, cross-referencing findings, and delivering structured intelligence products.

## Core Doctrine
- **Thoroughness over speed.** Never answer from memory when tools are available. Always collect first, analyze second.
- **Multi-source corroboration.** A single source is an indicator. Two sources are a lead. Three or more are a finding. Always use multiple tools per investigation.
- **Structured intelligence cycle.** Follow the cycle: Requirements → Collection Plan → Collection → Processing → Analysis → Dissemination.
- **Full provenance.** Every claim must cite its data source. Never present uncorroborated assertions as findings.

## Available Tools (configured right now)
${toolListBlock}

## Shodan Strategy (FREE tier — use liberally)
- All Shodan tools are FREE — use them on every infrastructure investigation
- For domains: use osint_shodan_dns_resolve first to get IPs, then osint_shodan_host_info on each IP
- Use osint_shodan_search_count with facets for aggregate intelligence (e.g., "port:22 country:US" with facets "org,os")
- osint_shodan_api_info tells you remaining credits — check if the user asks about limits
- Combine with DNS Resolver and GeoIP for comprehensive infrastructure profiling

## Web Search Strategy
- The Web Scraper handles both direct page extraction AND web search
- For queries/research: use entityType "query" — this searches DuckDuckGo HTML directly
- For specific pages: use entityType "url" or "domain" — fetches and extracts content
- Uses stealth headers to avoid anti-bot detection

## Investigation Protocol
1. **Parse the query** — Identify all entities (domains, IPs, emails, organizations, people) and the intelligence requirement
2. **Plan collection** — Select ALL relevant tools. For a domain: WHOIS + DNS + GeoIP + Web Scraper + Shodan (all 5 sub-tools). For a person: Web Scraper (search) + OSINT Industries (if configured). Be exhaustive.
3. **Execute collection** — Run tools in parallel where possible. If a tool errors, note it and proceed with remaining sources.
4. **Cross-reference** — Correlate findings across sources. Flag discrepancies. Note corroborations.
5. **Assess confidence** — Rate findings: HIGH (3+ sources agree), MEDIUM (2 sources), LOW (single source or indirect)
6. **Deliver the report** — Use this structure:

### Report Structure
- **Executive Summary** — 2-3 sentence answer to the intelligence requirement
- **Key Findings** — Numbered findings with confidence levels and source citations
- **Technical Details** — Raw data organized by collection source
- **Risk Assessment** — Concerning indicators, exposed services, suspicious patterns
- **Recommendations** — Actionable next steps for the operator
- **Sources** — List of all data sources queried

## Rules of Engagement
- If the user asks a general knowledge question (not OSINT), answer directly without tools
- If a tool fails, explicitly note the gap: "⚠️ [Tool] unavailable — this assessment lacks [data type]"
- If a BYOK adapter is not configured, tell the user: "💡 [Adapter] is available but not configured. Add your API key in Settings to enable it."
- Never fabricate data. If you don't have it, say so.
- When investigating infrastructure, always check for related entities (e.g., same registrant, shared hosting, linked nameservers)
- Treat every investigation as if it will be reviewed by a senior analyst`
}

const MAX_TOOL_ROUNDS = 5

// ─── Standard Agent (non-streaming, backward compat) ────────

export async function runAgent(
  userMessages: Array<{ role: string; content: string }>,
  options?: {
    researchMode?: string
    focusMode?: string
  }
): Promise<ChatResponse> {
  const llm = getLLMClient()
  const tools = registry.toToolDefinitions()
  const allToolResults: ToolResult[] = []

  // Build message history with dynamic system prompt
  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...userMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  // Agentic loop — LLM calls tools, we execute them, LLM processes results
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await llm.chat(messages, { tools })

    // If no tool calls, we're done — return the final response
    if (!result.toolCalls || result.toolCalls.length === 0) {
      const sources = [...new Set(allToolResults.map(r => r.provider).filter(Boolean))] as string[]

      return {
        message: { role: 'assistant', content: result.content },
        toolResults: allToolResults.length > 0 ? allToolResults : undefined,
        sources: sources.length > 0 ? sources : undefined,
        researchMode: options?.researchMode || 'standard',
      }
    }

    // Add assistant's tool call message
    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls.map((tc: { id: string; functionName: string; arguments: Record<string, unknown> }) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.functionName,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    })

    // Execute tool calls IN PARALLEL (major speed improvement)
    console.log(`  [agent] Round ${round + 1}: ${result.toolCalls.length} tool(s) in parallel`)

    const toolPromises = result.toolCalls.map(async (toolCall) => {
      console.log(`  [tool] ${toolCall.functionName}(${JSON.stringify(toolCall.arguments)})`)
      return {
        toolCall,
        result: await registry.executeTool(
          toolCall.functionName,
          toolCall.arguments as Record<string, unknown>
        ),
      }
    })

    const settled = await Promise.allSettled(toolPromises)

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const { toolCall, result: toolResult } = outcome.value
        allToolResults.push(toolResult)

        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult.results || { error: toolResult.error }),
          tool_call_id: toolCall.id,
        })

        console.log(`  [ok] ${toolResult.provider}: ${toolResult.error ? '[fail] ' + toolResult.error : 'Success'}`)
      } else {
        // Handle rejected promises
        const toolCall = result.toolCalls[settled.indexOf(outcome)]
        const errorResult: ToolResult = {
          provider: toolCall.functionName,
          entityType: 'unknown',
          value: '',
          error: outcome.reason?.message || 'Tool execution failed',
        }
        allToolResults.push(errorResult)

        messages.push({
          role: 'tool',
          content: JSON.stringify({ error: errorResult.error }),
          tool_call_id: toolCall.id,
        })

        console.log(`  [fail] ${toolCall.functionName}: ${errorResult.error}`)
      }
    }
  }

  // Max rounds exceeded — return what we have
  const lastContent = messages.filter(m => m.role === 'assistant').pop()?.content || 'Investigation complete.'
  const sources = [...new Set(allToolResults.map(r => r.provider).filter(Boolean))] as string[]

  return {
    message: { role: 'assistant', content: lastContent },
    toolResults: allToolResults,
    sources,
    researchMode: options?.researchMode || 'standard',
  }
}

// ─── Streaming Agent (SSE events) ───────────────────────────

export async function* runAgentStreaming(
  userMessages: Array<{ role: string; content: string }>,
  options?: {
    researchMode?: string
    focusMode?: string
    signal?: AbortSignal
  }
): AsyncGenerator<StreamEvent> {
  const llm = getLLMClient()
  const tools = registry.toToolDefinitions()
  const allToolResults: ToolResult[] = []

  yield { type: 'status', text: 'Planning investigation...' }

  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...userMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Check for abort
    if (options?.signal?.aborted) return

    const result = await llm.chat(messages, { tools })

    if (options?.signal?.aborted) return

    // No tool calls → stream the final content
    if (!result.toolCalls || result.toolCalls.length === 0) {
      // Stream content in chunks for a typewriter effect
      const content = result.content
      const chunkSize = 12
      for (let i = 0; i < content.length; i += chunkSize) {
        if (options?.signal?.aborted) return
        yield { type: 'content', delta: content.slice(i, i + chunkSize) }
      }

      const sources = [...new Set(allToolResults.map(r => r.provider).filter(Boolean))] as string[]
      yield { type: 'done', sources, toolResults: allToolResults }
      return
    }

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: result.toolCalls.map((tc: { id: string; functionName: string; arguments: Record<string, unknown> }) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.functionName,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    })

    // Emit tool_call events for each tool
    for (const toolCall of result.toolCalls) {
      yield {
        type: 'tool_call',
        tool: toolCall.functionName,
        args: toolCall.arguments as Record<string, unknown>,
      }
    }

    // Execute all tools in parallel
    const toolPromises = result.toolCalls.map(async (toolCall) => {
      const toolResult = await registry.executeTool(
        toolCall.functionName,
        toolCall.arguments as Record<string, unknown>
      )
      return { toolCall, result: toolResult }
    })

    const settled = await Promise.allSettled(toolPromises)

    for (const outcome of settled) {
      if (options?.signal?.aborted) return

      if (outcome.status === 'fulfilled') {
        const { toolCall, result: toolResult } = outcome.value
        allToolResults.push(toolResult)

        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult.results || { error: toolResult.error }),
          tool_call_id: toolCall.id,
        })

        yield {
          type: 'tool_result',
          tool: toolCall.functionName,
          provider: toolResult.provider || toolCall.functionName,
          error: toolResult.error,
        }
      } else {
        const toolCall = result.toolCalls[settled.indexOf(outcome)]
        const errMsg = outcome.reason?.message || 'Tool execution failed'
        allToolResults.push({
          provider: toolCall.functionName,
          entityType: 'unknown',
          value: '',
          error: errMsg,
        })

        messages.push({
          role: 'tool',
          content: JSON.stringify({ error: errMsg }),
          tool_call_id: toolCall.id,
        })

        yield {
          type: 'tool_result',
          tool: toolCall.functionName,
          provider: toolCall.functionName,
          error: errMsg,
        }
      }
    }

    yield { type: 'status', text: 'Analyzing results...' }
  }

  // Max rounds exceeded
  const sources = [...new Set(allToolResults.map(r => r.provider).filter(Boolean))] as string[]
  yield { type: 'done', sources, toolResults: allToolResults }
}
