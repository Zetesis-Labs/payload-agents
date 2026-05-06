/**
 * POST /chat — AG-UI passthrough to the Agno agent-runtime.
 *
 * Flow:
 *   1. User is already authenticated by Payload (cookie session).
 *   2. Body is a standard AG-UI `RunAgentInput` document.
 *   3. We resolve the agent slug from the URL or body, load the agent
 *      from Payload (access control filters by tenant via
 *      `overrideAccess: false`), check the daily token budget, and
 *      compute / validate the session id.
 *   4. We forward the unchanged `RunAgentInput` to the runtime
 *      (`POST {runtimeUrl}/agents/{slug}/agui`) with `forwarded_props`
 *      enriched with `user_id`, then stream the AG-UI events back to
 *      the browser unchanged. We prepend / append a `CUSTOM usage`
 *      event so the UI can render the budget bar.
 */

import type { PayloadHandler, Where } from 'payload'
import { z } from 'zod'
import type { OnStreamRunCompleted } from '../lib/agui-passthrough'
import { passthroughAguiStream } from '../lib/agui-passthrough'
import { runtimeFetch } from '../lib/runtime-client'
import { getTokenUsage } from '../lib/token-usage'
import { getUserId } from '../lib/user'
import type { ResolvedPluginConfig } from '../types'

const SERVICE_UNAVAILABLE = { error: 'AI service temporarily unavailable' }

/**
 * Minimal validation of the AG-UI `RunAgentInput` shape we care about.
 * The runtime does the strict parsing — we just need enough to enforce
 * auth, sessions, and budget here.
 *
 * Portal-specific fields ride inside the standard AG-UI `forwardedProps`
 * slot so the wire format stays vanilla AG-UI:
 *   - `forwardedProps.agentSlug` — required, selects the runtime agent.
 */
export const RunAgentInputSchema = z
  .object({
    threadId: z.string().optional(),
    runId: z.string().optional(),
    messages: z.array(z.unknown()).optional(),
    state: z.unknown().optional(),
    context: z.array(z.unknown()).optional(),
    tools: z.array(z.unknown()).optional(),
    forwardedProps: z.record(z.unknown()).optional()
  })
  .passthrough()

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
  | { ok: true; data: z.infer<typeof RunAgentInputSchema> }
  | { ok: false; response: Response }

export async function parseChatBody(req: Parameters<PayloadHandler>[0]): Promise<ChatBodyParseResult> {
  let raw: unknown
  try {
    raw = await req.json?.()
  } catch {
    return { ok: false, response: Response.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
  const parsed = RunAgentInputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 422 })
    }
  }
  return { ok: true, data: parsed.data }
}

export function createChatHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await parseChatBody(req)
    if (!body.ok) return body.response
    const input = body.data
    const fp = input.forwardedProps ?? {}
    const agentSlug = typeof fp.agentSlug === 'string' ? fp.agentSlug : undefined
    const chatId = input.threadId

    if (!agentSlug) {
      return Response.json({ error: 'forwardedProps.agentSlug is required' }, { status: 400 })
    }

    const where: Where = { isActive: { equals: true }, slug: { equals: agentSlug } }

    const { docs: agents } = await payload.find({
      collection: config.collectionSlug,
      where,
      depth: 1,
      limit: 1,
      overrideAccess: false,
      req
    })

    const agent = agents[0] as unknown as AgentDoc | undefined
    if (!agent || typeof agent.slug !== 'string') {
      return Response.json({ error: 'Agent not found' }, { status: 404 })
    }

    const userId = getUserId(user)
    const usage = await getTokenUsage(payload, userId, config.getDailyLimit)
    const userText = extractLastUserText(input.messages)
    const estimated = Math.ceil(userText.length / 3) + 2000
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

    const agentSlugValue = agent.slug
    // AG-UI clients (incl. assistant-ui's HttpAgent) auto-generate a UUID
    // threadId before they ever talk to us. Treat an unrecognised threadId
    // as "fresh chat, mint a real session id" rather than 403 — only
    // honour it when ownership validates against our own format.
    const ownsThread = chatId ? await config.validateSessionOwnership(chatId, { user, payload, req }) : false
    const sessionId = ownsThread
      ? (chatId as string)
      : await config.buildSessionId({
          user,
          agentSlug: agentSlugValue,
          chatId: undefined,
          payload,
          req
        })

    const forwardedRest: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fp as Record<string, unknown>)) {
      if (key !== 'agentSlug') forwardedRest[key] = value
    }
    const upstreamBody: Record<string, unknown> = {
      ...input,
      threadId: sessionId,
      forwardedProps: {
        ...forwardedRest,
        // Agno's session store types `user_id: Optional[str]`. Passing
        // a number here makes `agent.arun(user_id=2)` silently skip
        // session persistence — the run streams normally but no row
        // is written, so `/sessions` never shows the new conversation.
        user_id: String(userId)
      }
    }

    const upstreamUrl = `${config.runtimeUrl}/agents/${encodeURIComponent(agentSlugValue)}/agui`

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
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify(upstreamBody),
        signal: AbortSignal.timeout(120_000)
      })

    const upstream = await callRuntimeOnce(callRuntime)
    if (!upstream?.body) {
      return Response.json(SERVICE_UNAVAILABLE, { status: 503 })
    }

    const onRunCompleted = buildOnRunCompleted(config, { agent, userId, agentSlug: agentSlugValue, sessionId }, payload)
    const stream = passthroughAguiStream(upstream.body, usage, onRunCompleted)

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
        'X-Thread-Id': sessionId
      }
    })
  }
}

function extractLastUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && typeof m === 'object' && (m as { role?: unknown }).role === 'user') {
      const content = (m as { content?: unknown }).content
      if (typeof content === 'string') return content
    }
  }
  return ''
}
