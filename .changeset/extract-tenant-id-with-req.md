---
'@zetesis/payload-agents-core': patch
---

`multiTenantSessionStrategy`: `extractTenantId` now receives `(user, req)` instead of `(user)`.

The previous signature couldn't read request state (cookies, headers, subdomain), which made the helper unable to reflect a cookie-driven active tenant — it would silently fall back to `user.tenants[0]` and tag sessions with the wrong tenant.

**Migration** — add the `req` parameter to your extractor. If you only need the user object, just ignore `req`:

```ts
// before
multiTenantSessionStrategy({
  extractTenantId: user => user.tenants?.[0]?.tenant
})

// after
multiTenantSessionStrategy({
  extractTenantId: (user, req) => user.tenants?.[0]?.tenant
})
```

Apps that resolve the active tenant from the `payload-tenant` cookie can now do so directly:

```ts
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'

multiTenantSessionStrategy({
  extractTenantId: (user, req) =>
    getTenantFromCookie(req.headers, req.payload.db.defaultIDType) ??
    (user.tenants as Array<{ tenant: number | { id: number } }> | undefined)?.[0]?.tenant
})
```
