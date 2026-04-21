import type { PayloadHandler } from 'payload'
import {
  type AggregateFilters,
  decorateBuckets,
  type GroupBy,
  getBuckets,
  getSeries,
  getTotals
} from '../lib/aggregate-query'
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

function parseGroupBy(value: string | null): GroupBy[] {
  if (!value) return ['tenant']
  const parts = value.split(',').filter((v): v is GroupBy => VALID_GROUP_BY.has(v as GroupBy))
  return parts.length > 0 ? parts : ['tenant']
}

export function createAggregateHandler(config: ResolvedMetricsConfig): PayloadHandler {
  return async req => {
    const { user, payload } = req
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await config.checkAccess(payload, user as unknown as Record<string, unknown>)
    if (!access) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url || '', 'http://localhost')
    const groupBy = parseGroupBy(url.searchParams.get('groupBy'))
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

    if ('allTenants' in access) {
      if (tenantIdParam) filters.tenantId = tenantIdParam
    } else {
      if (tenantIdParam && access.tenantIds.includes(Number(tenantIdParam))) {
        filters.tenantId = tenantIdParam
      } else {
        filters.tenantIds = access.tenantIds
      }
    }

    const [totals, bucketsPageResult, series] = await Promise.all([
      getTotals(payload, config, filters),
      getBuckets(payload, config, groupBy, filters, bucketsPage),
      getSeries(payload, config, filters)
    ])

    const buckets = await decorateBuckets(payload, config, groupBy, bucketsPageResult.rows)
    return Response.json({
      groupBy,
      filters,
      totals,
      buckets,
      bucketsPage: bucketsPageResult.page,
      bucketsTotalPages: bucketsPageResult.totalPages,
      bucketsTotal: bucketsPageResult.totalBuckets,
      series
    })
  }
}
