---
'@zetesis/payload-agents-core': minor
---

Drop `reloadAgents` client and the chat endpoint's self-heal retry.

The helper only reached a single replica via the K8s Service round-robin; the chat endpoint used it as a best-effort retry when the runtime returned 404 for an unknown slug. With the Agents collection hooks now broadcasting reloads via Postgres `NOTIFY agent_reload` (plus the 5-minute periodic resync), every replica stays fresh and the retry dance was solving a problem that no longer exists.

Removed:

- `reloadAgents(runtimeUrl, runtimeSecret)` client function and its `ReloadResult` type.
- `callWithRetry` / `retryAfterReload` internals in the chat endpoint (replaced by `callRuntimeOnce`).

`runtimeFetch` stays — still used by the chat endpoint to reach `/agents/{slug}/runs`. The runtime's `POST /internal/agents/reload` HTTP endpoint is also kept for manual `curl` debugging.
