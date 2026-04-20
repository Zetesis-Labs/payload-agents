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
    const inputTokens =
      ((detail as Record<string, unknown> | null)?.input_tokens as number | undefined) ??
      (metrics.input_tokens as number | undefined) ??
      0
    const outputTokens =
      ((detail as Record<string, unknown> | null)?.output_tokens as number | undefined) ??
      (metrics.output_tokens as number | undefined) ??
      0
    const cachedInputTokens =
      ((detail as Record<string, unknown> | null)?.cache_read_tokens as number | undefined) ??
      (metrics.cache_read_tokens as number | undefined) ??
      0
    const totalTokens = (metrics.total_tokens as number | undefined) ?? inputTokens + outputTokens
    const duration = metrics.duration as number | undefined
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
