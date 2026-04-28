# @zetesis/payload-agents-metrics

## 0.1.1

### Patch Changes

- [#23](https://github.com/Zetesis-Labs/PayloadAgents/pull/23) [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052) Thanks [@Fiser12](https://github.com/Fiser12)! - Replace hand-rolled Agno interfaces with shared Zod schemas at the boundaries.

  **Core**: new `lib/agno-schema.ts` exposes `AgnoMessageSchema`, `AgnoRunSchema`, `AgnoSessionDetailSchema`, the inferred TS types, and three helpers (`parseAgnoSession`, `parseAgnoRuns`, `extractMessagesFromRuns`). All exported from the package root so consumers parse Agno responses through one validated boundary instead of casting their own.

  - `chat.ts` validates the request body with a Zod schema (`ChatRequestSchema`) instead of `as ChatRequest`. Bad payloads get a typed 422 with `details` from `error.flatten()` rather than crashing later.
  - `session.ts` parses Agno's `/sessions/{id}` and `/sessions/{id}/runs` responses through `parseAgnoSession` / `parseAgnoRuns`. Drops the local `AgnoMessage` and `AgnoSessionDetail` interfaces that were duplicated against the metrics package.
  - Extracted `parseChatBody()` from `createChatHandler` to keep the handler under the cognitive-complexity ceiling.

  **Metrics**: drops its local `AgnoMessage` interface and consumes the shared one from core. `session-detail.ts` now resolves Agno runs through `extractMessagesFromRuns(parseAgnoRuns(rawRuns))` — the 17-line manual narrow + cast was replaced by a single validated boundary.

  **Resolved type degradation in `ResolvedMetricsConfig.checkAccess`**: was typed as `(payload: Payload, user: Record<string, unknown>) => …`, lowering the public `TypedUser` to a generic record at the resolved-config layer. That forced four `user as unknown as Record<string, unknown>` casts in the endpoints. Now both layers carry `TypedUser` and the casts are gone.

  `@zetesis/payload-agents-metrics` now declares `@zetesis/payload-agents-core` as a peer dependency so consumers install both at compatible versions.

  No behaviour change. 136/136 specs pass (124 metrics + 12 core).

- [#23](https://github.com/Zetesis-Labs/PayloadAgents/pull/23) [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052) Thanks [@Fiser12](https://github.com/Fiser12)! - Address Devin review on PR #23:

  - **`multiTenant` default fix** (HIGH): `metricsPlugin({})` previously resolved to `multiTenant: true` paired with `resolveTenantId: async () => null`, silently discarding every metric event. `MetricsPluginConfig` is now a discriminated union — `multiTenant: true` makes both `checkAccess` and `resolveTenantId` required at the type level; omitting `multiTenant` defaults to single-tenant mode where the callbacks aren't needed. Existing consumers that explicitly pass `multiTenant: true` with both callbacks (e.g. zetesis-portal) are unaffected at runtime; new consumers can no longer enable multi-tenant without providing a real resolver.
  - **`batchFetchFirstMessages` query** (MEDIUM): replaced the chained `OR session_id = ?` predicate (one per item) with a single `session_id = ANY($1::text[])`. Keeps the index lookup efficient as `PAGE_SIZE` grows.

- [#23](https://github.com/Zetesis-Labs/PayloadAgents/pull/23) [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052) Thanks [@Fiser12](https://github.com/Fiser12)! - Final typing cleanup — closes the remaining gaps from the type-strict review.

  **Real bugs / safety holes:**

  - `getUserId` now validates the id at runtime and throws an explicit error (`TypedUser has no valid id — auth middleware misconfigured?`) instead of silently propagating `undefined.id` deep into the request flow.
  - `chat.ts` introduces a typed `AgentDoc` interface that documents what core actually reads from the agent collection (`slug`, `isActive`, `llmModel`, `apiKeyFingerprint`). Replaces `agents[0] as Record<string, unknown>` and `agent.slug as string` with one boundary cast at `payload.find` and a runtime check that the slug is actually a string.
  - `dashboard.tsx` validates the three fetch responses (`/sessions`, `/session`, `/aggregate`) through Zod schemas at runtime instead of soft-casting `res.json() as Promise<Foo>`. Schema/type are kept in lockstep via `z.infer`.
  - SSE translator no longer routes Agno frames through `Record<string, unknown>` casts. `agno-schema.ts` exports `AgnoSseFrame` / `AgnoSseTool` / `AgnoSseMetrics` interfaces with an index signature so the public `RunCompletedContext.metrics` keeps generic field access without a cast.

  **Type quality:**

  - `getDrizzle` parameter narrowed back to `BasePayload` (was widened to `{ db: unknown }` in the previous round).
  - `extractSources` (metrics) uses the `'hits' in data` operator instead of `as { hits?: unknown }`.
  - `extractAvatarUrl` (core agents-list) replaces the `media as Record<string, unknown>` cast chain with `'sizes' in avatar` narrowing and a `pickStringField` helper.
  - `reload-runtime.ts` reads `doc.slug` through a typed `docSlug()` helper, returning `null` and skipping notify if the field is absent or non-string.

  No behaviour change. 136/136 specs pass.

- [#23](https://github.com/Zetesis-Labs/PayloadAgents/pull/23) [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052) Thanks [@Fiser12](https://github.com/Fiser12)! - Tighten typing across the metrics package and core endpoints.

  **Metrics**:

  - Extract shared `DrizzleLike` interface and `getDrizzle()` helper to `lib/db.ts` — was duplicated in three call sites.
  - Replace `buildWhere(): unknown` with `buildWhere(): SQL` (drizzle's typed result), so callers don't need to recast the return value into their own `sql\`\`` templates.
  - Extend `ModelDetail` interface with `input_tokens`, `output_tokens`, `cache_read_tokens` so we don't cast a typed value into `Record<string, unknown>` just to read declared-but-missing fields. Add a `num()` runtime guard so non-numeric metric values land as `undefined` instead of NaN propagating into cost calculations.
  - `session-detail.ts`: replace the degenerate `Array<{...}> | unknown` declaration (`T | unknown` collapses to `unknown`) with a plain `let runs: unknown` that's narrowed with a type guard at use site. Validate each run's `messages` is an array before spreading.
  - `extractSources()`: stop casting hits to `Record<string, string>`; values are validated as strings (or coerced from numbers) per-field via a `pickString()` helper, so DB rows with `null` values no longer silently produce `''`.
  - `dashboard.tsx`: type the JSON error body as `{ error?: string } | null` rather than implicitly any, across all three fetch error paths.

  **Core**:

  - Extract `getUserId(user)` and `getUserRecord(user)` helpers to `lib/user.ts` — pattern was duplicated 6× across `chat.ts`, `session.ts`, `sessions.ts`. Centralises the boundary cast so future TypedUser refinements only touch one place.

  No behaviour change. All existing specs (124 in metrics + 12 in core) pass without modification.

- Updated dependencies [[`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052), [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052), [`ff02b1a`](https://github.com/Zetesis-Labs/PayloadAgents/commit/ff02b1a82a6222ff2bf05992f64140c9c2003052)]:
  - @zetesis/payload-agents-core@0.3.1
