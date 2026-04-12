/**
 * POST /chat — SSE proxy to the Agno agent-runtime.
 *
 * Flow:
 *   1. User is already authenticated by Payload
 *   2. Load Agent config from Payload by slug
 *   3. Check daily token limits
 *   4. POST upstream to agent-runtime
 *   5. Translate Agno SSE → legacy adapter schema
 */

import type { PayloadHandler, Where } from 'payload'
import { reloadAgents } from '../lib/runtime-client'
import { translateAgnoStream } from '../lib/sse-translator'
import { getTokenUsage } from '../lib/token-usage'
import type { ResolvedPluginConfig } from '../types'

interface ChatRequest {
  message: string
  chatId?: string
  agentSlug?: string
}

const SERVICE_UNAVAILABLE = { error: 'AI service temporarily unavailable' }

/**
 * Attempt to call the runtime, retrying once after a reload if the first
 * attempt fails (network error or 4xx).
 */
async function callWithRetry(
  callRuntime: () => Promise<Response>,
  runtimeUrl: string,
  runtimeSecret: string
): Promise<Response | null> {
  let upstream: Response | undefined

  try {
    upstream = await callRuntime()
  } catch (err) {
    console.error('[chat] agent-runtime fetch failed, attempting reload:', err)
    return retryAfterReload(callRuntime, runtimeUrl, runtimeSecret)
  }

  if (upstream.ok && upstream.body) return upstream

  if (upstream.status >= 400 && upstream.status < 500) {
    console.warn(`[chat] agent-runtime returned ${upstream.status}, attempting reload`)
    return retryAfterReload(callRuntime, runtimeUrl, runtimeSecret)
  }

  const text = await upstream.text().catch(() => '')
  console.error(`[chat] agent-runtime returned ${upstream.status}: ${text}`)
  return null
}

async function retryAfterReload(
  callRuntime: () => Promise<Response>,
  runtimeUrl: string,
  runtimeSecret: string
): Promise<Response | null> {
  const reloaded = await reloadAgents(runtimeUrl, runtimeSecret)
  if (!reloaded || reloaded.count === 0) return null

  try {
    const retry = await callRuntime()
    if (retry.ok && retry.body) return retry
    const text = await retry.text().catch(() => '')
    console.error(`[chat] agent-runtime returned ${retry.status} after reload: ${text}`)
  } catch (retryErr) {
    console.error('[chat] agent-runtime fetch failed after reload:', retryErr)
  }
  return null
}

export function createChatHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse body ──────────────────────────────────────────────────────
    let body: ChatRequest
    try {
      body = (await req.json?.()) as ChatRequest
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { message, agentSlug, chatId } = body
    if (!message?.trim()) {
      return Response.json({ error: 'Message is required' }, { status: 400 })
    }

    // ── Load agent from Payload ─────────────────────────────────────────
    const tenantId = config.extractTenantId(user as unknown as Record<string, unknown>)
    const where: Where = { isActive: { equals: true } }

    if (tenantId !== 'default') {
      where.tenant = { equals: tenantId }
    }
    if (agentSlug) {
      where.slug = { equals: agentSlug }
    }

    const { docs: agents } = await payload.find({
      collection: config.collectionSlug,
      where,
      depth: 1,
      limit: 1
    })

    const agent = agents[0] as Record<string, unknown> | undefined
    if (!agent) {
      return Response.json({ error: 'Agent not found' }, { status: 404 })
    }

    // ── Token budget ────────────────────────────────────────────────────
    const userId = (user as unknown as { id: string | number }).id
    const usage = await getTokenUsage(payload, userId, config.getDailyLimit)
    const estimated = Math.ceil(message.length / 4)
    if (!usage.canUse(estimated)) {
      return Response.json(
        {
          error: 'Daily token limit reached',
          limit_info: {
            limit: usage.limit,
            used: usage.used,
            remaining: usage.remaining,
            reset_at: usage.reset_at
          }
        },
        { status: 429 }
      )
    }

    // ── Session ID ──────────────────────────────────────────────────────
    const agentSlugValue = agent.slug as string
    const sessionId = chatId || `${agentSlugValue}:${tenantId}:${userId}:${crypto.randomUUID()}`
    const upstreamUrl = `${config.runtimeUrl}/agents/${encodeURIComponent(agentSlugValue)}/runs`

    const callRuntime = () =>
      fetch(upstreamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          message,
          user_id: String(userId),
          session_id: sessionId,
          stream: 'true'
        }),
        signal: AbortSignal.timeout(120_000)
      })

    const upstream = await callWithRetry(callRuntime, config.runtimeUrl, config.runtimeSecret)
    if (!upstream?.body) {
      return Response.json(SERVICE_UNAVAILABLE, { status: 503 })
    }

    const stream = translateAgnoStream(upstream.body, sessionId, usage)

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive'
      }
    })
  }
}
