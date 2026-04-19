/**
 * Opinionated helper for the common multi-tenant setup.
 *
 * Returns `buildSessionId` + `validateSessionOwnership` pre-wired to embed
 * the tenant id inside the session string, so session ownership covers
 * both tenant and user boundaries automatically.
 *
 * This helper does NOT touch the Agents collection — filtering the
 * collection by tenant is usually handled by `@payloadcms/plugin-multi-tenant`
 * (or equivalent) that you already register elsewhere. If you're not using
 * such a plugin, add the filter yourself via `collectionOverrides`.
 */

import type { PayloadRequest } from 'payload'
import type { BuildSessionId, ValidateSessionOwnership } from '../types'

export interface MultiTenantSessionStrategyOptions {
  /**
   * Resolve the tenant id for the current request.
   *
   * Receives the authenticated Payload user and the current `PayloadRequest`,
   * so consumers can read the active tenant from whatever source their app
   * uses (cookie, header, subdomain…) instead of being restricted to the
   * user object.
   *
   * Return `undefined` (or a falsy value) for users without a tenant —
   * sessions will fall back to `'default'`.
   */
  extractTenantId: (user: Record<string, unknown>, req: PayloadRequest) => string | number | undefined | null
}

export interface MultiTenantSessionStrategy {
  buildSessionId: BuildSessionId
  validateSessionOwnership: ValidateSessionOwnership
}

/**
 * Session-id strategy for tenant-scoped chats.
 *
 * Use in tandem with `@payloadcms/plugin-multi-tenant`, which already filters
 * the Agents collection by tenant — this helper just makes sure session
 * identifiers carry the same tenant boundary so cross-tenant access is
 * rejected at the chat/session endpoints.
 *
 * @example
 * ```ts
 * import { agentPlugin, multiTenantSessionStrategy } from '@zetesis/payload-agents-core'
 * import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
 *
 * const { buildSessionId, validateSessionOwnership } = multiTenantSessionStrategy({
 *   extractTenantId: (user, req) =>
 *     getTenantFromCookie(req.headers, req.payload.db.defaultIDType) ??
 *     (user.tenants as Array<{ tenant: number | { id: number } }> | undefined)?.[0]?.tenant
 * })
 *
 * agentPlugin({
 *   // ...
 *   buildSessionId,
 *   validateSessionOwnership,
 * })
 * ```
 */
export function multiTenantSessionStrategy(options: MultiTenantSessionStrategyOptions): MultiTenantSessionStrategy {
  const resolveTenant = (user: Record<string, unknown>, req: PayloadRequest): string => {
    const value = options.extractTenantId(user, req)
    return value === undefined || value === null || value === '' ? 'default' : String(value)
  }

  const buildSessionId: BuildSessionId = ({ user, agentSlug, chatId, req }) => {
    if (chatId) return chatId
    const tenantId = resolveTenant(user, req)
    const userId = String((user as { id?: string | number }).id ?? 'anonymous')
    return `${agentSlug}:${tenantId}:${userId}:${crypto.randomUUID()}`
  }

  const validateSessionOwnership: ValidateSessionOwnership = (sessionId, { user, req }) => {
    const tenantId = resolveTenant(user, req)
    const userId = String((user as { id?: string | number }).id ?? '')
    if (!userId) return false
    return sessionId.includes(`:${tenantId}:${userId}:`)
  }

  return { buildSessionId, validateSessionOwnership }
}
