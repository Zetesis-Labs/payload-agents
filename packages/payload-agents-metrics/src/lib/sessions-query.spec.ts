import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { BasePayload } from 'payload'
import { describe, expect, it, vi } from 'vitest'
import type { ResolvedMetricsConfig } from '../types'
import { getSessions } from './sessions-query'

const dialect = new PgDialect()

function makePayload(
  options: {
    /** One array per successive db.execute call, in order. */
    executes?: Array<Record<string, unknown>[]>
    findDocs?: Record<string, unknown>[]
  } = {}
) {
  const execute = vi.fn<(q: unknown) => Promise<{ rows: Record<string, unknown>[] }>>()
  for (const rows of options.executes ?? []) {
    execute.mockResolvedValueOnce({ rows })
  }
  // Fallback so any unexpected extra call doesn't hang the test.
  execute.mockResolvedValue({ rows: [] })

  const find = vi.fn(async () => ({ docs: options.findDocs ?? [] }))
  const payload = {
    db: { drizzle: { execute } },
    find
  } as unknown as BasePayload
  return { payload, execute, find }
}

function baseConfig(overrides: Partial<ResolvedMetricsConfig> = {}): ResolvedMetricsConfig {
  return {
    multiTenant: true,
    checkAccess: async () => ({ allTenants: true }),
    resolveTenantId: async () => null,
    basePath: '/metrics',
    ingestSecret: 'dev',
    collectionSlug: 'llm-usage-events',
    usersSlug: 'users',
    tenantsSlug: 'tenants',
    agentsSlug: 'agents',
    collectionOverrides: undefined,
    extraPricing: {},
    ...overrides
  }
}

/** Queries run by getSessions in order: count, totals, sessions, agno-first-messages. */
function plan(
  countTotal: number,
  totals: Record<string, unknown>,
  sessions: Record<string, unknown>[],
  agnoRows: Record<string, unknown>[] = []
) {
  return [[{ total: String(countTotal) }], [totals], sessions, agnoRows]
}

describe('getSessions — single-tenant mode', () => {
  it('exposes tenantId=0 and empty tenantLabel when the row has no tenant_id', async () => {
    const rowNoTenant = { conversation_id: 'a', user_id: 1, first_run_at: null, last_run_at: null }
    const { payload } = makePayload({ executes: plan(1, {}, [rowNoTenant]) })
    const result = await getSessions(payload, baseConfig({ multiTenant: false }), {}, 1)
    expect(result.sessions[0]?.tenantId).toBe(0)
    expect(result.sessions[0]?.tenantLabel).toBe('')
  })


  it('does not mention tenant_id in the sessions SQL when multiTenant is false', async () => {
    const { payload, execute } = makePayload({ executes: plan(0, {}, []) })
    await getSessions(payload, baseConfig({ multiTenant: false }), {}, 1)
    // Query index 2 is the main sessions SELECT/GROUP BY.
    const sessionsQuery = execute.mock.calls[2]?.[0]
    const { sql } = dialect.sqlToQuery(sessionsQuery as SQL<unknown>)
    expect(sql).not.toContain('tenant_id')
  })

  it('keeps tenant_id in the SQL when multiTenant is true', async () => {
    const { payload, execute } = makePayload({ executes: plan(0, {}, []) })
    await getSessions(payload, baseConfig({ multiTenant: true }), {}, 1)
    const sessionsQuery = execute.mock.calls[2]?.[0]
    const { sql } = dialect.sqlToQuery(sessionsQuery as SQL<unknown>)
    expect(sql).toContain('tenant_id')
  })
})

describe('getSessions — totals', () => {
  it('maps the totals row into camelCase', async () => {
    const { payload } = makePayload({
      executes: plan(0, { sessions: '3', runs: '12', cost_usd: '0.75', total_tokens: '1500' }, [])
    })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.totals).toEqual({ sessions: 3, runs: 12, costUsd: 0.75, totalTokens: 1500 })
  })

  it('returns zeros when the totals row is empty', async () => {
    const { payload } = makePayload({ executes: [[{ total: '0' }], [], []] })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.totals).toEqual({ sessions: 0, runs: 0, costUsd: 0, totalTokens: 0 })
  })
})

describe('getSessions — pagination', () => {
  it('reports totalPages from the count query', async () => {
    const { payload } = makePayload({ executes: plan(120, {}, []) })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.totalPages).toBe(Math.ceil(120 / 50))
  })

  it('clamps page below 1 to page 1 (offset must not be negative)', async () => {
    const { payload } = makePayload({ executes: plan(10, {}, []) })
    const result = await getSessions(payload, baseConfig(), {}, 0)
    expect(result.page).toBe(1)
  })

  it('clamps page above totalPages to the last page', async () => {
    const { payload } = makePayload({ executes: plan(10, {}, []) })
    const result = await getSessions(payload, baseConfig(), {}, 999)
    expect(result.page).toBe(1)
  })

  it('clamps NaN page to page 1', async () => {
    const { payload } = makePayload({ executes: plan(10, {}, []) })
    const result = await getSessions(payload, baseConfig(), {}, Number.NaN)
    expect(result.page).toBe(1)
  })
})

describe('getSessions — session row mapping', () => {
  const oneSession = {
    conversation_id: 'sess-1',
    agent_slug: 'bastos',
    model: 'gpt-4o',
    user_id: 42,
    tenant_id: 7,
    runs: '3',
    total_tokens: '1000',
    input_tokens: '600',
    output_tokens: '400',
    cost_usd: '0.25',
    first_run_at: '2026-04-20T10:00:00.000Z',
    last_run_at: '2026-04-20T10:05:30.000Z',
    total_latency_ms: '12345',
    errors: '1'
  }

  it('maps snake_case columns into camelCase, with numeric aggregates', async () => {
    const { payload } = makePayload({ executes: plan(1, {}, [oneSession]) })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    const s = result.sessions[0]
    expect(s?.conversationId).toBe('sess-1')
    expect(s?.agentSlug).toBe('bastos')
    expect(s?.model).toBe('gpt-4o')
    expect(s?.runs).toBe(3)
    expect(s?.totalTokens).toBe(1000)
    expect(s?.inputTokens).toBe(600)
    expect(s?.outputTokens).toBe(400)
    expect(s?.costUsd).toBe(0.25)
    expect(s?.totalLatencyMs).toBe(12345)
    expect(s?.errors).toBe(1)
  })

  it('computes durationMs from first_run_at and last_run_at', async () => {
    const { payload } = makePayload({ executes: plan(1, {}, [oneSession]) })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    // 10:00:00 → 10:05:30 = 330 seconds = 330_000 ms
    expect(result.sessions[0]?.durationMs).toBe(330_000)
  })

  it('emits empty ISO strings and 0 duration when timestamps are missing', async () => {
    const { payload } = makePayload({
      executes: plan(1, {}, [{ ...oneSession, first_run_at: null, last_run_at: null }])
    })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.sessions[0]?.firstRunAt).toBe('')
    expect(result.sessions[0]?.lastRunAt).toBe('')
    expect(result.sessions[0]?.durationMs).toBe(0)
  })
})

describe('getSessions — label resolution', () => {
  it('resolves userLabel from name → email → id', async () => {
    const { payload } = makePayload({
      executes: plan(3, {}, [
        { conversation_id: 'a', user_id: 1, tenant_id: 0, first_run_at: null, last_run_at: null },
        { conversation_id: 'b', user_id: 2, tenant_id: 0, first_run_at: null, last_run_at: null },
        { conversation_id: 'c', user_id: 3, tenant_id: 0, first_run_at: null, last_run_at: null }
      ]),
      findDocs: [{ id: 1, name: 'Alice', email: 'a@x' }, { id: 2, email: 'b@x' }, { id: 3 }]
    })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.sessions[0]?.userLabel).toBe('Alice')
    expect(result.sessions[1]?.userLabel).toBe('b@x')
    expect(result.sessions[2]?.userLabel).toBe('3')
  })

  it('resolves tenantLabel from name, falling back to id', async () => {
    const { payload } = makePayload({
      executes: plan(2, {}, [
        { conversation_id: 'a', user_id: 0, tenant_id: 7, first_run_at: null, last_run_at: null },
        { conversation_id: 'b', user_id: 0, tenant_id: 8, first_run_at: null, last_run_at: null }
      ]),
      findDocs: [{ id: 7, name: 'Acme' }]
      // tenant 8 is not returned → falls back to '8'
    })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.sessions[0]?.tenantLabel).toBe('Acme')
    expect(result.sessions[1]?.tenantLabel).toBe('8')
  })
})

describe('getSessions — first message lookup', () => {
  it('extracts the first user message from agno runs', async () => {
    const { payload } = makePayload({
      executes: [
        [{ total: '1' }],
        [{}],
        [{ conversation_id: 'sess-1', user_id: 0, tenant_id: 0, first_run_at: null, last_run_at: null }],
        [
          {
            session_id: 'sess-1',
            runs: [
              {
                messages: [
                  { role: 'system', content: 'you are an assistant' },
                  { role: 'user', content: 'hola mundo' }
                ]
              }
            ]
          }
        ]
      ]
    })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.sessions[0]?.firstMessage).toBe('hola mundo')
  })

  it('truncates very long first messages to 200 chars', async () => {
    const longMessage = 'x'.repeat(500)
    const { payload } = makePayload({
      executes: [
        [{ total: '1' }],
        [{}],
        [{ conversation_id: 'sess-1', user_id: 0, tenant_id: 0, first_run_at: null, last_run_at: null }],
        [
          {
            session_id: 'sess-1',
            runs: [{ messages: [{ role: 'user', content: longMessage }] }]
          }
        ]
      ]
    })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.sessions[0]?.firstMessage).toHaveLength(200)
  })

  it('parses runs when stored as a JSON string', async () => {
    const { payload } = makePayload({
      executes: [
        [{ total: '1' }],
        [{}],
        [{ conversation_id: 'sess-1', user_id: 0, tenant_id: 0, first_run_at: null, last_run_at: null }],
        [
          {
            session_id: 'sess-1',
            runs: JSON.stringify([{ messages: [{ role: 'user', content: 'json-stringified' }] }])
          }
        ]
      ]
    })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.sessions[0]?.firstMessage).toBe('json-stringified')
  })

  it('leaves firstMessage null when runs is null', async () => {
    const { payload } = makePayload({
      executes: [
        [{ total: '1' }],
        [{}],
        [{ conversation_id: 'sess-1', user_id: 0, tenant_id: 0, first_run_at: null, last_run_at: null }],
        [{ session_id: 'sess-1', runs: null }]
      ]
    })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.sessions[0]?.firstMessage).toBeNull()
  })

  it('leaves firstMessage null when runs contain no user message', async () => {
    const { payload } = makePayload({
      executes: [
        [{ total: '1' }],
        [{}],
        [{ conversation_id: 'sess-1', user_id: 0, tenant_id: 0, first_run_at: null, last_run_at: null }],
        [
          {
            session_id: 'sess-1',
            runs: [{ messages: [{ role: 'system', content: 'no user here' }] }]
          }
        ]
      ]
    })
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.sessions[0]?.firstMessage).toBeNull()
  })

  it('does not hit the agno table when there are no conversationIds', async () => {
    const { payload, execute } = makePayload({ executes: plan(0, {}, []) })
    await getSessions(payload, baseConfig(), {}, 1)
    // 3 calls only: count, totals, sessions. No agno query.
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it('survives when runs is malformed JSON (does not throw, just misses the message)', async () => {
    const { payload } = makePayload({
      executes: [
        [{ total: '1' }],
        [{}],
        [{ conversation_id: 'sess-1', user_id: 0, tenant_id: 0, first_run_at: null, last_run_at: null }],
        [{ session_id: 'sess-1', runs: '{not valid json' }]
      ]
    })
    // Currently throws — once the fix is in, this should resolve with firstMessage=null.
    const result = await getSessions(payload, baseConfig(), {}, 1)
    expect(result.sessions[0]?.firstMessage).toBeNull()
  })

  it('skips conversation_id=null instead of searching for the literal string "null"', async () => {
    const { payload, execute } = makePayload({
      executes: plan(1, {}, [
        { conversation_id: null, user_id: 0, tenant_id: 0, first_run_at: null, last_run_at: null }
      ])
    })
    await getSessions(payload, baseConfig(), {}, 1)
    // 3 calls only: count, totals, sessions. Null conversation_id should not trigger an agno lookup.
    expect(execute).toHaveBeenCalledTimes(3)
  })
})
