import { Router, type Router as RouterType } from 'express'
import { runAgent, runAgentStreaming } from '../lib/agent.js'
import { registry } from '../lib/adapters/index.js'
import { getLLMClient } from '../lib/llm/client.js'
import * as db from '../lib/db/database.js'
import type { ChatRequest } from '@argus/shared'

export const apiRouter: RouterType = Router()

// ─── Health Check ────────────────────────────────────────────

apiRouter.get('/health', (_req, res) => {
  const llm = getLLMClient()
  res.json({
    status: 'ok',
    version: '0.3.0',
    provider: llm.providerName,
    adapters: registry.getConfigured().length,
    totalAdapters: registry.getAll().length,
    uptime: process.uptime(),
  })
})

// ─── Chat (Agent — synchronous) ──────────────────────────────

apiRouter.post('/chat', async (req, res) => {
  try {
    const body = req.body as ChatRequest

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({ error: 'messages array is required' })
      return
    }

    console.log(`\n[query] Investigation: "${body.messages[body.messages.length - 1]?.content?.slice(0, 80)}..."`)
    console.log(`   Mode: ${body.researchMode || 'standard'} | Focus: ${body.focusMode || 'all'}`)

    const response = await runAgent(body.messages, {
      researchMode: body.researchMode,
      focusMode: body.focusMode,
    })

    // Auto-persist to session if provided
    if (body.sessionId) {
      const userMsg = body.messages[body.messages.length - 1]
      if (userMsg) {
        db.addMessage(body.sessionId, { role: userMsg.role as 'user', content: userMsg.content })
      }
      db.addMessage(body.sessionId, {
        role: 'assistant',
        content: response.message.content,
        toolResults: response.toolResults,
        sources: response.sources,
        researchMode: response.researchMode as 'standard' | 'deep' | 'duediligence',
      })
    }

    res.json(response)
  } catch (error) {
    const err = error as Error
    console.error('[error] Chat error:', err.message)
    res.status(500).json({
      message: { role: 'assistant', content: `Error: ${err.message}` },
      error: err.message,
    })
  }
})

// ─── Chat (Agent — SSE streaming) ────────────────────────────

apiRouter.post('/chat/stream', async (req, res) => {
  const body = req.body as ChatRequest

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' })
    return
  }

  const query = body.messages[body.messages.length - 1]?.content?.slice(0, 80)
  console.log(`\n[query] Streaming: "${query}..."`)

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // Abort controller tied to client disconnect
  const controller = new AbortController()
  req.on('close', () => {
    console.log('  [stream] Client disconnected')
    controller.abort()
  })

  try {
    let fullContent = ''
    let eventCount = 0

    console.log('  [stream] Starting agent stream...')
    const stream = runAgentStreaming(body.messages, {
      researchMode: body.researchMode,
      focusMode: body.focusMode,
      signal: controller.signal,
    })

    for await (const event of stream) {
      if (controller.signal.aborted) {
        console.log('  [stream] Aborted, breaking stream loop')
        break
      }

      eventCount++
      if (event.type === 'content') {
        fullContent += event.delta
      }

      const chunk = `data: ${JSON.stringify(event)}\n\n`
      res.write(chunk)
      console.log(`  [event] #${eventCount}: ${event.type}${event.type === 'content' ? ` (${event.delta?.length || 0} chars)` : ''}`)
    }

    console.log(`  [done] Stream complete: ${eventCount} events, ${fullContent.length} chars content`)

    // Persist to session after stream completes
    if (body.sessionId && fullContent) {
      try {
        const userMsg = body.messages[body.messages.length - 1]
        if (userMsg) {
          db.addMessage(body.sessionId, { role: userMsg.role as 'user', content: userMsg.content })
        }
        db.addMessage(body.sessionId, {
          role: 'assistant',
          content: fullContent,
          researchMode: body.researchMode as 'standard' | 'deep' | 'duediligence',
        })
      } catch (dbErr) {
        console.error('  [error] DB persist error:', (dbErr as Error).message)
      }
    }
  } catch (error) {
    const err = error as Error
    console.error('[error] Stream error:', err.message, err.stack)
    if (!controller.signal.aborted) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
    }
  } finally {
    res.end()
    console.log('  [stream] Response ended')
  }
})

// ─── Sessions ────────────────────────────────────────────────

apiRouter.get('/sessions', (_req, res) => {
  const sessions = db.getSessions()
  res.json({ sessions })
})

apiRouter.post('/sessions', (req, res) => {
  const { title } = req.body as { title?: string }
  const session = db.createSession(title || 'New Investigation')
  res.status(201).json(session)
})

apiRouter.patch('/sessions/:id', (req, res) => {
  const { title } = req.body as { title?: string }
  if (title) {
    db.updateSessionTitle(req.params.id, title)
  }
  res.json({ ok: true })
})

apiRouter.delete('/sessions/:id', (req, res) => {
  db.deleteSession(req.params.id)
  res.json({ ok: true })
})

apiRouter.get('/sessions/:id/messages', (req, res) => {
  const messages = db.getMessages(req.params.id)
  res.json({ messages })
})

// ─── Adapters ────────────────────────────────────────────────

apiRouter.get('/adapters', (_req, res) => {
  res.json({ adapters: registry.getMetadata() })
})

// ─── Settings (BYOK Key Management) ─────────────────────────

/**
 * GET /api/settings
 * Returns all adapters with their metadata and configuration status.
 * Data-driven: the Settings UI renders entirely from this response.
 */
apiRouter.get('/settings', (_req, res) => {
  res.json({ adapters: registry.getDetailedMetadata() })
})

/**
 * PUT /api/settings/keys/:adapterId
 * Set or update an API key for an adapter.
 * Validates the key before saving if the adapter supports it.
 */
apiRouter.put('/settings/keys/:adapterId', async (req, res) => {
  try {
    const { adapterId } = req.params
    const { apiKey } = req.body as { apiKey?: string }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      res.status(400).json({ error: 'apiKey is required' })
      return
    }

    const adapter = registry.get(adapterId)
    if (!adapter) {
      res.status(404).json({ error: `Adapter "${adapterId}" not found` })
      return
    }

    // Validate the key first
    const isValid = await registry.validateKey(adapterId, apiKey.trim())
    if (!isValid) {
      res.status(422).json({ error: 'Invalid API key — validation failed', valid: false })
      return
    }

    // Store the key
    registry.setApiKey(adapterId, apiKey.trim())
    db.markKeyValidated(adapterId, true)

    console.log(`[settings] API key set for ${adapter.metadata.name}`)

    res.json({ ok: true, valid: true, adapterId })
  } catch (error) {
    const err = error as Error
    res.status(500).json({ error: err.message })
  }
})

/**
 * DELETE /api/settings/keys/:adapterId
 * Remove an API key for an adapter.
 */
apiRouter.delete('/settings/keys/:adapterId', (req, res) => {
  const { adapterId } = req.params
  const adapter = registry.get(adapterId)

  if (!adapter) {
    res.status(404).json({ error: `Adapter "${adapterId}" not found` })
    return
  }

  registry.removeApiKey(adapterId)
  console.log(`[settings] API key removed for ${adapter.metadata.name}`)

  res.json({ ok: true, adapterId })
})

/**
 * POST /api/settings/keys/:adapterId/validate
 * Test-fire an API key without saving it.
 */
apiRouter.post('/settings/keys/:adapterId/validate', async (req, res) => {
  try {
    const { adapterId } = req.params
    const { apiKey } = req.body as { apiKey?: string }

    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ error: 'apiKey is required', valid: false })
      return
    }

    const adapter = registry.get(adapterId)
    if (!adapter) {
      res.status(404).json({ error: `Adapter "${adapterId}" not found`, valid: false })
      return
    }

    const valid = await registry.validateKey(adapterId, apiKey.trim())
    res.json({ valid, adapterId })
  } catch (error) {
    const err = error as Error
    res.status(500).json({ error: err.message, valid: false })
  }
})
