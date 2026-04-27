// ═══════════════════════════════════════════════════════════════
// Argus LLM Provider — Multi-provider abstraction
// Kimi-K2 (default), OpenAI, Ollama
// ═══════════════════════════════════════════════════════════════

import OpenAI from 'openai'
import type { LLMConfig, LLMMessage, LLMProvider, LLMTool } from '@argus/shared'

// Provider configurations with their base URLs and default models
const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string; model: string; apiKeyEnv: string }> = {
  'kimi-k2': {
    baseUrl: 'https://api.moonshot.ai/v1',
    model: 'kimi-k2.6',
    apiKeyEnv: 'MOONSHOT_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3',
    apiKeyEnv: '',
  },
}

export type ChatCompletionResult = {
  content: string
  toolCalls?: Array<{
    id: string
    functionName: string
    arguments: Record<string, unknown>
  }>
  finishReason: string
}

export class LLMClient {
  private client: OpenAI
  private model: string
  private provider: LLMProvider

  constructor(config?: LLMConfig) {
    const provider = config?.provider || (process.env.LLM_PROVIDER as LLMProvider) || 'kimi-k2'
    const defaults = PROVIDER_DEFAULTS[provider]

    if (!defaults) {
      throw new Error(`Unknown LLM provider: ${provider}. Supported: ${Object.keys(PROVIDER_DEFAULTS).join(', ')}`)
    }

    const apiKey = config?.apiKey || process.env[defaults.apiKeyEnv] || (provider === 'ollama' ? 'ollama' : '')
    const baseURL = config?.baseUrl || process.env.OPENAI_BASE_URL || defaults.baseUrl
    this.model = config?.model || process.env.OPENAI_MODEL || process.env.LLM_MODEL || defaults.model
    this.provider = provider

    if (!apiKey && provider !== 'ollama') {
      console.warn(`[warn] No API key found for ${provider}. Set ${defaults.apiKeyEnv} in your .env file.`)
    }

    this.client = new OpenAI({
      apiKey: apiKey || 'not-set',
      baseURL,
    })

    console.log(`[llm] Provider: ${provider} (${this.model}) -> ${baseURL}`)
  }

  get providerName(): LLMProvider {
    return this.provider
  }

  async chat(
    messages: LLMMessage[],
    options?: {
      tools?: LLMTool[]
      temperature?: number
      maxTokens?: number
    }
  ): Promise<ChatCompletionResult> {
    try {
      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model: this.model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: this.provider === 'kimi-k2' ? 0.6 : (options?.temperature ?? 0.7),
        max_tokens: options?.maxTokens ?? 4096,
      }

      if (options?.tools && options.tools.length > 0) {
        params.tools = options.tools as OpenAI.Chat.Completions.ChatCompletionTool[]
        params.tool_choice = 'auto'
      }
      // Kimi-K2 has reasoning/thinking enabled by default which conflicts
      // with tool calling. Disable it explicitly.
      if (this.provider === 'kimi-k2') {
        (params as unknown as Record<string, unknown>).thinking = { type: 'disabled' }
      }

      const response = await this.client.chat.completions.create(params)
      const choice = response.choices[0]

      if (!choice) {
        return { content: 'No response generated.', finishReason: 'error' }
      }

      const toolCalls = choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        functionName: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }))

      return {
        content: choice.message.content || '',
        toolCalls,
        finishReason: choice.finish_reason || 'stop',
      }
    } catch (error) {
      const err = error as Error
      console.error(`[error] LLM error (${this.provider}):`, err.message)
      throw new Error(`LLM request failed: ${err.message}`)
    }
  }

  async chatStream(
    messages: LLMMessage[],
    options?: {
      tools?: LLMTool[]
      temperature?: number
      maxTokens?: number
    }
  ): Promise<AsyncGenerator<{ type: 'content' | 'tool_call' | 'done'; data: string }>> {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: this.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    }

    if (options?.tools && options.tools.length > 0) {
      params.tools = options.tools as OpenAI.Chat.Completions.ChatCompletionTool[]
      params.tool_choice = 'auto'
    }

    const stream = await this.client.chat.completions.create(params)

    async function* generate() {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta
        if (delta?.content) {
          yield { type: 'content' as const, data: delta.content }
        }
        if (chunk.choices[0]?.finish_reason) {
          yield { type: 'done' as const, data: chunk.choices[0].finish_reason }
        }
      }
    }

    return generate()
  }
}

// Singleton instance
let _client: LLMClient | null = null

export function getLLMClient(): LLMClient {
  if (!_client) {
    _client = new LLMClient()
  }
  return _client
}
