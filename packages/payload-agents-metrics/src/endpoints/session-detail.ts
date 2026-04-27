import { type AgnoMessage, extractMessagesFromRuns, parseAgnoRuns } from '@zetesis/payload-agents-core'
import { sql } from 'drizzle-orm'
import type { PayloadHandler } from 'payload'
import { getDrizzle } from '../lib/db'
import type { ResolvedMetricsConfig } from '../types'

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
      .catch(err => {
        console.warn('[metrics] @toon-format/toon failed to load; tool-call sources disabled:', err)
        return null
      })
  }
  return toonDecodePromise
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = record[k]
    if (typeof v === 'string' && v.length > 0) return v
    if (typeof v === 'number') return String(v)
  }
  return ''
}

async function extractSources(
  result: unknown
): Promise<Array<{ id: string; title: string; slug: string; type: string }>> {
  if (typeof result !== 'string') return []
  const decode = await getToonDecode()
  if (!decode) return []
  try {
    const data = decode(result)
    const hits = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { hits?: unknown }).hits)
        ? (data as { hits: unknown[] }).hits
        : null
    if (!hits) return []
    const sources: Array<{ id: string; title: string; slug: string; type: string }> = []
    for (const h of hits) {
      if (!h || typeof h !== 'object' || !('chunk_id' in h)) continue
      const it = h as Record<string, unknown>
      sources.push({
        id: pickString(it, 'chunk_id'),
        title: pickString(it, 'title', 'document_title'),
        slug: pickString(it, 'slug', 'document_slug'),
        type: (pickString(it, 'collection') || 'posts_chunk').replace(/_chunk$/, '')
      })
    }
    return sources
  } catch (err) {
    console.warn('[metrics] Failed to extract tool-call sources:', err instanceof Error ? err.message : err)
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

    const access = await config.checkAccess(payload, user)
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
          and: [{ conversationId: { equals: conversationId } }, { tenant: { in: access.tenantIds } }]
        },
        overrideAccess: true
      })
      if (ownsConversation.totalDocs === 0) {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const db = getDrizzle(payload)
    const result = await db.execute(sql`
      SELECT runs FROM ${sql.raw(config.agnoSessionsTable)} WHERE session_id = ${conversationId} LIMIT 1
    `)

    const row = result.rows[0]
    if (!row?.runs) return Response.json({ messages: [] })

    let rawRuns: unknown
    if (typeof row.runs === 'string') {
      try {
        rawRuns = JSON.parse(row.runs)
      } catch {
        return Response.json({ messages: [] })
      }
    } else {
      rawRuns = row.runs
    }

    const allMessages: AgnoMessage[] = extractMessagesFromRuns(parseAgnoRuns(rawRuns))
    return Response.json({ messages: await mapMessages(allMessages) })
  }
}
