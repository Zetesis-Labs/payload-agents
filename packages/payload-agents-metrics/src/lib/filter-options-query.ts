import { sql } from 'drizzle-orm'
import type { BasePayload, TypedUser, Where } from 'payload'
import type { AccessResult, ResolvedMetricsConfig } from '../types'
import { applyTenantScope } from './apply-tenant-scope'
import { type BaseFilters, buildWhere } from './build-where'
import { getDrizzle } from './db'

export interface FilterOption {
  label: string
  value: string
}

export interface FilterOptionsResult {
  options: FilterOption[]
  hasMore: boolean
}

const PAGE_SIZE = 10

function getTable(config: ResolvedMetricsConfig): string {
  return config.collectionSlug.replace(/-/g, '_')
}

export async function getFilterOptions(
  payload: BasePayload,
  config: ResolvedMetricsConfig,
  user: TypedUser,
  access: Exclude<AccessResult, null>,
  tenantIdParam: string | null,
  field: string | null,
  q: string
): Promise<FilterOptionsResult | null> {
  if (field === 'agent') {
    const where: Where = q ? { or: [{ slug: { like: q } }, { name: { like: q } }] } : {}
    const { docs } = await payload.find({
      collection: config.agentsSlug,
      where,
      limit: PAGE_SIZE + 1,
      depth: 0,
      pagination: false,
      overrideAccess: false,
      user
    })
    const hasMore = docs.length > PAGE_SIZE
    const options: FilterOption[] = docs.slice(0, PAGE_SIZE).map((d: Record<string, unknown>) => ({
      label: typeof d.name === 'string' ? `${d.name} (${d.slug})` : String(d.slug),
      value: String(d.slug)
    }))
    return { options, hasMore }
  }

  if (field === 'user') {
    const where: Where = q ? { email: { like: q } } : {}
    const { docs } = await payload.find({
      collection: config.usersSlug,
      where,
      limit: PAGE_SIZE + 1,
      depth: 0,
      pagination: false,
      overrideAccess: false,
      user
    })
    const hasMore = docs.length > PAGE_SIZE
    const options: FilterOption[] = docs.slice(0, PAGE_SIZE).map((d: Record<string, unknown>) => ({
      label: String(d.email),
      value: String(d.id)
    }))
    return { options, hasMore }
  }

  if (field === 'model') {
    const filters: BaseFilters = {}
    applyTenantScope(filters, config, access, tenantIdParam)
    const tenantWhere = buildWhere(filters)
    const searchClause = q ? sql`AND model ILIKE ${`%${q}%`}` : sql``
    const table = getTable(config)
    const db = getDrizzle(payload)

    const result = await db.execute(sql`
      SELECT DISTINCT model
      FROM ${sql.raw(`"${table}"`)}
      WHERE ${tenantWhere} ${searchClause}
      ORDER BY model
      LIMIT ${PAGE_SIZE + 1}
    `)

    const models = result.rows.map(r => String(r.model))
    const hasMore = models.length > PAGE_SIZE
    const options: FilterOption[] = models.slice(0, PAGE_SIZE).map(m => ({ label: m, value: m }))
    return { options, hasMore }
  }

  return null
}
