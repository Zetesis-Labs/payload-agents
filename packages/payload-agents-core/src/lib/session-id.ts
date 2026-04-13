/**
 * Session ID ownership — creation, parsing, and validation.
 *
 * Format: `{agentSlug}:{tenantId}:{userId}:{uuid}`
 *
 * All segments are colon-free by convention (slugs are kebab-case,
 * tenant/user IDs are numeric or 'default', UUIDs use hyphens).
 * Ownership is verified by matching the embedded tenantId + userId
 * against the authenticated user.
 */

export interface SessionIdParts {
  agentSlug: string
  tenantId: string
  userId: string
  uuid: string
}

const SEGMENT_COUNT = 4

/** Build a new session ID with a random UUID. */
export function createSessionId(agentSlug: string, tenantId: string, userId: string | number): string {
  return `${agentSlug}:${tenantId}:${userId}:${crypto.randomUUID()}`
}

/** Decompose a session ID into its segments, or `null` if malformed. */
export function parseSessionId(sessionId: string): SessionIdParts | null {
  const segments = sessionId.split(':')
  if (segments.length !== SEGMENT_COUNT) return null
  const [agentSlug, tenantId, userId, uuid] = segments as [string, string, string, string]
  if (!agentSlug || !tenantId || !userId || !uuid) return null
  return { agentSlug, tenantId, userId, uuid }
}

/**
 * Verify that `sessionId` was created for the given tenant + user.
 * Returns `false` for malformed IDs or mismatched ownership.
 */
export function validateSessionOwnership(sessionId: string, tenantId: string, userId: string | number): boolean {
  const parsed = parseSessionId(sessionId)
  if (!parsed) return false
  return parsed.tenantId === tenantId && parsed.userId === String(userId)
}
