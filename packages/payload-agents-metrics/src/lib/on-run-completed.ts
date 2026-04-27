/**
 * Factory for the `onRunCompleted` callback.
 *
 * Returns a function compatible with `agentPlugin({ onRunCompleted })`.
 * The consumer passes it the metrics plugin config so tenant resolution
 * and cost calculation are properly wired.
 */

import type { Payload } from 'payload'
import type { ResolvedMetricsConfig } from '../types'
import { calculateLlmCost, normalizeProvider } from './cost-calculator'

interface RunCompletedContext {
  userId: string | number
  agentSlug: string
  sessionId: string
  metrics: Record<string, unknown>
  runId?: string
  llmModel?: string
  apiKeyFingerprint?: string
}

interface ModelDetail {
  id?: string
  provider?: string
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function extractModelDetail(metrics: Record<string, unknown>): ModelDetail | null {
  const details = metrics.details as Record<string, unknown[]> | undefined
  if (!details) return null
  const modelList = details.model as ModelDetail[] | undefined
  return modelList?.[0] ?? null
}

function resolveProvider(ctx: RunCompletedContext, detail: ModelDetail | null) {
  if (ctx.llmModel) {
    const slash = ctx.llmModel.indexOf('/')
    if (slash > 0) return normalizeProvider(ctx.llmModel.slice(0, slash))
  }
  return normalizeProvider(detail?.provider ?? '')
}

function resolveModel(ctx: RunCompletedContext, detail: ModelDetail | null): string {
  if (ctx.llmModel) {
    const slash = ctx.llmModel.indexOf('/')
    return slash > 0 ? ctx.llmModel.slice(slash + 1) : ctx.llmModel
  }
  return detail?.id ?? 'unknown'
}

export function createOnRunCompleted(config: ResolvedMetricsConfig) {
  return async (ctx: RunCompletedContext, payload: Payload): Promise<void> => {
    const { metrics, userId, agentSlug, sessionId, runId } = ctx
    const detail = extractModelDetail(metrics)

    const provider = resolveProvider(ctx, detail)
    if (!provider) {
      console.warn('[metrics] Unknown provider, skipping:', ctx.llmModel)
      return
    }

    const model = resolveModel(ctx, detail)
    const inputTokens = num(detail?.input_tokens) ?? num(metrics.input_tokens) ?? 0
    const outputTokens = num(detail?.output_tokens) ?? num(metrics.output_tokens) ?? 0
    const cachedInputTokens = num(detail?.cache_read_tokens) ?? num(metrics.cache_read_tokens) ?? 0
    const totalTokens = num(metrics.total_tokens) ?? inputTokens + outputTokens
    const duration = num(metrics.duration)
    const latencyMs = duration !== undefined ? Math.round(duration * 1000) : undefined
    const costUsd = calculateLlmCost(provider, model, { input: inputTokens, output: outputTokens }, config.extraPricing)

    let tenant: number | string | null | undefined
    if (config.multiTenant) {
      tenant = await config.resolveTenantId(payload, userId)
      if (tenant === null) {
        console.warn('[metrics] Could not resolve tenant for user', userId)
        return
      }
    }

    try {
      const data: Record<string, unknown> = {
        user: userId,
        agentSlug,
        conversationId: sessionId,
        runId,
        provider,
        model,
        apiKeySource: 'agent',
        apiKeyFingerprint: ctx.apiKeyFingerprint,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        totalTokens,
        costUsd,
        completedAt: new Date().toISOString(),
        latencyMs,
        status: 'success'
      }
      if (tenant !== undefined) data.tenant = tenant

      await payload.create({
        collection: config.collectionSlug,
        overrideAccess: true,
        data
      })
    } catch (err) {
      console.error('[metrics] Failed to persist usage event:', err)
    }
  }
}
