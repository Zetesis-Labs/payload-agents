/**
 * GET {basePath}/usage — current daily token budget snapshot.
 *
 * Lets the chat UI render the token-usage bar before the user has sent
 * any message. The same shape is later emitted as a `CUSTOM usage`
 * event at the start of every run, so the bar updates live during
 * streaming.
 */

import type { PayloadHandler } from 'payload'
import { getTokenUsage } from '../lib/token-usage'
import { getUserId } from '../lib/user'
import type { ResolvedPluginConfig } from '../types'

export function createUsageHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = getUserId(user)
    const usage = await getTokenUsage(payload, userId, config.getDailyLimit)

    return Response.json({
      daily_limit: usage.limit,
      daily_used: usage.used,
      daily_remaining: usage.remaining,
      reset_at: usage.reset_at
    })
  }
}
