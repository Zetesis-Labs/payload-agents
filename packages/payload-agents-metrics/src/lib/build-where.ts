import { sql } from 'drizzle-orm'

export interface BaseFilters {
  from?: string
  to?: string
  tenantIds?: Array<number | string>
  tenantId?: number | string
  agentSlug?: string
  userId?: number | string
  apiKeySource?: 'agent' | 'user'
  model?: string
  apiKeyFingerprint?: string
}

export function buildWhere(filters: BaseFilters): unknown {
  const clauses: unknown[] = [sql`1=1`]

  if (filters.from) clauses.push(sql`completed_at >= ${filters.from}::timestamptz`)
  if (filters.to) clauses.push(sql`completed_at < ${filters.to}::timestamptz`)

  if (filters.tenantIds && filters.tenantIds.length > 0) {
    const ids = filters.tenantIds.map(id => Number(id)).filter(n => Number.isFinite(n))
    if (ids.length > 0) {
      const placeholders = sql.join(
        ids.map(id => sql`${id}`),
        sql`, `
      )
      clauses.push(sql`tenant_id IN (${placeholders})`)
    } else clauses.push(sql`false`)
  } else if (filters.tenantId !== undefined) {
    clauses.push(sql`tenant_id = ${Number(filters.tenantId)}`)
  }

  if (filters.agentSlug) clauses.push(sql`agent_slug = ${filters.agentSlug}`)
  if (filters.userId !== undefined && filters.userId !== '') {
    const n = typeof filters.userId === 'number' ? filters.userId : Number(filters.userId)
    if (Number.isFinite(n)) {
      clauses.push(sql`user_id = ${n}`)
    } else {
      // Non-numeric id (e.g. mongo ObjectId). Cast the column to text so
      // both integer and varchar user_id columns work; trades the index for
      // correctness on the non-numeric path.
      clauses.push(sql`user_id::text = ${String(filters.userId)}`)
    }
  }
  if (filters.apiKeySource) clauses.push(sql`api_key_source = ${filters.apiKeySource}`)
  if (filters.model) clauses.push(sql`model = ${filters.model}`)
  if (filters.apiKeyFingerprint) clauses.push(sql`api_key_fingerprint = ${filters.apiKeyFingerprint}`)

  let combined = clauses[0]
  for (let i = 1; i < clauses.length; i++) {
    combined = sql`${combined} AND ${clauses[i]}`
  }
  return combined
}
