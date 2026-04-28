---
'@zetesis/payload-agents-core': patch
'@zetesis/payload-agents-metrics': patch
---

Final typing cleanup — closes the remaining gaps from the type-strict review.

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
