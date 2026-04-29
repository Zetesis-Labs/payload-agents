---
'@zetesis/payload-agents-core': patch
---

Self-heal `agno_sessions.metadata.tenant_id` from `validateSessionOwnership`. Agno (>=2.5) only persists the agent's static `metadata` field on the session row and ignores the per-run `metadata=` kwarg, so the runtime's `X-Tenant-Id` forwarding never reached `agno_sessions.metadata` and every continuation/history/rename/delete on a multi-tenant deploy returned `Forbidden`. The strategy now back-fills `metadata.tenant_id` the first time it sees a session whose `user_id` matches but `metadata.tenant_id` is null. The UPDATE casts the bound parameter to `::text` (otherwise pg can't infer `jsonb_build_object`'s anyelement arg type) and normalizes `metadata` via `jsonb_typeof` before merging (otherwise `'null'::jsonb || object` wraps both into an array).
