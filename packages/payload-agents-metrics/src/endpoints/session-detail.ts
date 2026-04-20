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

function extractSources(result: unknown): Array<{ id: string; title: string; slug: string; type: string }> {
  // Lightweight extraction — avoids TOON dependency for portability.
  // Consumers with @toon-format/toon can use extractSources from payload-agents-core.
  if (typeof result !== 'string') return []
  try {
    const { decode } = require('@toon-format/toon') as { decode: (s: string) => unknown }
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

function mapMessages(allMessages: AgnoMessage[]): MappedMessage[] {
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
        const sources = resultContent ? extractSources(resultContent) : []
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

    return Response.json({ messages: mapMessages(allMessages) })
  }
}
