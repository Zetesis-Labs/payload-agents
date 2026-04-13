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

import type { BuildSessionId, ValidateSessionOwnership } from '../types'

export interface MultiTenantSessionStrategyOptions {
  /**
   * Extract the tenant id from the authenticated Payload user.
   *
   * Return `undefined` (or a falsy value) for users without a tenant —
   * sessions will fall back to `'default'`.
   */
  extractTenantId: (user: Record<string, unknown>) => string | number | undefined | null
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
 *
 * const { buildSessionId, validateSessionOwnership } = multiTenantSessionStrategy({
 *   extractTenantId: user => {
 *     const tenants = user.tenants as Array<{ tenant: number | { id: number } }> | undefined
 *     if (!tenants?.[0]) return undefined
 *     const t = tenants[0].tenant
 *     return typeof t === 'object' && t !== null ? t.id : t
 *   }
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
  const resolveTenant = (user: Record<string, unknown>): string => {
    const value = options.extractTenantId(user)
    return value === undefined || value === null || value === '' ? 'default' : String(value)
  }

  const buildSessionId: BuildSessionId = ({ user, agentSlug, chatId }) => {
    if (chatId) return chatId
    const tenantId = resolveTenant(user)
    const userId = String((user as { id?: string | number }).id ?? 'anonymous')
    return `${agentSlug}:${tenantId}:${userId}:${crypto.randomUUID()}`
  }

  const validateSessionOwnership: ValidateSessionOwnership = (sessionId, { user }) => {
    const tenantId = resolveTenant(user)
    const userId = String((user as { id?: string | number }).id ?? '')
    if (!userId) return false
    return sessionId.includes(`:${tenantId}:${userId}:`)
  }

  return { buildSessionId, validateSessionOwnership }
}
