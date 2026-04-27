<div align="center">

<img src=".github/assets/stratir-logo.svg" alt="Stratir" width="80" />

<br/>

<img src=".github/assets/argus-icon.svg" alt="Argus" width="120" />

# Argus

### Open-Source Intelligence Orchestration for Zero-Human Operations

*Autonomous OSINT investigations powered by agentic AI — thorough, persistent, self-directed.*

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Kimi-K2](https://img.shields.io/badge/default%20LLM-Kimi%20K2-00D4FF.svg)](https://moonshot.ai)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick Start](#quick-start) · [Adapters](#intelligence-adapters) · [Architecture](#architecture) · [Roadmap](#roadmap) · [Contributing](#contributing)

</div>

---

<br/>

> **Argus** is a tool and all-source intelligence assistant built by [Stratir](https://stratir.com), operating as part of the **Vanguard** faction on [Limitless-OSINT](https://limitless-osint.com) — Stratir's educational intelligence platform.

<br/>

## Overview

Argus is an open-source intelligence orchestration platform that coordinates AI agents to conduct thorough, multi-source investigations autonomously. Ask a question in natural language — Argus plans the investigation, selects and executes the right OSINT tools, cross-references findings across sources, scores confidence, and delivers structured intelligence reports with full provenance.

No manual tool selection. No copy-pasting between services. No analyst fatigue. Just results.

<br/>

## What Makes Argus Different

- **Agentic Investigation Loop** — The agent autonomously plans, executes, and iterates across multiple OSINT tools until the investigation is thorough, running up to 5 rounds of tool calls per query with full parallel execution.

- **Pluggable Adapter System** — Six built-in intelligence adapters with a documented plugin interface for community extensions. One file, one interface, auto-registered as an LLM tool.

- **Source Cross-Referencing** — Findings from WHOIS, DNS, GeoIP, Web Search, Shodan, and Web Scraping are correlated automatically, with discrepancies flagged and confidence levels assigned.

- **Self-Hosted and Air-Gappable** — Your investigations stay on your machine. Zero cloud dependencies. SQLite persistence. Complete operational security.

- **Multi-Provider LLM** — Kimi-K2 (default), OpenAI, or fully local Ollama — all via a unified OpenAI-compatible interface. Bring your own key, pick your provider.

- **Premium Analyst UI** — Dark and light themes, research modes (Standard, Deep, Due Diligence), animated investigation states, and session management.

<br/>

## Architecture

```
                              ARGUS ORCHESTRATION SERVER

 ┌────────────┐     ┌──────────────────────────────────────────────┐
 │   React UI │────>│                                              │     ┌─────────────┐
 │   (Vite)   │<────│   Agent Runner ──── LLM Provider             │────>│ Kimi-K2     │
 │            │     │   (agentic loop)    (OpenAI SDK)             │     │ GPT-4o      │
 │  Sidebar   │     │        │                                     │     │ Ollama      │
 │  Messages  │     │        v                                     │     └─────────────┘
 │  Input     │     │   ┌──────────────────────────────────────┐   │
 │  Themes    │     │   │       INTELLIGENCE ADAPTERS           │   │
 └────────────┘     │   │  WHOIS  DNS  GeoIP  Web Search       │   │
                    │   │  Shodan  Web Scraper  OSINT Ind.      │   │
                    │   └──────────────────────────────────────┘   │
                    │                                              │
                    │   SQLite DB ──── Session Management           │
                    │   (messages, sessions, API keys, audit)      │
                    └──────────────────────────────────────────────┘
```

The agent runner orchestrates the full intelligence cycle: it receives a natural language query, builds a dynamic system prompt from all registered adapters, invokes the LLM with tool definitions, executes the LLM's chosen tools in parallel, feeds results back, and repeats until the investigation is complete.

<br/>

## Quick Start

### Prerequisites

- **Node.js** 20+
- **pnpm** (`npm install -g pnpm`)
- An LLM API key — Kimi-K2 recommended ([get one free](https://platform.moonshot.ai))

### Setup

```bash
git clone https://github.com/AXRoux/argus-os.git
cd argus-os

cp .env.example .env
# Edit .env and add your MOONSHOT_API_KEY (or any supported provider)

pnpm install
pnpm dev
```

The UI opens at **http://localhost:3000** and the API server runs on **http://localhost:3100**.

<br/>

## Intelligence Adapters

| Adapter | Entity Types | API Key | Source |
|---------|-------------|---------|--------|
| **WHOIS** | `domain` | No | RDAP Protocol |
| **DNS** | `domain` | No | Node.js native resolver |
| **GeoIP** | `ip` | No | ip-api.com |
| **Web Search** | `domain`, `ip`, `email`, `person`, `query` | No | DuckDuckGo |
| **Web Scraper** | `domain`, `url`, `query` | No | Stealth fetch |
| **Shodan** | `ip`, `domain` | BYOK | shodan.io |
| **OSINT Industries** | `email`, `person` | BYOK | osint.industries |

> **Writing your own adapter?** See the [Adapter Authoring Guide](docs/adapters/README.md) — one file, one interface, auto-registered as an LLM tool.

<br/>

## LLM Providers

All providers use the OpenAI SDK — they each expose OpenAI-compatible APIs.

| Provider | Default Model | Configuration |
|----------|--------------|---------------|
| **Kimi-K2** (default) | `kimi-k2.6` | `MOONSHOT_API_KEY` |
| OpenAI | `gpt-4o` | `OPENAI_API_KEY` |
| Ollama (local) | `llama3` | No key needed |

Set `LLM_PROVIDER` in `.env` to switch providers.

<br/>

## Research Modes

| Mode | Thoroughness | Use Case |
|------|-------------|----------|
| **Standard** | Quick single-pass | Fast lookups, simple questions |
| **Deep Research** | Multi-source cross-referencing | Domain investigations, threat analysis |
| **Due Diligence** | Exhaustive multi-round | Vendor screening, M&A intelligence, compliance |

<br/>

## Project Structure

```
argus/
├── packages/
│   └── shared/            # TypeScript types — adapters, messages, tools
├── server/
│   └── src/
│       ├── lib/
│       │   ├── llm/       # Multi-provider LLM client (OpenAI SDK)
│       │   ├── adapters/  # OSINT adapter registry + built-in adapters
│       │   ├── db/        # SQLite persistence (sessions, messages, keys)
│       │   └── agent.ts   # Agentic function-calling loop
│       ├── routes/         # Express API routes
│       └── index.ts        # Server entry point
├── ui/
│   └── src/
│       ├── components/     # React components (Sidebar, Messages, Input, Settings)
│       ├── styles/         # CSS design system (dark/light themes)
│       └── lib/            # API client
├── docs/
│   └── adapters/           # Adapter authoring guide
├── .env.example            # Configuration template (all secrets are placeholder)
└── CONTRIBUTING.md         # Contributor guidelines
```

<br/>

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server status, active provider, adapter count |
| `/api/chat` | POST | Send investigation query, receive agentic response |
| `/api/chat/stream` | POST | Streaming investigation with SSE events |
| `/api/sessions` | GET | List all investigation sessions |
| `/api/sessions` | POST | Create new session |
| `/api/sessions/:id` | PATCH | Rename session |
| `/api/sessions/:id` | DELETE | Delete session and associated messages |
| `/api/sessions/:id/messages` | GET | Retrieve session messages with tool results |
| `/api/adapters` | GET | List available intelligence adapters with status |

<br/>

## Roadmap

### Completed

- Agentic function-calling loop with multi-round tool execution
- Pluggable adapter system with auto-tool registration
- Stealth web scraping with anti-detection headers
- Multi-provider LLM support (Kimi-K2, OpenAI, Ollama)
- SQLite session persistence with BYOK key management
- Streaming SSE responses with real-time investigation status

### In Progress

- **Runtime Plugin Discovery** — Load adapters from external npm packages at startup without modifying core source. Drop a package into a `plugins/` directory and Argus picks it up automatically.
- **Adapter Test Harness** — Validate new adapters locally before contributing. Run `pnpm test:adapter <id>` to execute a standardized test suite against any registered adapter.
- **Adapter Scaffold CLI** — Generate adapter boilerplate with a single command: `npx argus create-adapter <name>`.

### Planned

- **Investigation Lifecycle** — Persistent investigations with checkpoints and resume capability
- **Continuous Monitoring** — Scheduled surveillance routines on watched entities
- **Confidence Scoring** — Multi-source corroboration engine with explicit confidence levels
- **Intelligence Audit Trail** — Full provenance chain for every finding
- **Token and Cost Tracking** — Per-investigation budget controls and spend visibility
- **Investigation Export** — Structured dossier export in PDF, JSON, and Markdown
- **Analyst Teams** — Multiple specialized agents (SIGINT, HUMINT, Cyber, Financial)
- **MCP Server** — Expose Argus as a tool for other AI systems

<br/>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. The easiest way to contribute is writing a new intelligence adapter — the [Adapter Authoring Guide](docs/adapters/README.md) walks through the process from interface to registration.

<br/>

## License

[MIT](LICENSE) — use it however you want.

<br/>

---

<div align="center">

**Built by [Stratir](https://stratir.com)**

Part of the Vanguard faction on [Limitless-OSINT](https://limitless-osint.com)

*Open-source intelligence orchestration. No analysts required.*

</div>
