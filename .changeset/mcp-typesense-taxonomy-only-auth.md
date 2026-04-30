---
'@zetesis/mcp-typesense': patch
---

Allow taxonomy-only auth contexts. The header strategy used to discard the entire context whenever `x-tenant-slug` was missing, even if `x-taxonomy-slugs` was present. Single-tenant deploys (no tenant header) couldn't auto-scope by taxonomy at all. Now `resolveAuth` returns a context whenever at least one of the two headers is present and `tenantSlug` becomes optional in the resolved object. Multi-tenant deploys keep working unchanged because they always send both headers.
