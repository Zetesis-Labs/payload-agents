# agno-agent

Default reference consumer of [`agno-agent-builder`](../agno-agent-builder).
Reads env into a pydantic-settings model, builds a `RuntimeConfig` +
`PayloadAgentSource`, and hands them to `create_app(...)` to produce the
ASGI app. This is what runs inside the devcontainer's `agent-runtime`
service and what the Docker image at `backend/Dockerfile` ships.

## Run locally (devcontainer)

```bash
cd /workspace/payload-agents/backend
uv run --package agno-agent uvicorn agno_agent.main:app --host 0.0.0.0 --port 8000
```

## Environment variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres DSN (Agno session storage) |
| `INTERNAL_SECRET` | yes | — | Bypass header for `X-Internal-Secret` middleware |
| `PAYLOAD_URL` | no | `http://app:3000` | Base URL for `/api/agents` fetches |
| `PAYLOAD_SERVICE_TOKEN` | no | — | Optional bearer for Payload REST |
| `MCP_URL` | no | `http://app:3030/mcp` | MCP Typesense endpoint |
| `DATABASE_SCHEMA` | no | `agno` | Postgres schema for Agno tables |
| `LOG_LEVEL` | no | `INFO` | structlog level |
