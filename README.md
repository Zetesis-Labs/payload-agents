# PayloadAgents

Open-source [Payload CMS](https://payloadcms.com) plugins for **semantic search, RAG-powered chat, taxonomy management, and content rendering** — extracted from [Zetesis Portal](https://zetesis.xyz), a production platform that turns organizational knowledge into accessible, AI-powered experiences.

> **ζήτησις** (zḗtēsis) — _inquiry_. Zetesis builds systems that make company expertise searchable and conversational through semantic search, AI agents, and structured content. These packages are the open-source core of that work.

## Packages

| Package | Description |
|---------|-------------|
| [`@zetesis/payload-indexer`](packages/payload-indexer) | Collection sync & embedding pipeline — hooks into Payload lifecycle to extract, chunk, embed, and push documents to a search backend |
| [`@zetesis/payload-typesense`](packages/payload-typesense) | Typesense adapter with search endpoints, vector/hybrid search, and RAG chat integration |
| [`@zetesis/payload-taxonomies`](packages/payload-taxonomies) | Hierarchical taxonomies with breadcrumb navigation and relationship field builders |
| [`@zetesis/payload-lexical-blocks-builder`](packages/payload-lexical-blocks-builder) | Lexical editor blocks builder & server-side renderer |
| [`@zetesis/chat-agent`](packages/chat-agent) | Floating chat UI with streaming responses, session management, and agent selection |

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org) 22+
- [pnpm](https://pnpm.io) 10+
- [Docker](https://www.docker.com) (for PostgreSQL & Typesense)

### Option A — Dev Container (recommended)

The repo includes a full Dev Container setup with PostgreSQL, Typesense, and all tooling pre-configured.

1. Open the repo in VS Code / Cursor
2. **Reopen in Container** when prompted (or via the command palette)
3. Copy the env file and add your API keys:

   ```bash
   cp apps/server/.env.example apps/server/.env
   # Edit .env and set OPENAI_API_KEY (required for embeddings)
   ```

4. Start the dev server:

   ```bash
   cd apps/server
   pnpm run dev
   ```

5. Open [localhost:3000](http://localhost:3000) for the playground or [localhost:3000/admin](http://localhost:3000/admin) for the Payload admin panel.

### Option B — Manual setup

1. **Clone & install:**

   ```bash
   git clone https://github.com/Zetesis-Labs/PayloadAgents.git
   cd PayloadAgents
   pnpm install
   ```

2. **Start infrastructure** (PostgreSQL + Typesense):

   ```bash
   docker compose -f .devcontainer/docker-compose.yml up -d db typesense
   ```

3. **Configure environment:**

   ```bash
   cp apps/server/.env.example apps/server/.env
   ```

   Edit `apps/server/.env` and set:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `DATABASE_URL` | Yes | PostgreSQL connection string |
   | `PAYLOAD_SECRET` | Yes | Secret for Payload auth |
   | `TYPESENSE_API_KEY` | Yes | Typesense API key (default: `xyz` for local dev) |
   | `TYPESENSE_HOST` | Yes | Typesense host (default: `localhost`) |
   | `TYPESENSE_PORT` | Yes | Typesense port (default: `8108`) |
   | `OPENAI_API_KEY` | Yes | OpenAI key for generating embeddings |

4. **Run:**

   ```bash
   cd apps/server
   pnpm run dev
   ```

## Project structure

```
PayloadAgents/
├── apps/
│   └── server/          # Payload CMS playground (Next.js)
├── packages/
│   ├── payload-indexer/
│   ├── payload-typesense/
│   ├── payload-taxonomies/
│   ├── payload-lexical-blocks-builder/
│   └── chat-agent/
├── .devcontainer/       # Dev Container (Docker Compose + Dockerfile)
└── docs/                # Architecture docs & decision records
```

## Commands

```bash
# Dev server
cd apps/server && pnpm run dev

# Build all packages
pnpm build

# Type-check (solution-style)
pnpm tsc --noEmit

# Lint
pnpm lint

# Lint with autofix
pnpm lint:fix

# Test
pnpm test
```

## Architecture

This is a **pnpm workspaces + Turborepo** monorepo. Packages are compiled in **type isolation** — they don't depend on any app-level `payload-types.ts`, making them truly portable.

Key design decisions are documented in [`docs/architecture/`](docs/architecture/):

- [TypeScript monorepo type isolation](docs/architecture/typescript-monorepo-types.md)
- [Payload cast patterns](docs/architecture/payload-cast-patterns.md)
- [npm publishability](docs/architecture/npm-publishability.md)

## Contributing

- **ESM only** — all packages use `"type": "module"`
- **Biome** for linting and formatting
- **Conventional commits** in English
- **Changeset required** — run `pnpm changeset` before opening a PR

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built by [Zetesis](https://zetesis.xyz)
