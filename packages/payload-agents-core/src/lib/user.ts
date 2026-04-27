/**
 * Helpers for narrowing Payload's `TypedUser` (which is opaque at the package
 * boundary because each consumer app generates its own user shape).
 */

import type { TypedUser } from 'payload'

/**
 * Extract the user id from a TypedUser. Used at endpoint boundaries where
 * we know the user is authenticated (auth middleware ran).
 *
 * Validates at runtime — if the auth middleware hands us a user without a
 * usable `id`, throw rather than propagate `undefined.id` deep into the
 * request flow as a confusing TypeError downstream.
 */
export function getUserId(user: TypedUser): string | number {
  const id = (user as unknown as { id?: unknown }).id
  if (typeof id === 'string' || typeof id === 'number') return id
  throw new Error('TypedUser has no valid id — auth middleware misconfigured?')
}
