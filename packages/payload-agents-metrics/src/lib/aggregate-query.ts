import { sql } from 'drizzle-orm'
import type { BasePayload } from 'payload'
import type { ResolvedMetricsConfig } from '../types'
import { type BaseFilters, buildWhere } from './build-where'

export type GroupBy = 'tenant' | 'agent' | 'user' | 'model' | 'apiKeySource' | 'apiKeyFingerprint' | 'day'

export type AggregateFilters = BaseFilters

export interface BucketRow {
  key: string
  label: string
  keys: Record<string, string>
  labels: Record<string, string>
  totalTokens: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  events: number
}

export interface SeriesRow {
  day: string
  totalTokens: number
  costUsd: number
  events: number
}

export interface Totals {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  events: number
}

interface DrizzleLike {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>
}

const GROUP_COLUMN: Record<GroupBy, string> = {
  tenant: 'tenant_id',
  agent: 'agent_slug',
  user: 'user_id',
  model: 'model',
  apiKeySource: 'api_key_source',
  apiKeyFingerprint: 'api_key_fingerprint',
  day: "to_char(date_trunc('day', completed_at), 'YYYY-MM-DD')"
}

function getDrizzle(payload: BasePayload): DrizzleLike {
  return (payload.db as unknown as { drizzle: DrizzleLike }).drizzle
}

function getTable(config: ResolvedMetricsConfig): string {
  return config.collectionSlug.replace(/-/g, '_')
}

export async function getTotals(
  payload: BasePayload,
  config: ResolvedMetricsConfig,
  filters: AggregateFilters
): Promise<Totals> {
  const where = buildWhere(filters)
  const table = getTable(config)
  const result = await getDrizzle(payload).execute(sql`
    SELECT
      COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd,
      COUNT(*)::bigint AS events
    FROM ${sql.raw(`"${table}"`)}
    WHERE ${where}
  `)
  const row = result.rows[0] || {}
  return {
    totalTokens: Number(row.total_tokens ?? 0),
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    events: Number(row.events ?? 0)
  }
}

export async function getBuckets(
  payload: BasePayload,
  config: ResolvedMetricsConfig,
  groupBy: GroupBy[],
  filters: AggregateFilters
): Promise<BucketRow[]> {
  if (groupBy.length === 0) return []
  const where = buildWhere(filters)
  const table = getTable(config)
  const columns = groupBy.map(g => GROUP_COLUMN[g])
  const selectParts = groupBy.map((g, i) => `${columns[i]} AS "dim_${g}"`).join(', ')
  const groupByParts = columns.join(', ')

  const result = await getDrizzle(payload).execute(sql`
    SELECT
      ${sql.raw(selectParts)},
      COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
      COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
      COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd,
      COUNT(*)::bigint AS events
    FROM ${sql.raw(`"${table}"`)}
    WHERE ${where}
    GROUP BY ${sql.raw(groupByParts)}
    ORDER BY cost_usd DESC NULLS LAST
    LIMIT 200
  `)

  return result.rows.map(row => {
    const keys: Record<string, string> = {}
    for (const g of groupBy) {
      const val = row[`dim_${g}`]
      keys[g] = val === null || val === undefined ? '∅' : String(val)
    }
    const key = groupBy.map(g => keys[g]).join('||')
    return {
      key,
      label: key,
      keys,
      labels: { ...keys },
      totalTokens: Number(row.total_tokens ?? 0),
      inputTokens: Number(row.input_tokens ?? 0),
      outputTokens: Number(row.output_tokens ?? 0),
      costUsd: Number(row.cost_usd ?? 0),
      events: Number(row.events ?? 0)
    }
  })
}

export async function getSeries(
  payload: BasePayload,
  config: ResolvedMetricsConfig,
  filters: AggregateFilters
): Promise<SeriesRow[]> {
  const where = buildWhere(filters)
  const table = getTable(config)
  const result = await getDrizzle(payload).execute(sql`
    SELECT
      to_char(date_trunc('day', completed_at), 'YYYY-MM-DD') AS day,
      COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
      COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd,
      COUNT(*)::bigint AS events
    FROM ${sql.raw(`"${table}"`)}
    WHERE ${where}
    GROUP BY 1
    ORDER BY 1 ASC
  `)
  return result.rows.map(row => ({
    day: String(row.day),
    totalTokens: Number(row.total_tokens ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    events: Number(row.events ?? 0)
  }))
}

export async function decorateBuckets(
  payload: BasePayload,
  config: ResolvedMetricsConfig,
  groupBy: GroupBy[],
  buckets: BucketRow[]
): Promise<BucketRow[]> {
  if (buckets.length === 0) return buckets

  if (groupBy.includes('tenant')) {
    const ids = [...new Set(buckets.map(b => Number(b.keys.tenant)).filter(n => Number.isFinite(n)))]
    if (ids.length > 0) {
      const { docs } = await payload.find({
        collection: config.tenantsSlug,
        where: { id: { in: ids } },
        depth: 0,
        pagination: false,
        limit: ids.length
      })
      const map = new Map(docs.map(d => [String(d.id), (d as { name?: string }).name || String(d.id)]))
      for (const b of buckets) b.labels.tenant = map.get(b.keys.tenant) ?? b.keys.tenant
    }
  }

  if (groupBy.includes('user')) {
    const ids = [...new Set(buckets.map(b => Number(b.keys.user)).filter(n => Number.isFinite(n)))]
    if (ids.length > 0) {
      const { docs } = await payload.find({
        collection: config.usersSlug,
        where: { id: { in: ids } },
        depth: 0,
        pagination: false,
        limit: ids.length
      })
      const map = new Map(
        docs.map(d => {
          const u = d as { email?: string; name?: string | null }
          return [String(d.id), u.name || u.email || String(d.id)]
        })
      )
      for (const b of buckets) b.labels.user = map.get(b.keys.user) ?? b.keys.user
    }
  }

  if (groupBy.includes('apiKeySource')) {
    for (const b of buckets) {
      const v = b.keys.apiKeySource
      b.labels.apiKeySource = v === 'agent' ? 'Agent (platform key)' : v === 'user' ? 'User (BYOK)' : v
    }
  }

  for (const b of buckets) b.label = groupBy.map(g => b.labels[g]).join(' / ')
  return buckets
}
