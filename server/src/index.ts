// ═══════════════════════════════════════════════════════════════
// Argus Server — Entry Point
// ═══════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../../.env') })
import express from 'express'
import cors from 'cors'
import { apiRouter } from './routes/api.js'
import { initDatabase } from './lib/db/database.js'
import { loadBuiltinAdapters } from './lib/adapters/index.js'

const app = express()
const PORT = parseInt(process.env.PORT || '3100', 10)

// ─── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: process.env.UI_ORIGIN || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))

// ─── Initialize ─────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════╗
║          ARGUS OSINT PLATFORM            ║
║       Open Agentic Intelligence          ║
╚══════════════════════════════════════════╝
`)

initDatabase()
loadBuiltinAdapters()

// ─── Routes ─────────────────────────────────────────────────
app.use('/api', apiRouter)

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Argus running at http://localhost:${PORT}`)
  console.log(`         API: http://localhost:${PORT}/api/health\n`)
})
