# agno-agent-builder

Parametrizable Agno runtime as a library. Build a fully configured FastAPI app
for chat with hot-reloadable agents fetched from any source you plug in.

## Quick start

```python
from agno_agent_builder import create_app, RuntimeConfig, PayloadAgentSource

app = create_app(
    RuntimeConfig(
        app_name="my-runtime",
        agent_source=PayloadAgentSource(
            base_url="http://payload:3000",
            internal_secret="...",
        ),
        mcp_url="http://mcp:3001/mcp",
        database_url="postgresql://user:pass@host:5432/db",
        internal_secret="...",
    )
)
```

## Public API

| Symbol | Purpose |
|---|---|
| `create_app(config)` | Returns a configured FastAPI app |
| `RuntimeConfig` | Pydantic model — required + optional knobs |
| `AgentSource` | Protocol — implement `async fetch_agents() -> list[AgentConfig]` |
| `AgentConfig` | Normalized per-agent record (CMS-agnostic) |
| `PayloadAgentSource` | Default source for Payload CMS |
| `build_agent`, `build_model`, `build_mcp_tools` | Lower-level builders for advanced wiring |
| `compose_instructions`, `DEFAULT_TOOL_PROTOCOL`, `DEFAULT_OUTPUT_FORMAT` | Override-friendly prompt building blocks |

## What you get

- AgentOS REST surface (`/agents`, `/sessions`, `/metrics`, …)
- `POST /agents/{slug}/runs` SSE chat
- `/health`, `/ready` Kubernetes probes
- `POST /internal/agents/reload` admin endpoint
- Postgres `LISTEN/NOTIFY` hot reload + 5-min belt-and-braces resync
- ASGI middlewares: `X-Request-ID`, `X-Internal-Secret` auth, `X-Tenant-Id` → `request.state.metadata`

## Reference consumer

The default consumer that ships in this repo lives in
[`../agno-agent`](../agno-agent) — it wraps `create_app` with env-driven
settings and is what runs in the `agno-agent` devcontainer service. ZP and
nexus install this lib from PyPI and write their own thin consumer.
