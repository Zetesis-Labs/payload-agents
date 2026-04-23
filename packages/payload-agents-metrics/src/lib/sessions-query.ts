import { sql } from 'drizzle-orm'
import type { BasePayload } from 'payload'
import type { ResolvedMetricsConfig } from '../types'
import { type BaseFilters, buildWhere } from './build-where'

const PAGE_SIZE = 50

export type SessionFilters = BaseFilters

export interface SessionRow {
  conversationId: string
  agentSlug: string
  model: string
  userId: number
  userLabel: string
  tenantId: number
  tenantLabel: string
  runs: number
  totalTokens: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  firstRunAt: string
  lastRunAt: string
  durationMs: number
  totalLatencyMs: number
  errors: number
  firstMessage: string | null
}

export interface SessionTotals {
  sessions: number
  runs: number
  costUsd: number
  totalTokens: number
}

export interface SessionsResult {
  sessions: SessionRow[]
  totals: SessionTotals
  page: number
  totalPages: number
}

interface DrizzleLike {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>
}

function getDrizzle(payload: BasePayload): DrizzleLike {
  return (payload.db as unknown as { drizzle: DrizzleLike }).drizzle
}

function getTable(config: ResolvedMetricsConfig): string {
  return config.collectionSlug.replace(/-/g, '_')
}

export async function getSessions(
  payload: BasePayload,
  config: ResolvedMetricsConfig,
  filters: SessionFilters,
  page: number
): Promise<SessionsResult> {
  const db = getDrizzle(payload)
  const where = buildWhere(filters)
  const table = getTable(config)

  const countResult = await db.execute(sql`
    SELECT COUNT(DISTINCT conversation_id)::bigint AS total
    FROM ${sql.raw(`"${table}"`)}
    WHERE ${where}
  `)
  const totalSessions = Number(countResult.rows[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(totalSessions / PAGE_SIZE))
  const requestedPage = Number.isFinite(page) ? page : 1
  const safePage = Math.min(Math.max(1, requestedPage), totalPages)
  const offset = (safePage - 1) * PAGE_SIZE

  const totalsResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT conversation_id)::bigint AS sessions,
      COUNT(*)::bigint AS runs,
      COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd,
      COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens
    FROM ${sql.raw(`"${table}"`)}
    WHERE ${where}
  `)
  const totalsRow = totalsResult.rows[0] || {}

  const sessionsResult = await db.execute(sql`
    SELECT
      conversation_id, agent_slug, model, user_id, tenant_id,
      COUNT(*)::bigint AS runs,
      COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd,
      MIN(completed_at) AS first_run_at,
      MAX(completed_at) AS last_run_at,
      COALESCE(SUM(latency_ms), 0)::bigint AS total_latency_ms,
      COUNT(*) FILTER (WHERE status = 'error')::bigint AS errors
    FROM ${sql.raw(`"${table}"`)}
    WHERE ${where}
    GROUP BY conversation_id, agent_slug, model, user_id, tenant_id
    ORDER BY MAX(completed_at) DESC NULLS LAST
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `)

  const rawSessions = sessionsResult.rows

  // Resolve user labels
  const userIds = [...new Set(rawSessions.map(r => Number(r.user_id)).filter(n => Number.isFinite(n)))]
  const userMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { docs } = await payload.find({
      collection: config.usersSlug,
      where: { id: { in: userIds } },
      depth: 0,
      pagination: false,
      limit: userIds.length
    })
    for (const d of docs) {
      const u = d as { email?: string; name?: string | null }
      userMap.set(String(d.id), u.name || u.email || String(d.id))
    }
  }

  // Resolve tenant labels
  const tenantIds = [...new Set(rawSessions.map(r => Number(r.tenant_id)).filter(n => Number.isFinite(n)))]
  const tenantMap = new Map<string, string>()
  if (tenantIds.length > 0) {
    const { docs } = await payload.find({
      collection: config.tenantsSlug,
      where: { id: { in: tenantIds } },
      depth: 0,
      pagination: false,
      limit: tenantIds.length
    })
    for (const d of docs) {
      tenantMap.set(String(d.id), (d as { name?: string }).name || String(d.id))
    }
  }

  // First messages from Agno
  const conversationIds = rawSessions
    .filter(r => r.conversation_id != null && r.conversation_id !== '')
    .map(r => String(r.conversation_id))
  const firstMessages = await batchFetchFirstMessages(db, conversationIds)

  const sessions: SessionRow[] = rawSessions.map(r => {
    const convId = String(r.conversation_id ?? '')
    const firstRunAt = r.first_run_at ? new Date(r.first_run_at as string).toISOString() : ''
    const lastRunAt = r.last_run_at ? new Date(r.last_run_at as string).toISOString() : ''
    const durationMs = firstRunAt && lastRunAt ? new Date(lastRunAt).getTime() - new Date(firstRunAt).getTime() : 0

    return {
      conversationId: convId,
      agentSlug: String(r.agent_slug ?? ''),
      model: String(r.model ?? ''),
      userId: Number(r.user_id ?? 0),
      userLabel: userMap.get(String(r.user_id)) ?? String(r.user_id),
      tenantId: Number(r.tenant_id ?? 0),
      tenantLabel: tenantMap.get(String(r.tenant_id)) ?? String(r.tenant_id),
      runs: Number(r.runs ?? 0),
      totalTokens: Number(r.total_tokens ?? 0),
      inputTokens: Number(r.input_tokens ?? 0),
      outputTokens: Number(r.output_tokens ?? 0),
      costUsd: Number(r.cost_usd ?? 0),
      firstRunAt,
      lastRunAt,
      durationMs,
      totalLatencyMs: Number(r.total_latency_ms ?? 0),
      errors: Number(r.errors ?? 0),
      firstMessage: firstMessages.get(convId) ?? null
    }
  })

  return {
    sessions,
    totals: {
      sessions: Number(totalsRow.sessions ?? 0),
      runs: Number(totalsRow.runs ?? 0),
      costUsd: Number(totalsRow.cost_usd ?? 0),
      totalTokens: Number(totalsRow.total_tokens ?? 0)
    },
    page: safePage,
    totalPages
  }
}

async function batchFetchFirstMessages(db: DrizzleLike, conversationIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (conversationIds.length === 0) return result

  let inClause = sql`session_id = ${conversationIds[0]}`
  for (let i = 1; i < conversationIds.length; i++) {
    inClause = sql`${inClause} OR session_id = ${conversationIds[i]}`
  }

  const rows = await db.execute(sql`
    SELECT session_id, runs
    FROM agno.agno_sessions
    WHERE ${inClause}
  `)

  for (const row of rows.rows) {
    const sessionId = String(row.session_id)
    let runs: Array<{ messages?: Array<{ role: string; content: unknown }> }> | null
    if (typeof row.runs === 'string') {
      try {
        runs = JSON.parse(row.runs)
      } catch {
        continue
      }
    } else {
      runs = row.runs as Array<{ messages?: Array<{ role: string; content: unknown }> }> | null
    }

    if (!runs) continue
    for (const run of runs) {
      if (!run.messages) continue
      const userMsg = run.messages.find(m => m.role === 'user')
      if (userMsg) {
        const content = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content)
        result.set(sessionId, content.slice(0, 200))
        break
      }
    }
  }

  return result
}
