---
'@zetesis/payload-agents-core': patch
'@zetesis/payload-agents-metrics': patch
---

Replace hand-rolled Agno interfaces with shared Zod schemas at the boundaries.

**Core**: new `lib/agno-schema.ts` exposes `AgnoMessageSchema`, `AgnoRunSchema`, `AgnoSessionDetailSchema`, the inferred TS types, and three helpers (`parseAgnoSession`, `parseAgnoRuns`, `extractMessagesFromRuns`). All exported from the package root so consumers parse Agno responses through one validated boundary instead of casting their own.

- `chat.ts` validates the request body with a Zod schema (`ChatRequestSchema`) instead of `as ChatRequest`. Bad payloads get a typed 422 with `details` from `error.flatten()` rather than crashing later.
- `session.ts` parses Agno's `/sessions/{id}` and `/sessions/{id}/runs` responses through `parseAgnoSession` / `parseAgnoRuns`. Drops the local `AgnoMessage` and `AgnoSessionDetail` interfaces that were duplicated against the metrics package.
- Extracted `parseChatBody()` from `createChatHandler` to keep the handler under the cognitive-complexity ceiling.

**Metrics**: drops its local `AgnoMessage` interface and consumes the shared one from core. `session-detail.ts` now resolves Agno runs through `extractMessagesFromRuns(parseAgnoRuns(rawRuns))` — the 17-line manual narrow + cast was replaced by a single validated boundary.

**Resolved type degradation in `ResolvedMetricsConfig.checkAccess`**: was typed as `(payload: Payload, user: Record<string, unknown>) => …`, lowering the public `TypedUser` to a generic record at the resolved-config layer. That forced four `user as unknown as Record<string, unknown>` casts in the endpoints. Now both layers carry `TypedUser` and the casts are gone.

`@zetesis/payload-agents-metrics` now declares `@zetesis/payload-agents-core` as a peer dependency so consumers install both at compatible versions.

No behaviour change. 136/136 specs pass (124 metrics + 12 core).
