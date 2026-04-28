import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { buildWhere } from './build-where'

const dialect = new PgDialect()

/** Serialize a drizzle SQL object to a { sql, params } pair for inspection. */
function serialize(q: unknown): { sql: string; params: unknown[] } {
  return dialect.sqlToQuery(q as SQL<unknown>)
}

describe('buildWhere — empty filters', () => {
  it('returns the always-true baseline when no filter is given', () => {
    const { sql, params } = serialize(buildWhere({}))
    expect(sql.replace(/\s+/g, ' ').trim()).toBe('1=1')
    expect(params).toEqual([])
  })
})

describe('buildWhere — date range', () => {
  it('adds completed_at >= when `from` is set', () => {
    const { sql, params } = serialize(buildWhere({ from: '2026-01-01' }))
    expect(sql).toContain('completed_at >=')
    expect(sql).toContain('::timestamptz')
    expect(params).toContain('2026-01-01')
  })

  it('adds completed_at < when `to` is set (half-open interval)', () => {
    const { sql, params } = serialize(buildWhere({ to: '2026-02-01' }))
    expect(sql).toContain('completed_at <')
    expect(sql).not.toContain('completed_at <=')
    expect(params).toContain('2026-02-01')
  })

  it('emits both bounds when from and to are set', () => {
    const { sql, params } = serialize(buildWhere({ from: '2026-01-01', to: '2026-02-01' }))
    expect(sql).toContain('completed_at >=')
    expect(sql).toContain('completed_at <')
    expect(params).toEqual(['2026-01-01', '2026-02-01'])
  })
})

describe('buildWhere — tenant scoping', () => {
  it('uses tenant_id IN (...) when tenantIds has values', () => {
    const { sql, params } = serialize(buildWhere({ tenantIds: [1, 2, 3] }))
    expect(sql).toContain('tenant_id IN (')
    // Guard against regression to `ANY(($1, $2, $3))` which is invalid Postgres.
    expect(sql).not.toContain('ANY(')
    expect(params).toEqual([1, 2, 3])
  })

  it('coerces string-numeric tenantIds to numbers', () => {
    const { params } = serialize(buildWhere({ tenantIds: ['1', '2'] }))
    expect(params).toEqual([1, 2])
  })

  it('drops non-numeric tenantIds and keeps the rest', () => {
    const { params } = serialize(buildWhere({ tenantIds: [1, 'abc', 2] }))
    expect(params).toEqual([1, 2])
  })

  it('degenerates to `false` when every tenantId is non-numeric (deny-by-default)', () => {
    const { sql, params } = serialize(buildWhere({ tenantIds: ['abc', 'xyz'] }))
    expect(sql.toLowerCase()).toContain('false')
    expect(params).toEqual([])
  })

  it('falls back to single tenantId when tenantIds is empty', () => {
    const { sql, params } = serialize(buildWhere({ tenantIds: [], tenantId: 5 }))
    expect(sql).toContain('tenant_id =')
    expect(sql).not.toContain('ANY(')
    expect(params).toEqual([5])
  })

  it('uses single tenant_id = $n when only tenantId is given', () => {
    const { sql, params } = serialize(buildWhere({ tenantId: 7 }))
    expect(sql).toContain('tenant_id =')
    expect(params).toEqual([7])
  })

  it('coerces a string tenantId to number', () => {
    const { params } = serialize(buildWhere({ tenantId: '9' }))
    expect(params).toEqual([9])
  })

  it('ignores tenant when neither tenantIds nor tenantId are provided', () => {
    const { sql } = serialize(buildWhere({ agentSlug: 'x' }))
    expect(sql).not.toContain('tenant_id')
  })
})

describe('buildWhere — agentSlug', () => {
  it('adds agent_slug = $n when provided', () => {
    const { sql, params } = serialize(buildWhere({ agentSlug: 'bastos' }))
    expect(sql).toContain('agent_slug =')
    expect(params).toEqual(['bastos'])
  })

  it('ignores an empty agentSlug', () => {
    const { sql } = serialize(buildWhere({ agentSlug: '' }))
    expect(sql).not.toContain('agent_slug')
  })
})

describe('buildWhere — userId', () => {
  it('uses user_id = $n for numeric ids (indexable path)', () => {
    const { sql, params } = serialize(buildWhere({ userId: 42 }))
    expect(sql).toContain('user_id =')
    expect(sql).not.toContain('user_id::text')
    expect(params).toEqual([42])
  })

  it('coerces a string-numeric userId to number', () => {
    const { sql, params } = serialize(buildWhere({ userId: '42' }))
    expect(sql).not.toContain('user_id::text')
    expect(params).toEqual([42])
  })

  it('casts to text when the userId is non-numeric (e.g. mongo ObjectId)', () => {
    const { sql, params } = serialize(buildWhere({ userId: '507f1f77bcf86cd799439011' }))
    expect(sql).toContain('user_id::text =')
    expect(params).toEqual(['507f1f77bcf86cd799439011'])
  })

  it('ignores an empty-string userId', () => {
    const { sql } = serialize(buildWhere({ userId: '' }))
    expect(sql).not.toContain('user_id')
  })
})

describe('buildWhere — other single-value filters', () => {
  it('adds api_key_source = $n when provided', () => {
    const { sql, params } = serialize(buildWhere({ apiKeySource: 'agent' }))
    expect(sql).toContain('api_key_source =')
    expect(params).toEqual(['agent'])
  })

  it('adds model = $n when provided', () => {
    const { sql, params } = serialize(buildWhere({ model: 'gpt-4o' }))
    expect(sql).toContain('model =')
    expect(params).toEqual(['gpt-4o'])
  })

  it('adds api_key_fingerprint = $n when provided', () => {
    const { sql, params } = serialize(buildWhere({ apiKeyFingerprint: 'ABCD' }))
    expect(sql).toContain('api_key_fingerprint =')
    expect(params).toEqual(['ABCD'])
  })
})

describe('buildWhere — composition', () => {
  it('AND-joins every clause in insertion order', () => {
    const { sql, params } = serialize(
      buildWhere({
        from: '2026-01-01',
        to: '2026-02-01',
        tenantId: 1,
        agentSlug: 'bastos',
        userId: 42,
        model: 'gpt-4o-mini'
      })
    )
    expect(sql.toUpperCase()).toContain(' AND ')
    expect(sql).toContain('completed_at >=')
    expect(sql).toContain('completed_at <')
    expect(sql).toContain('tenant_id =')
    expect(sql).toContain('agent_slug =')
    expect(sql).toContain('user_id =')
    expect(sql).toContain('model =')
    expect(params).toEqual(['2026-01-01', '2026-02-01', 1, 'bastos', 42, 'gpt-4o-mini'])
  })
})
