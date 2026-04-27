---
'@zetesis/payload-agents-core': patch
'@zetesis/payload-agents-metrics': patch
---

Tighten typing across the metrics package and core endpoints.

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
