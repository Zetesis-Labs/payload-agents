# payload-worker-builder

Parametrizable [taskiq](https://taskiq-python.github.io/) worker for Payload CMS, ready to drop into a workspace.

Provides:

- `RuntimeConfig` — pydantic config (one place for everything: DB DSN, Payload base URL, internal secret, LlamaCloud API key).
- `create_broker(config)` — Redis stream broker (via `taskiq-redis`) with smart retry middleware.
- `create_app(config)` — bundles broker + tasks + a small FastAPI HTTP "kicker" that exposes `POST /tasks/parse-document` so the Next.js side can enqueue parses without speaking the taskiq protocol directly.
- `parse_document_task` — built-in task that uploads a Payload document to LlamaParse, polls until done, and writes `parsed_text` + `parse_status` back via Payload REST.

## Usage

```python
from payload_worker_builder import RuntimeConfig, create_app
from pydantic import SecretStr

config = RuntimeConfig(
    app_name="my-worker",
    redis_url="redis://redis:6379",
    payload_url="http://app:3000",
    payload_service_token=SecretStr("..."),  # Payload API key with write access
    llama_cloud_api_key=SecretStr("..."),
    internal_secret=SecretStr("dev"),
    documents_collection_slug="documents",
)

app, broker = create_app(config)
```

Run two processes side by side:

```bash
uvicorn my_worker.main:app --host 0.0.0.0 --port 8001  # HTTP kicker
taskiq worker my_worker.main:broker                     # task consumer
```

## Architecture

```
   Next.js (Payload)               payload-worker (uvicorn)        payload-worker (taskiq)
  ─────────────────────────       ────────────────────────────    ────────────────────────────
  POST /api/documents/{id}/parse  POST /tasks/parse-document      consume `parse_document` task
   ├ stamps parse_status='queued'  ├ broker.kiq()                  ├ download file from Payload
   └ HTTP→ kicker                  └ returns 202                   ├ upload to LlamaCloud
                                                                   ├ poll status
                                                                   └ PATCH parsed_text/status
                                          │                                  │
                                          └─────────── Redis Stream ─────────┘
```

## Public API

```python
from payload_worker_builder import (
    create_app,
    create_broker,
    RuntimeConfig,
    LlamaParseClient,
    PayloadClient,
    parse_document_task,
)
```
