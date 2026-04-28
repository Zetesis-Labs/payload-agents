/**
 * Single chat session CRUD — proxies to the Agno runtime.
 *
 * Registered as three Payload endpoints:
 *   - GET    {basePath}/session
 *   - PATCH  {basePath}/session
 *   - DELETE {basePath}/session
 */

import type { PayloadHandler, TypedUser } from 'payload'
import { type AgnoMessage, extractMessagesFromRuns, parseAgnoRuns, parseAgnoSession } from '../lib/agno-schema'
import { runtimeFetch } from '../lib/runtime-client'
import { dedupSources, extractSources } from '../lib/sources'
import { getUserId } from '../lib/user'
import type { ResolvedPluginConfig, Source } from '../types'

// ── Local view types (mapped output, not Agno's wire shape) ───────────────

interface ToolCallOut {
  id: string
  name: string
  input: Record<string, unknown>
  result?: string
  sources?: Source[]
}

interface MappedMessage {
  role: string
  content: string
  timestamp: string
  sources?: Source[]
  toolCalls?: ToolCallOut[]
}

// ── Helpers ────────────────────────────���───────────────────────────��────

/** Index tool-role messages by tool_call_id for quick lookup. */
function indexToolResults(history: AgnoMessage[]): Map<string, AgnoMessage> {
  const map = new Map<string, AgnoMessage>()
  for (const m of history) {
    if (m.role === 'tool' && m.tool_call_id) {
      map.set(m.tool_call_id, m)
    }
  }
  return map
}

/** Convert a single assistant tool_calls array to ToolCallOut[]. */
function resolveToolCalls(
  toolCalls: NonNullable<AgnoMessage['tool_calls']>,
  toolResults: Map<string, AgnoMessage>
): ToolCallOut[] {
  return toolCalls.map(tc => {
    let input: Record<string, unknown> = {}
    try {
      input = JSON.parse(tc.function.arguments) as Record<string, unknown>
    } catch {
      /* malformed args */
    }
    const toolResult = toolResults.get(tc.id)
    const resultContent = toolResult?.content || undefined
    const sources = resultContent ? extractSources(resultContent) : []
    return {
      id: tc.id,
      name: tc.function.name,
      input,
      result: resultContent,
      sources: sources.length > 0 ? sources : undefined
    }
  })
}

/** Flush pending tool calls into a MappedMessage. */
function flushToolCalls(pendingToolCalls: ToolCallOut[], content: string, timestamp: string): MappedMessage {
  const allSources = dedupSources(pendingToolCalls.flatMap(t => t.sources ?? []))
  return {
    role: 'assistant',
    content,
    timestamp,
    toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
    sources: allSources.length > 0 ? allSources : undefined
  }
}

function mapMessages(history: AgnoMessage[]): MappedMessage[] {
  const now = new Date().toISOString()
  const result: MappedMessage[] = []
  const toolResults = indexToolResults(history)
  let pendingToolCalls: ToolCallOut[] = []

  for (const m of history) {
    if (m.role === 'user') {
      result.push({ role: 'user', content: m.content || '', timestamp: now })
      pendingToolCalls = []
      continue
    }

    if (m.role === 'assistant' && !m.content && m.tool_calls?.length) {
      pendingToolCalls.push(...resolveToolCalls(m.tool_calls, toolResults))
      continue
    }

    if (m.role === 'assistant' && m.content) {
      result.push(flushToolCalls(pendingToolCalls, m.content, now))
      pendingToolCalls = []
    }
  }

  if (pendingToolCalls.length > 0) {
    result.push(flushToolCalls(pendingToolCalls, '', now))
  }

  return result
}

/** Fetch session detail + runs and return a formatted response body. */
async function fetchSessionDetail(
  runtimeUrl: string,
  runtimeSecret: string,
  sessionId: string,
  userId: string | number
): Promise<Record<string, unknown> | null> {
  const encodedId = encodeURIComponent(sessionId)
  const params = new URLSearchParams({ type: 'agent', user_id: String(userId) })
  const [sessionRes, runsRes] = await Promise.all([
    runtimeFetch(`${runtimeUrl}/sessions/${encodedId}?${params}`, runtimeSecret, {
      signal: AbortSignal.timeout(5_000)
    }),
    runtimeFetch(`${runtimeUrl}/sessions/${encodedId}/runs?${params}`, runtimeSecret, {
      signal: AbortSignal.timeout(5_000)
    })
  ])
  if (!sessionRes.ok) return null

  const session = parseAgnoSession(await sessionRes.json())
  if (!session) return null

  const allMessages: AgnoMessage[] = runsRes.ok
    ? extractMessagesFromRuns(parseAgnoRuns(await runsRes.json()))
    : (session.chat_history ?? [])
  return {
    conversation_id: session.session_id,
    title: session.session_name,
    status: 'active',
    messages: mapMessages(allMessages),
    agentSlug: session.agent_id
  }
}

// ── GET handler ─────────────────────────────────────────────────────────

export function createSessionGetHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = getUserId(user)
    const url = new URL(req.url || '', 'http://localhost')
    const conversationId = url.searchParams.get('conversationId')
    const isActive = url.searchParams.get('active') === 'true'

    try {
      if (conversationId) {
        const ok = await config.validateSessionOwnership(conversationId, { user, payload, req })
        if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 })
        const detail = await fetchSessionDetail(config.runtimeUrl, config.runtimeSecret, conversationId, userId)
        return detail ? Response.json(detail) : Response.json(null, { status: 404 })
      }

      if (isActive) {
        return await handleActiveSession(config, user, userId, req)
      }

      return Response.json(null, { status: 400 })
    } catch (err) {
      console.error('[chat/session] fetch failed:', err)
      return Response.json(null, { status: 502 })
    }
  }
}

async function handleActiveSession(
  config: ResolvedPluginConfig,
  user: TypedUser,
  userId: string | number,
  req: import('payload').PayloadRequest
): Promise<Response> {
  const params = new URLSearchParams({
    type: 'agent',
    user_id: String(userId),
    sort_by: 'updated_at',
    sort_order: 'desc',
    limit: '10'
  })
  const listRes = await runtimeFetch(`${config.runtimeUrl}/sessions?${params}`, config.runtimeSecret, {
    signal: AbortSignal.timeout(5_000)
  })
  if (!listRes.ok) return Response.json(null)

  const listBody = (await listRes.json()) as { data: Array<{ session_id: string }> }
  const candidates = listBody.data || []
  let match: { session_id: string } | undefined
  for (const candidate of candidates) {
    const ok = await config.validateSessionOwnership(candidate.session_id, {
      user,
      payload: req.payload,
      req
    })
    if (ok) {
      match = candidate
      break
    }
  }
  if (!match) return Response.json(null)

  const detail = await fetchSessionDetail(config.runtimeUrl, config.runtimeSecret, match.session_id, userId)
  return detail ? Response.json(detail) : Response.json(null)
}

// ── PATCH handler ──────────────────────────────────────────────────────���

export function createSessionPatchHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = getUserId(user)
    const url = new URL(req.url || '', 'http://localhost')
    const conversationId = url.searchParams.get('conversationId')
    if (!conversationId) {
      return Response.json({ error: 'Missing conversationId' }, { status: 400 })
    }
    const ok = await config.validateSessionOwnership(conversationId, { user: user, payload, req })
    if (!ok) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { title?: string }
    try {
      body = (await req.json?.()) as { title?: string }
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    if (!body.title) {
      return Response.json({ error: 'Missing title' }, { status: 400 })
    }

    try {
      const renameParams = new URLSearchParams({ type: 'agent', user_id: String(userId) })
      const res = await runtimeFetch(
        `${config.runtimeUrl}/sessions/${encodeURIComponent(conversationId)}/rename?${renameParams}`,
        config.runtimeSecret,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_name: body.title }),
          signal: AbortSignal.timeout(5_000)
        }
      )
      if (!res.ok) {
        return Response.json({ error: 'Rename failed' }, { status: res.status })
      }
      return Response.json({ ok: true })
    } catch (err) {
      console.error('[chat/session] rename failed:', err)
      return Response.json({ error: 'Service unavailable' }, { status: 502 })
    }
  }
}

// ── DELETE handler ──────────────────────────────────────────────────────

export function createSessionDeleteHandler(config: ResolvedPluginConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = getUserId(user)
    const url = new URL(req.url || '', 'http://localhost')
    const conversationId = url.searchParams.get('conversationId')
    if (!conversationId) {
      return Response.json({ error: 'Missing conversationId' }, { status: 400 })
    }
    const ok = await config.validateSessionOwnership(conversationId, { user, payload, req })
    if (!ok) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      const deleteParams = new URLSearchParams({ type: 'agent', user_id: String(userId) })
      const res = await runtimeFetch(
        `${config.runtimeUrl}/sessions/${encodeURIComponent(conversationId)}?${deleteParams}`,
        config.runtimeSecret,
        {
          method: 'DELETE',
          signal: AbortSignal.timeout(5_000)
        }
      )
      if (!res.ok) {
        return Response.json({ error: 'Delete failed' }, { status: res.status })
      }
      return Response.json({ ok: true })
    } catch (err) {
      console.error('[chat/session] delete failed:', err)
      return Response.json({ error: 'Service unavailable' }, { status: 502 })
    }
  }
}
