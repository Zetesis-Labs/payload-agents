/**
 * Shared drizzle handle accessor for the metrics package.
 *
 * Payload's `payload.db` is typed as `DatabaseAdapter` at the public surface
 * but the postgres adapter exposes a `drizzle` property at runtime that the
 * metrics queries rely on. Centralising the cast keeps the unsafe boundary
 * in a single place — every callsite goes through `getDrizzle(payload)`.
 */

export interface DrizzleLike {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>
}

export function getDrizzle(payload: { db: unknown }): DrizzleLike {
  return (payload.db as unknown as { drizzle: DrizzleLike }).drizzle
}
