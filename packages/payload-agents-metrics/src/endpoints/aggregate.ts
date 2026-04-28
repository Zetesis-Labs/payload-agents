import type { PayloadHandler } from 'payload'
import {
  type AggregateFilters,
  decorateBuckets,
  type GroupBy,
  getBuckets,
  getSeries,
  getTopBuckets,
  getTotals
} from '../lib/aggregate-query'
import { applyTenantScope } from '../lib/apply-tenant-scope'
import type { ResolvedMetricsConfig } from '../types'

const VALID_GROUP_BY = new Set<GroupBy>([
  'tenant',
  'agent',
  'user',
  'model',
  'apiKeySource',
  'apiKeyFingerprint',
  'day'
])

function parseGroupBy(value: string | null, multiTenant: boolean): GroupBy[] {
  const defaultGroup: GroupBy = multiTenant ? 'tenant' : 'agent'
  if (!value) return [defaultGroup]
  const parts = value.split(',').filter((v): v is GroupBy => VALID_GROUP_BY.has(v as GroupBy))
  // When multiTenant is false the `tenant` column does not exist in the table;
  // silently drop the dimension instead of crashing the query.
  const scoped = multiTenant ? parts : parts.filter(g => g !== 'tenant')
  return scoped.length > 0 ? scoped : [defaultGroup]
}

export function createAggregateHandler(config: ResolvedMetricsConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await config.checkAccess(payload, user)
    if (!access) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url || '', 'http://localhost')
    const groupBy = parseGroupBy(url.searchParams.get('groupBy'), config.multiTenant)
    const from = url.searchParams.get('from') ?? undefined
    const to = url.searchParams.get('to') ?? undefined
    const tenantIdParam = url.searchParams.get('tenantId')
    const agentSlug = url.searchParams.get('agentSlug') ?? undefined
    const userId = url.searchParams.get('userId') ?? undefined
    const apiKeySourceParam = url.searchParams.get('apiKeySource')
    const apiKeySource = apiKeySourceParam === 'agent' || apiKeySourceParam === 'user' ? apiKeySourceParam : undefined
    const model = url.searchParams.get('model') ?? undefined
    const apiKeyFingerprint = url.searchParams.get('apiKeyFingerprint') ?? undefined
    const bucketsPage = Math.max(1, Number(url.searchParams.get('bucketsPage') ?? 1))

    const filters: AggregateFilters = { from, to, agentSlug, userId, apiKeySource, model, apiKeyFingerprint }
    applyTenantScope(filters, config, access, tenantIdParam)

    const [totals, bucketsPageResult, rawTopBuckets, series] = await Promise.all([
      getTotals(payload, config, filters),
      getBuckets(payload, config, groupBy, filters, bucketsPage),
      getTopBuckets(payload, config, groupBy, filters),
      getSeries(payload, config, filters)
    ])

    const [buckets, topBuckets] = await Promise.all([
      decorateBuckets(payload, config, groupBy, bucketsPageResult.rows),
      decorateBuckets(payload, config, groupBy, rawTopBuckets)
    ])
    return Response.json({
      groupBy,
      filters,
      totals,
      buckets,
      topBuckets,
      bucketsPage: bucketsPageResult.page,
      bucketsTotalPages: bucketsPageResult.totalPages,
      bucketsTotal: bucketsPageResult.totalBuckets,
      series
    })
  }
}
