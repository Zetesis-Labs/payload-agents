---
'@zetesis/payload-agents-core': patch
---

Fan out agent reloads to every runtime replica via Postgres `LISTEN/NOTIFY`.

The Agents collection hooks used to `POST /internal/agents/reload` at the runtime Service, which K8s round-robins to a single pod — other replicas kept serving stale config until their next restart. Now `afterChange`/`afterDelete` issue `pg_notify('agent_reload', slug)` via Payload's drizzle handle and the runtime service listens on the channel, so every pod refreshes in lockstep.

The HTTP `/internal/agents/reload` endpoint and the `reloadAgents` client helper stay for manual triggering and for the chat endpoint's best-effort self-heal retry — the fan-out bug only affected the automatic hook path.
