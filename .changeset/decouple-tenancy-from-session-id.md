---
"@zetesis/payload-agents-core": patch
---

Decouple tenancy from the plugin core. The plugin no longer assumes a specific multi-tenant shape — consumers now define how session IDs are built, validated, and how the Agents collection is filtered.

**Breaking changes:**

- Removed `extractTenantId` config option.
- Removed `AgentsCollectionOverrides` type and the partial-merge semantics of `collectionOverrides`.
- Removed `createSessionId`, `parseSessionId`, `validateSessionOwnership` exports and the `SessionIdParts` type. Removed `defaultExtractTenantId`.
- `agentPlugin` no longer auto-filters agent queries by tenant. The default `/agents` list endpoint returns every active agent unless the consumer adds an `access.read` rule via `collectionOverrides`.

**New API:**

- `buildSessionId(ctx) => string | Promise<string>` — receives `{ user, agentSlug, chatId?, payload, req }` and returns the session id for the runtime. Default: `${agentSlug}:${userId}:${uuid}`.
- `validateSessionOwnership(sessionId, ctx) => boolean | Promise<boolean>` — receives `{ user, payload, req }` and decides whether the current user owns the given session. Default: `sessionId.includes(`:${userId}:`)`.
- `collectionOverrides(current) => CollectionConfig` — now a function that receives the fully generated collection and returns a new one. Spread the argument to keep the plugin's defaults and override only what you need.

**Migration helper:**

- Added `multiTenantSessionStrategy({ extractTenantId })` which returns `{ buildSessionId, validateSessionOwnership }` pre-wired so session identifiers embed the tenant boundary. Designed to pair with `@payloadcms/plugin-multi-tenant`, which already filters the Agents collection by tenant — the helper does not touch `collectionOverrides`.

**Migration example:**

```ts
// Before
agentPlugin({
  extractTenantId: user => String(user.tenants?.[0]?.tenant?.id ?? 'default'),
  collectionOverrides: {
    access: { create: isAdmin, update: isAdmin, delete: isAdmin }
  }
})

// After
agentPlugin({
  ...multiTenantSessionStrategy({
    extractTenantId: user => user.tenants?.[0]?.tenant?.id
  }),
  collectionOverrides: current => ({
    ...current,
    access: {
      ...current.access,
      create: isAdmin,
      update: isAdmin,
      delete: isAdmin,
    },
  }),
})
```
