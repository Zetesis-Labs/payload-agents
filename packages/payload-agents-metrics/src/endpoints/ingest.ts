import type { PayloadHandler } from 'payload'
import { z } from 'zod'
import { calculateLlmCost, type LlmProvider } from '../lib/cost-calculator'
import type { ResolvedMetricsConfig } from '../types'

const ProviderSchema = z.enum(['anthropic', 'openai', 'google'])
const EventSchema = z.object({
  tenant: z.union([z.number(), z.string()]).optional(),
  user: z.union([z.number(), z.string()]),
  agent: z.union([z.number(), z.string()]).optional(),
  agentSlug: z.string().optional(),
  conversationId: z.string().optional(),
  runId: z.string().optional(),
  provider: ProviderSchema,
  model: z.string().min(1),
  apiKeySource: z.enum(['agent', 'user']).default('agent'),
  apiKeyFingerprint: z.string().max(8).optional(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  status: z.enum(['success', 'error']).default('success'),
  errorCode: z.string().optional()
})

type IngestEvent = z.infer<typeof EventSchema>
const PayloadSchema = z.union([EventSchema, z.array(EventSchema).min(1).max(100)])

export function createIngestHandler(config: ResolvedMetricsConfig): PayloadHandler {
  return async req => {
    const secret = config.ingestSecret
    const provided = req.headers?.get?.('x-internal-secret')
    if (!provided || provided !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await req.json?.()
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = PayloadSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 422 })
    }

    const { payload } = req
    const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data]

    const results = await Promise.all(events.map(event => persistEvent(payload, config, event)))
    const failures = results.filter((r): r is { ok: false; error: string } => !r.ok)

    if (failures.length === results.length) {
      return Response.json({ error: 'All events failed', failures }, { status: 422 })
    }

    if (Array.isArray(parsed.data)) {
      return Response.json({
        ok: true,
        ids: results.flatMap(r => (r.ok ? [r.id] : [])),
        failures: failures.length > 0 ? failures : undefined
      })
    }

    const single = results[0]
    return single.ok
      ? Response.json({ ok: true, id: single.id })
      : Response.json({ error: single.error }, { status: 422 })
  }
}

async function persistEvent(
  payload: import('payload').BasePayload,
  config: ResolvedMetricsConfig,
  event: IngestEvent
): Promise<{ ok: true; id: number | string } | { ok: false; error: string }> {
  let tenantId: number | string | null | undefined
  if (config.multiTenant) {
    tenantId = event.tenant ?? null
    if (tenantId === null) {
      tenantId = await config.resolveTenantId(payload, event.user)
    }
    if (tenantId === null) {
      return { ok: false, error: 'Could not resolve tenant' }
    }
  }

  const inputTokens = event.inputTokens ?? 0
  const outputTokens = event.outputTokens ?? 0
  const totalTokens = event.totalTokens ?? inputTokens + outputTokens
  const costUsd =
    event.costUsd ??
    calculateLlmCost(
      event.provider as LlmProvider,
      event.model,
      { input: inputTokens, output: outputTokens },
      config.extraPricing
    )

  const data: Record<string, unknown> = {
    user: event.user,
    agent: event.agent,
    agentSlug: event.agentSlug,
    conversationId: event.conversationId,
    runId: event.runId,
    provider: event.provider,
    model: event.model,
    apiKeySource: event.apiKeySource,
    apiKeyFingerprint: event.apiKeyFingerprint,
    inputTokens,
    outputTokens,
    cachedInputTokens: event.cachedInputTokens,
    totalTokens,
    costUsd,
    startedAt: event.startedAt,
    completedAt: event.completedAt ?? new Date().toISOString(),
    latencyMs: event.latencyMs,
    status: event.status,
    errorCode: event.errorCode
  }
  if (tenantId !== undefined) data.tenant = tenantId

  try {
    const doc = await payload.create({
      collection: config.collectionSlug,
      overrideAccess: true,
      data
    })
    return { ok: true, id: doc.id as number | string }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
