# payload-worker

Default consumer of [`payload-worker-builder`](../payload-worker-builder/). Lives in the workspace as a thin wrapper that loads env vars into a `RuntimeConfig` and exposes:

* `payload_worker.main:app` — FastAPI HTTP kicker (uvicorn)
* `payload_worker.main:broker` — taskiq broker (taskiq worker CLI)

## Run

```bash
# Inside the devcontainer (or VS Code launch.json compound):
[ -f .env ] || cp .env.example .env
uv sync --all-packages

uvicorn payload_worker.main:app --host 0.0.0.0 --port 8001    # HTTP kicker
taskiq worker payload_worker.main:broker                       # consumer
```

## Env

| Var | Required | What it is |
|---|---|---|
| `REDIS_URL` | yes | e.g. `redis://redis:6379` |
| `PAYLOAD_URL` | yes | base URL of the Payload API (`http://app:3000` in the devcontainer) |
| `PAYLOAD_SERVICE_TOKEN` | yes | Bearer token with write access to the documents collection |
| `LLAMA_CLOUD_API_KEY` | yes | LlamaCloud API key |
| `INTERNAL_SECRET` | yes | shared secret with apps/server (X-Internal-Secret) |
| `DOCUMENTS_COLLECTION_SLUG` | no | defaults to `documents` |
| `LOG_LEVEL` | no | defaults to `INFO` |
