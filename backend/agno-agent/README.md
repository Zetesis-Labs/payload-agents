# agent-runtime

Zetesis Portal chat runtime built on [Agno](https://docs.agno.com). Replaces the
experimental ZeroClaw pod-per-agent runtime with a single shared Python/FastAPI
service that isolates users natively via `user_id` / `session_id` and persists
history in the existing Payload Postgres (schema `agno`).

## Layout

```
agno_agent/
├── main.py       # FastAPI app, /agents/{slug}/run SSE, /internal/agents/reload
├── registry.py   # Loads Agents from Payload → builds agno.Agent per slug
├── config.py     # pydantic-settings env config
└── health.py     # /health, /ready probes
```

## Environment variables

| Var | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string (same cluster as Payload) |
| `DATABASE_SCHEMA` | no | `agno` | Schema used by Agno for sessions/runs tables |
| `PAYLOAD_URL` | no | `http://app:3000` | Base URL to fetch agent definitions from |
| `PAYLOAD_SERVICE_TOKEN` | no | — | Bearer token for Payload REST API (required in prod) |
| `MCP_URL` | no | `http://app:3000/api/search/mcp` | MCP Typesense endpoint |
| `INTERNAL_SECRET` | no | `dev` | Shared secret for `/internal/agents/reload` |
| `LOG_LEVEL` | no | `INFO` | Python logging level |
| `ANTHROPIC_API_KEY` | no | — | Fallback API key (per-agent keys in Payload take precedence) |

## Run locally

```bash
cd payload-agents/services/agent-runtime
uv sync
DATABASE_URL=postgres://... uv run uvicorn agno_agent.main:app --reload
```

## Build image

```bash
cd payload-agents/services/agent-runtime
docker build -t ghcr.io/zetesis-labs/zetesis-portal-agent-runtime:dev .
```

## Endpoints

### `POST /agents/{slug}/run`

Streaming SSE. Consumed by Next.js `/api/chat` as a pure passthrough — the
browser receives the upstream body 1:1.

```jsonc
// request body
{ "message": "hola", "user_id": "42", "session_id": "t1:42:abc" }
```

### `POST /internal/agents/reload`

Refreshes the in-memory registry from Payload. Called by Payload
`afterChange`/`afterDelete` hooks on the Agents collection.

```bash
curl -X POST http://localhost:8000/internal/agents/reload \
  -H "X-Internal-Secret: $INTERNAL_SECRET"
```

### `GET /health` / `GET /ready`

Kubelet probes.

## Registry model

`AgentRegistry.load_all()` hits `GET /api/agents?where[isActive][equals]=true`
against Payload, builds one `agno.Agent` per doc, and stashes them in a dict
keyed by `slug`. Every agent shares a single `PostgresDb` instance pointed at
the `agno` schema. Claude API keys are read from the Payload doc's decrypted
`apiKey` field (per-agent).

Only the `anthropic` provider is supported in v1. The Agents collection defaults
to `openai/gpt-4o-mini` — set it to `anthropic/claude-sonnet-4-6` or similar
before the agent is marked active.

## Multi-tenancy

The caller is responsible for constructing a composite `session_id` of the form
`{tenant_id}:{user_id}:{conv_id}`. Agno partitions session state on that key,
so two tenants hitting the same agent slug never see each other's history.

## Observability

Agno emits OpenTelemetry spans when `telemetry=False` is set at the `Agent` level
(this disables phoning home to `os.agno.com` but keeps local OTel). Point the
cluster's OTel collector at the service to collect `agent.run`, `llm.anthropic`
and `tool.mcp_*` spans.
