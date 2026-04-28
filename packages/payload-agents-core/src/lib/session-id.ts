/**
 * Default session-id strategy used when the consumer does not provide one.
 *
 * The built-in format is `${agentSlug}:${userId}:${uuid}` — simple enough to
 * let us verify ownership by checking that `:${userId}:` appears inside the
 * id. Consumers that need a different format must override both
 * `buildSessionId` and `validateSessionOwnership` in the plugin config.
 */

import type { BuildSessionId, ValidateSessionOwnership } from '../types'

export const defaultBuildSessionId: BuildSessionId = ({ user, agentSlug, chatId }) => {
  if (chatId) return chatId
  const userId = String(user.id ?? 'anonymous')
  return `${agentSlug}:${userId}:${crypto.randomUUID()}`
}

export const defaultValidateSessionOwnership: ValidateSessionOwnership = (sessionId, { user }) => {
  const userId = String(user.id ?? '')
  if (!userId) return false
  return sessionId.includes(`:${userId}:`)
}
