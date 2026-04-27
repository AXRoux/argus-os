# Contributing to Argus

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/stratir/argus.git
cd argus
cp .env.example .env
# Add your LLM API key to .env
pnpm install
pnpm dev
```

The server runs on `http://localhost:3100` and the UI on `http://localhost:3000`.

## Project Structure

- `packages/shared/` — Shared TypeScript types (ChatMessage, adapters, etc.)
- `server/` — Express backend with LLM orchestration and OSINT adapters
- `ui/` — React frontend (Vite)

## Adding an Adapter

The easiest way to contribute is writing a new OSINT adapter. See [`docs/adapters/README.md`](docs/adapters/README.md) for a complete guide.

## Code Guidelines

- **TypeScript** everywhere — no `any` unless absolutely necessary
- **ESM only** — all packages use `"type": "module"`
- Use `camelCase` for variables/functions, `PascalCase` for types/components
- Keep adapters self-contained — one file per adapter
- No proprietary dependencies — everything must work with `pnpm install` alone

## Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-adapter`)
3. Write your code
4. Test locally with `pnpm dev`
5. Submit a PR with a clear description

## Reporting Issues

Open an issue with:
- What you expected
- What happened
- Steps to reproduce
- Your environment (OS, Node version, LLM provider)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
