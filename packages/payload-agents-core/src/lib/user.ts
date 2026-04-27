/**
 * Helpers for narrowing Payload's `TypedUser` (which is opaque at the package
 * boundary because each consumer app generates its own user shape).
 */

import type { TypedUser } from 'payload'

/**
 * Extract the user id from a TypedUser. Used at endpoint boundaries where
 * we know the user is authenticated (auth middleware ran) but the package
 * cannot statically know the consumer's user schema.
 */
export const getUserId = (user: TypedUser): string | number =>
  (user as unknown as { id: string | number }).id

/**
 * View a TypedUser as a generic record so it can be passed to consumer-supplied
 * access predicates without exposing the package-internal user shape.
 */
export const getUserRecord = (user: TypedUser): Record<string, unknown> =>
  user as unknown as Record<string, unknown>
