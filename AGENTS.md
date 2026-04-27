# AGENTS.md — Argus Codebase Context

## Overview

Argus is an open-source agentic OSINT (Open Source Intelligence) platform. It uses an LLM with function-calling to autonomously investigate digital entities using real OSINT data sources.

## Architecture

- **Monorepo** managed by pnpm workspaces
- **Shared types** in `packages/shared/` — imported by both server and UI
- **Server** (`server/`) — Express + SQLite + OpenAI SDK for multi-provider LLM support
- **UI** (`ui/`) — Vite + React + Framer Motion

## Key Design Decisions

1. **Kimi-K2 as default LLM** — Best function-calling performance for tool-heavy workflows. All providers use the OpenAI SDK since they all expose compatible APIs.

2. **Adapter pattern** — Each OSINT source is a self-contained adapter implementing `IOSINTAdapter`. The registry converts them to LLM tool definitions automatically.

3. **Agentic loop** — `server/src/lib/agent.ts` runs a multi-round function-calling loop. The LLM selects tools, we execute them, feed results back, repeat up to 5 rounds.

4. **SQLite, not Postgres** — Zero-config persistence. The database file (`argus.db`) is created automatically in the project root.

5. **No proprietary dependencies** — No Clerk, no Convex, no Stripe. Everything works with `pnpm install`.

## Code Patterns

- All packages use ESM (`"type": "module"`)
- CSS uses custom properties for theming (see `ui/src/styles/index.css`)
- Adapters are registered in `server/src/lib/adapters/index.ts`
- API routes are in `server/src/routes/api.ts`

## Adding an Adapter

Create a new file in `server/src/lib/adapters/`, implement `IOSINTAdapter`, and register it in `index.ts`. The adapter will automatically appear as an LLM tool.
