---
'@zetesis/payload-agents-metrics': patch
---

Fix `/llm-usage/sessions` 500 caused by a malformed `text[]` parameter.

`batchFetchFirstMessages` was rewritten in 0.1.1 to use `session_id = ANY($1::text[])`. With drizzle-orm + node-postgres the JS array is bound as a single string parameter, so Postgres receives e.g. `"af571d36-..."` and fails the `::text[]` cast with "malformed array literal". Switched to `session_id IN (...)` expanded via `sql.join`, which emits one parameterised placeholder per id and uses the session_id index just as well as the original OR list.
