/**
 * Token usage query — reads daily consumption from Agno's session store.
 *
 * Agno persists per-run token metrics in `agno.agno_sessions`. This module
 * only reads; Agno is the single source of truth for token consumption.
 *
 * The daily *limit* comes from the consumer via `getDailyLimit()` callback.
 */

import { sql } from 'drizzle-orm'
import type { Payload } from 'payload'
import type { DailyTokenUsage, TokenUsageResult } from '../types'

/** Drizzle handle from the Payload DB adapter. */
function getDrizzle(payload: Payload) {
  return (
    payload.db as unknown as {
      drizzle: { execute: (q: ReturnType<typeof sql>) => Promise<{ rows: Record<string, unknown>[] }> }
    }
  ).drizzle
}

/**
 * Query current daily token usage from Agno's session store.
 *
 * Sums `metrics.total_tokens` from all runs created today for this user.
 */
async function getCurrentDailyUsage(payload: Payload, userId: string | number): Promise<DailyTokenUsage> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  const todayEpoch = Math.floor(today.getTime() / 1000)
  const userIdStr = String(userId)

  try {
    const db = getDrizzle(payload)

    const result = await db.execute(sql`
      SELECT COALESCE(SUM((r->>'total_tokens')::int), 0) AS daily_tokens
      FROM agno.agno_sessions s,
           jsonb_array_elements(s.runs) AS run,
           jsonb_extract_path(run, 'metrics') AS r
      WHERE s.user_id = ${userIdStr}
        AND s.created_at >= ${todayEpoch}
    `)

    const totalTokens = Number(result.rows[0]?.daily_tokens ?? 0)

    return {
      date: today.toISOString().split('T')[0] ?? '',
      tokens_used: totalTokens,
      reset_at: tomorrow.toISOString()
    }
  } catch (error) {
    console.error('[Token Limits] Error querying Agno sessions:', error instanceof Error ? error.message : error)
    throw error
  }
}

/**
 * Get complete token usage for a user: current consumption + limit from consumer callback.
 */
export async function getTokenUsage(
  payload: Payload,
  userId: string | number,
  getDailyLimit: (payload: Payload, userId: string | number) => Promise<number>
): Promise<TokenUsageResult> {
  try {
    const limit = await getDailyLimit(payload, userId)
    const currentUsage = await getCurrentDailyUsage(payload, userId)

    const used = currentUsage.tokens_used
    const remaining = Math.max(0, limit - used)
    const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0

    return {
      limit,
      used,
      remaining,
      percentage,
      reset_at: currentUsage.reset_at,
      canUse: (tokens: number) => used + tokens <= limit
    }
  } catch (error) {
    console.error('[Token Usage] Error getting usage:', error)
    return {
      limit: 0,
      used: 0,
      remaining: 0,
      percentage: 0,
      reset_at: new Date().toISOString(),
      canUse: () => false
    }
  }
}
