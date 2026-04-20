import { sql } from 'drizzle-orm'
import type { PayloadHandler } from 'payload'
import type { ResolvedMetricsConfig } from '../types'

interface DrizzleLike {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>
}

function getDrizzle(payload: { db: unknown }): DrizzleLike {
  return (payload.db as unknown as { drizzle: DrizzleLike }).drizzle
}

interface AgnoMessage {
  role: string
  content?: string | null
  tool_name?: string
  tool_call_id?: string
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
}

interface ToolCallOut {
  id: string
  name: string
  input: Record<string, unknown>
  result?: string
  sources?: Array<{ id: string; title: string; slug: string; type: string }>
}

interface MappedMessage {
  role: string
  content: string
  toolCalls?: ToolCallOut[]
  sources?: Array<{ id: string; title: string; slug: string; type: string }>
}

let toonDecodePromise: Promise<((s: string) => unknown) | null> | null = null
function getToonDecode(): Promise<((s: string) => unknown) | null> {
  if (!toonDecodePromise) {
    toonDecodePromise = import('@toon-format/toon')
      .then(mod => (mod as { decode: (s: string) => unknown }).decode)
      .catch(() => null)
  }
  return toonDecodePromise
}

async function extractSources(result: unknown): Promise<Array<{ id: string; title: string; slug: string; type: string }>> {
  if (typeof result !== 'string') return []
  const decode = await getToonDecode()
  if (!decode) return []
  try {
    const data = decode(result) as Record<string, unknown>
    const hits = Array.isArray(data) ? data : (data.hits as unknown[])
    if (!Array.isArray(hits)) return []
    return hits
      .filter(h => h && typeof h === 'object' && 'chunk_id' in h)
      .map(h => {
        const it = h as Record<string, string>
        return {
          id: it.chunk_id || '',
          title: it.title || it.document_title || '',
          slug: it.slug || it.document_slug || '',
          type: (it.collection || 'posts_chunk').replace(/_chunk$/, '')
        }
      })
  } catch {
    return []
  }
}

async function mapMessages(allMessages: AgnoMessage[]): Promise<MappedMessage[]> {
  const result: MappedMessage[] = []
  const toolResults = new Map<string, AgnoMessage>()
  for (const m of allMessages) {
    if (m.role === 'tool' && m.tool_call_id) toolResults.set(m.tool_call_id, m)
  }

  let pendingToolCalls: ToolCallOut[] = []
  for (const m of allMessages) {
    if (m.role === 'user') {
      result.push({ role: 'user', content: m.content || '' })
      pendingToolCalls = []
      continue
    }
    if (m.role === 'assistant' && !m.content && m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(tc.function.arguments) as Record<string, unknown>
        } catch {
          /* */
        }
        const toolResult = toolResults.get(tc.id)
        const resultContent = toolResult?.content || undefined
        const sources = resultContent ? await extractSources(resultContent) : []
        pendingToolCalls.push({
          id: tc.id,
          name: tc.function.name,
          input,
          result: resultContent,
          sources: sources.length > 0 ? sources : undefined
        })
      }
      continue
    }
    if (m.role === 'assistant' && m.content) {
      const allSources = pendingToolCalls.flatMap(t => t.sources ?? [])
      const uniqueSources = [...new Map(allSources.map(s => [s.id, s])).values()]
      result.push({
        role: 'assistant',
        content: m.content,
        toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
        sources: uniqueSources.length > 0 ? uniqueSources : undefined
      })
      pendingToolCalls = []
    }
  }
  if (pendingToolCalls.length > 0) {
    const allSources = pendingToolCalls.flatMap(t => t.sources ?? [])
    const uniqueSources = [...new Map(allSources.map(s => [s.id, s])).values()]
    result.push({
      role: 'assistant',
      content: '',
      toolCalls: pendingToolCalls,
      sources: uniqueSources.length > 0 ? uniqueSources : undefined
    })
  }
  return result
}

export function createSessionDetailHandler(config: ResolvedMetricsConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await config.checkAccess(payload, user as unknown as Record<string, unknown>)
    if (!access) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url || '', 'http://localhost')
    const conversationId = url.searchParams.get('conversationId')
    if (!conversationId) return Response.json({ error: 'conversationId is required' }, { status: 400 })

    // Enforce tenant scoping: a tenant-scoped user must own at least one event
    // for this conversationId before we expose the agno run payload.
    if (!('allTenants' in access) && config.multiTenant) {
      const ownsConversation = await payload.count({
        collection: config.collectionSlug,
        where: {
          and: [
            { conversationId: { equals: conversationId } },
            { tenant: { in: access.tenantIds } }
          ]
        },
        overrideAccess: true
      })
      if (ownsConversation.totalDocs === 0) {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const db = getDrizzle(payload)
    const result = await db.execute(sql`
      SELECT runs FROM agno.agno_sessions WHERE session_id = ${conversationId} LIMIT 1
    `)

    const row = result.rows[0]
    if (!row?.runs) return Response.json({ messages: [] })

    const runs = (typeof row.runs === 'string' ? JSON.parse(row.runs) : row.runs) as Array<{
      messages?: AgnoMessage[]
    }>

    const allMessages: AgnoMessage[] = []
    for (const run of runs) {
      if (run.messages) allMessages.push(...run.messages)
    }

    return Response.json({ messages: await mapMessages(allMessages) })
  }
}
