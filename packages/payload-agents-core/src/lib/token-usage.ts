/**
 * Token usage query — reads daily consumption from Agno's session store.
 *
 * Agno persists per-run token metrics in `agno.agno_sessions`. This module
 * only reads; Agno is the single source of truth for token consumption.
 *
 * Uses cost-weighted "effective tokens" instead of raw totals so the daily
 * budget reflects real spend. Cached input counts at 25% and output tokens
 * are weighted by the model's output/input price ratio.
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
 * Extracts the full metrics breakdown (input, output, cached, reasoning)
 * and returns both raw totals and effective (cost-weighted) tokens.
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
      SELECT
        COALESCE(SUM((r->>'input_tokens')::int), 0) AS input_tokens,
        COALESCE(SUM((r->>'output_tokens')::int), 0) AS output_tokens,
        COALESCE(SUM((r->>'cache_read_tokens')::int), 0) AS cache_read_tokens,
        COALESCE(SUM((r->>'reasoning_tokens')::int), 0) AS reasoning_tokens,
        COALESCE(SUM((r->>'total_tokens')::int), 0) AS total_tokens
      FROM agno.agno_sessions s,
           jsonb_array_elements(s.runs) AS run,
           jsonb_extract_path(run, 'metrics') AS r
      WHERE s.user_id = ${userIdStr}
        AND s.created_at >= ${todayEpoch}
    `)

    const row = result.rows[0] ?? {}
    const inputTokens = Number(row.input_tokens ?? 0)
    const outputTokens = Number(row.output_tokens ?? 0)
    const cacheReadTokens = Number(row.cache_read_tokens ?? 0)
    const reasoningTokens = Number(row.reasoning_tokens ?? 0)
    const totalTokens = Number(row.total_tokens ?? 0)

    // Effective tokens: cached input weighted at 25%, output at 100%.
    // This is a model-agnostic approximation — for precise per-model
    // weighting, use costBreakdown() from cost-calculator.ts.
    const nonCachedInput = inputTokens - cacheReadTokens
    const effectiveTokens = Math.ceil(nonCachedInput + cacheReadTokens * 0.25 + outputTokens)

    return {
      date: today.toISOString().split('T')[0] ?? '',
      tokens_used: effectiveTokens,
      raw_total_tokens: totalTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      reasoning_tokens: reasoningTokens,
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
