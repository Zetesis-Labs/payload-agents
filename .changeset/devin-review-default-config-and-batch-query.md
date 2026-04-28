---
'@zetesis/payload-agents-metrics': patch
---

Address Devin review on PR #23:

- **`multiTenant` default fix** (HIGH): `metricsPlugin({})` previously resolved to `multiTenant: true` paired with `resolveTenantId: async () => null`, silently discarding every metric event. `MetricsPluginConfig` is now a discriminated union — `multiTenant: true` makes both `checkAccess` and `resolveTenantId` required at the type level; omitting `multiTenant` defaults to single-tenant mode where the callbacks aren't needed. Existing consumers that explicitly pass `multiTenant: true` with both callbacks (e.g. zetesis-portal) are unaffected at runtime; new consumers can no longer enable multi-tenant without providing a real resolver.
- **`batchFetchFirstMessages` query** (MEDIUM): replaced the chained `OR session_id = ?` predicate (one per item) with a single `session_id = ANY($1::text[])`. Keeps the index lookup efficient as `PAGE_SIZE` grows.
