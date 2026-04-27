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
import { z } from 'zod'
import { runtimeFetch } from '../lib/runtime-client'
import type { OnStreamRunCompleted } from '../lib/sse-translator'
import { translateAgnoStream } from '../lib/sse-translator'
import { getTokenUsage } from '../lib/token-usage'
import { getUserId } from '../lib/user'
import type { ResolvedPluginConfig } from '../types'

/**
 * Schema + helper exported for spec coverage. Not re-exported from the
 * package index — consumers should not depend on these symbols.
 */
export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  chatId: z.string().optional(),
  agentSlug: z.string().optional()
})

const SERVICE_UNAVAILABLE = { error: 'AI service temporarily unavailable' }

/**
 * Subset of an Agent document that core needs to read at runtime.
 *
 * Each consumer's Agent collection has a different shape (custom fields,
 * tenant relations, etc.) and the package can't reference the consumer's
 * generated types. This interface declares what *core* depends on; the
 * `payload.find` boundary cast lives at one site.
 */
interface AgentDoc {
  slug: string
  isActive?: boolean
  llmModel?: string
  apiKeyFingerprint?: string
}

interface RunCallbackContext {
  agent: AgentDoc
  userId: string | number
  agentSlug: string
  sessionId: string
}

function buildOnRunCompleted(
  config: ResolvedPluginConfig,
  ctx: RunCallbackContext,
  payload: unknown
): OnStreamRunCompleted | undefined {
  if (!config.onRunCompleted) return undefined
  const cb = config.onRunCompleted
  const { llmModel, apiKeyFingerprint } = ctx.agent
  return data => {
    Promise.resolve(
      cb(
        {
          ...data,
          userId: ctx.userId,
          agentSlug: ctx.agentSlug,
          sessionId: ctx.sessionId,
          llmModel,
          apiKeyFingerprint
        },
        payload as import('payload').Payload
      )
    ).catch(err => {
      console.error('[chat] onRunCompleted callback failed:', err)
    })
  }
}

/**
 * Call the runtime once and surface failures directly.
 *
 * Previously tried a second time after firing an HTTP `/internal/agents/reload`
 * at the Service, but that only reloaded one replica (round-robin) and the
 * retry landed on whichever replica the LB picked — there was no guarantee
 * it was the same one that just reloaded. With the collection hooks now
 * broadcasting reloads via Postgres `NOTIFY agent_reload`, every replica
 * stays fresh; the retry dance was solving a problem that no longer
 * exists, so it's gone.
 */
async function callRuntimeOnce(callRuntime: () => Promise<Response>): Promise<Response | null> {
  try {
    const upstream = await callRuntime()
    if (upstream.ok && upstream.body) return upstream
    const text = await upstream.text().catch(() => '')
    console.error(`[chat] agent-runtime returned ${upstream.status}: ${text}`)
    return null
  } catch (err) {
    console.error('[chat] agent-runtime fetch failed:', err)
    return null
  }
}

export type ChatBodyParseResult =
  | { ok: true; data: z.infer<typeof ChatRequestSchema> }
  | { ok: false; response: Response }

export async function parseChatBody(req: Parameters<PayloadHandler>[0]): Promise<ChatBodyParseResult> {
  let raw: unknown
  try {
    raw = await req.json?.()
  } catch {
    return { ok: false, response: Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
  const parsed = ChatRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 422 })
    }
  }
  if (!parsed.data.message.trim()) {
    return { ok: false, response: Response.json({ error: 'Message is required' }, { status: 400 }) }
  }
  return { ok: true, data: parsed.data }
}

export function createChatHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse body ──────────────────────────────────────────────────────
    const body = await parseChatBody(req)
    if (!body.ok) return body.response
    const { message, agentSlug, chatId } = body.data

    // ── Load agent from Payload ─────────────────────────────────────────
    const where: Where = { isActive: { equals: true } }
    if (agentSlug) {
      where.slug = { equals: agentSlug }
    }

    const { docs: agents } = await payload.find({
      collection: config.collectionSlug,
      where,
      depth: 1,
      limit: 1,
      overrideAccess: false,
      req
    })

    // The package can't reference the consumer's typed Agent doc, so we
    // narrow once here to the subset core actually reads. See AgentDoc.
    const agent = agents[0] as unknown as AgentDoc | undefined
    if (!agent || typeof agent.slug !== 'string') {
      return Response.json({ error: 'Agent not found' }, { status: 404 })
    }

    // ── Token budget ────────────────────────────────────────────────────
    const userId = getUserId(user)
    const usage = await getTokenUsage(payload, userId, config.getDailyLimit)
    // Conservative estimate: user message tokens + fixed overhead for
    // system prompt, RAG context, tool calls, and model output.
    const estimated = Math.ceil(message.length / 3) + 2000
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
    const agentSlugValue = agent.slug
    if (chatId) {
      const ok = await config.validateSessionOwnership(chatId, { user, payload, req })
      if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const sessionId = await config.buildSessionId({
      user,
      agentSlug: agentSlugValue,
      chatId,
      payload,
      req
    })
    const upstreamUrl = `${config.runtimeUrl}/agents/${encodeURIComponent(agentSlugValue)}/runs`

    let extraHeaders: Record<string, string> = {}
    if (config.getRuntimeHeaders) {
      try {
        extraHeaders = await config.getRuntimeHeaders({ user, payload, req })
      } catch (err) {
        payload.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          '[agent-plugin] getRuntimeHeaders threw — proceeding without extra headers'
        )
      }
    }

    const callRuntime = () =>
      runtimeFetch(upstreamUrl, config.runtimeSecret, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...extraHeaders },
        body: new URLSearchParams({
          message,
          user_id: String(userId),
          session_id: sessionId,
          stream: 'true'
        }),
        signal: AbortSignal.timeout(120_000)
      })

    const upstream = await callRuntimeOnce(callRuntime)
    if (!upstream?.body) {
      return Response.json(SERVICE_UNAVAILABLE, { status: 503 })
    }

    const onRunCompleted = buildOnRunCompleted(config, { agent, userId, agentSlug: agentSlugValue, sessionId }, payload)
    const stream = translateAgnoStream(upstream.body, sessionId, usage, onRunCompleted)

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
