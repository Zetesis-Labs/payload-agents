---
"@zetesis/payload-agents-core": patch
---

Cap the `limit` query parameter on the sessions list endpoint to a maximum of 100, preventing unbounded upstream queries.
