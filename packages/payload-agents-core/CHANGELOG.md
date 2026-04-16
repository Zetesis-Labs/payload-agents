# @zetesis/payload-agents-core

## 0.2.2

### Patch Changes

- [#18](https://github.com/Zetesis-Labs/PayloadAgents/pull/18) [`4b371b1`](https://github.com/Zetesis-Labs/PayloadAgents/commit/4b371b1824c5ed87991eacba99a144d295e3b698) Thanks [@Fiser12](https://github.com/Fiser12)! - Decouple tenancy from the plugin core. The plugin no longer assumes a specific multi-tenant shape — consumers now define how session IDs are built, validated, and how the Agents collection is filtered.

  **Breaking changes:**

  - Removed `extractTenantId` config option.
  - Removed `AgentsCollectionOverrides` type and the partial-merge semantics of `collectionOverrides`.
  - Removed `createSessionId`, `parseSessionId`, `validateSessionOwnership` exports and the `SessionIdParts` type. Removed `defaultExtractTenantId`.
  - `agentPlugin` no longer auto-filters agent queries by tenant. The default `/agents` list endpoint returns every active agent unless the consumer adds an `access.read` rule via `collectionOverrides`. Both `/agents` and `/chat` invoke the collection's `access.read` rule (calls use `overrideAccess: false` + `req`), so any rule added via `collectionOverrides` is enforced.

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
    extractTenantId: (user) =>
      String(user.tenants?.[0]?.tenant?.id ?? "default"),
    collectionOverrides: {
      access: { create: isAdmin, update: isAdmin, delete: isAdmin },
    },
  });

  // After
  agentPlugin({
    ...multiTenantSessionStrategy({
      extractTenantId: (user) => user.tenants?.[0]?.tenant?.id,
    }),
    collectionOverrides: (current) => ({
      ...current,
      access: {
        ...current.access,
        create: isAdmin,
        update: isAdmin,
        delete: isAdmin,
      },
    }),
  });
  ```

- [#17](https://github.com/Zetesis-Labs/PayloadAgents/pull/17) [`9e18fdf`](https://github.com/Zetesis-Labs/PayloadAgents/commit/9e18fdff2a213fcb738a54c30a4081dd869c9a91) Thanks [@Fiser12](https://github.com/Fiser12)! - Realistic token estimation using cost-weighted effective tokens (cached input at 25%, output weighted by model pricing ratio). Add cost-calculator module with per-model pricing tables, estimateRunCost, effectiveTokens, and costBreakdown functions.

## 0.2.1

### Patch Changes

- [#12](https://github.com/Zetesis-Labs/PayloadAgents/pull/12) [`b622d37`](https://github.com/Zetesis-Labs/PayloadAgents/commit/b622d37f7ecc738a1342d5942e553697b64c8c67) Thanks [@Fiser12](https://github.com/Fiser12)! - Add X-Internal-Secret authentication to all runtime requests. Previously only the reload endpoint was authenticated; now all proxy calls (chat, sessions) include the header and the Python runtime rejects unauthenticated requests.

- [#11](https://github.com/Zetesis-Labs/PayloadAgents/pull/11) [`a64978b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/a64978bc45113f8363d68c820a7d247e46b51380) Thanks [@Fiser12](https://github.com/Fiser12)! - Validate session ID ownership on all chat endpoints. Prevents cross-tenant session access and session hijacking via user-controlled chatId.

- [#13](https://github.com/Zetesis-Labs/PayloadAgents/pull/13) [`1efcdb9`](https://github.com/Zetesis-Labs/PayloadAgents/commit/1efcdb9756b7350f4b2ae5a05961318f3e1d0b4e) Thanks [@Fiser12](https://github.com/Fiser12)! - Cap the `limit` query parameter on the sessions list endpoint to a maximum of 100, preventing unbounded upstream queries.

- [#15](https://github.com/Zetesis-Labs/PayloadAgents/pull/15) [`de24471`](https://github.com/Zetesis-Labs/PayloadAgents/commit/de24471d1826075e17a2e4a8011d67a5e1268a84) Thanks [@Fiser12](https://github.com/Fiser12)! - Warn on empty runtimeSecret at plugin init. Use conservative token estimate (message/3 + 2000 overhead) instead of message/4.

## 0.2.0

### Minor Changes

- [#10](https://github.com/Zetesis-Labs/PayloadAgents/pull/10) [`670062b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/670062b0f4928a36db8f60b83ff584320d3b19ad) Thanks [@Fiser12](https://github.com/Fiser12)! - added use of agno as main agent system
