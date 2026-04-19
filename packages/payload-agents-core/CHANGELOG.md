# @zetesis/payload-agents-core

## 0.3.0

### Minor Changes

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`67b6f1b`](https://github.com/Zetesis-Labs/PayloadAgents/commit/67b6f1b404b445646028b481aaaaf1db89d0fd5c) Thanks [@Fiser12](https://github.com/Fiser12)! - Drop `reloadAgents` client and the chat endpoint's self-heal retry.

  The helper only reached a single replica via the K8s Service round-robin; the chat endpoint used it as a best-effort retry when the runtime returned 404 for an unknown slug. With the Agents collection hooks now broadcasting reloads via Postgres `NOTIFY agent_reload` (plus the 5-minute periodic resync), every replica stays fresh and the retry dance was solving a problem that no longer exists.

  Removed:

  - `reloadAgents(runtimeUrl, runtimeSecret)` client function and its `ReloadResult` type.
  - `callWithRetry` / `retryAfterReload` internals in the chat endpoint (replaced by `callRuntimeOnce`).

  `runtimeFetch` stays — still used by the chat endpoint to reach `/agents/{slug}/runs`. The runtime's `POST /internal/agents/reload` HTTP endpoint is also kept for manual `curl` debugging.

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`7b393c1`](https://github.com/Zetesis-Labs/PayloadAgents/commit/7b393c1e4a4f78a169f8197521a477068addcf8c) Thanks [@Fiser12](https://github.com/Fiser12)! - Make `mediaCollectionSlug` and `taxonomyCollectionSlug` required on `agentPlugin()`.

  The previous defaults (`'media'` and `'taxonomy'`) matched the conventions we use, but hid a footgun: if a consumer renamed either collection, the Agents' `avatar` upload and `taxonomies` relationship broke silently — no error at boot, just empty references on every write.

  Both fields are now required in `AgentPluginConfig`, and the plugin validates at registration time that each referenced slug is present in the Payload config, throwing with a clear `[agent-plugin] collection "…" referenced by …CollectionSlug is not registered` if you try to boot without them.

  **Migration** — set the slugs explicitly in your plugin config. If you were relying on the defaults the values stay the same:

  ```ts
  agentPlugin({
    runtimeUrl: "…",
    mediaCollectionSlug: "media",
    taxonomyCollectionSlug: "taxonomy",
    // …
  });
  ```

### Patch Changes

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`46eba87`](https://github.com/Zetesis-Labs/PayloadAgents/commit/46eba8763d704aee593945b789e5d2a18406d62d) Thanks [@Fiser12](https://github.com/Fiser12)! - `multiTenantSessionStrategy`: `extractTenantId` now receives `(user, req)` instead of `(user)`.

  The previous signature couldn't read request state (cookies, headers, subdomain), which made the helper unable to reflect a cookie-driven active tenant — it would silently fall back to `user.tenants[0]` and tag sessions with the wrong tenant.

  **Migration** — add the `req` parameter to your extractor. If you only need the user object, just ignore `req`:

  ```ts
  // before
  multiTenantSessionStrategy({
    extractTenantId: (user) => user.tenants?.[0]?.tenant,
  });

  // after
  multiTenantSessionStrategy({
    extractTenantId: (user, req) => user.tenants?.[0]?.tenant,
  });
  ```

  Apps that resolve the active tenant from the `payload-tenant` cookie can now do so directly:

  ```ts
  import { getTenantFromCookie } from "@payloadcms/plugin-multi-tenant/utilities";

  multiTenantSessionStrategy({
    extractTenantId: (user, req) =>
      getTenantFromCookie(req.headers, req.payload.db.defaultIDType) ??
      (
        user.tenants as Array<{ tenant: number | { id: number } }> | undefined
      )?.[0]?.tenant,
  });
  ```

- [#21](https://github.com/Zetesis-Labs/PayloadAgents/pull/21) [`5bfeab7`](https://github.com/Zetesis-Labs/PayloadAgents/commit/5bfeab7103caca78633aa57d23e6f5c0267949d0) Thanks [@Fiser12](https://github.com/Fiser12)! - Fan out agent reloads to every runtime replica via Postgres `LISTEN/NOTIFY`.

  The Agents collection hooks used to `POST /internal/agents/reload` at the runtime Service, which K8s round-robins to a single pod — other replicas kept serving stale config until their next restart. Now `afterChange`/`afterDelete` issue `pg_notify('agent_reload', slug)` via Payload's drizzle handle and the runtime service listens on the channel, so every pod refreshes in lockstep.

  The HTTP `/internal/agents/reload` endpoint and the `reloadAgents` client helper stay for manual triggering and for the chat endpoint's best-effort self-heal retry — the fan-out bug only affected the automatic hook path.

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
