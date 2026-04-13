---
"@zetesis/payload-agents-core": patch
---

Read active tenant from payload-tenant cookie instead of always using the first tenant in the user's array. Fixes agents not appearing for multi-tenant users.
