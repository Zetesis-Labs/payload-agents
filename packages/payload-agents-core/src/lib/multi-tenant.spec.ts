import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'
import { multiTenantSessionStrategy } from './multi-tenant'

/** Minimal stub of PayloadRequest — the strategy only reads whatever the
 *  consumer's `extractTenantId` looks at, so we can stay small. */
function makeReq(cookieTenantId: number | string | null, payloadDb?: Partial<Payload['db']>): PayloadRequest {
  const headers = new Headers()
  if (cookieTenantId !== null) headers.set('cookie', `payload-tenant=${cookieTenantId}`)
  return {
    headers,
    payload: { db: { defaultIDType: 'number', ...payloadDb } }
  } as unknown as PayloadRequest
}

/** Re-implements the consumer's extractor (apps/server/src/payload.config.ts):
 *  read the `payload-tenant` cookie, fall back to `user.tenants[0]`. */
function extractTenantLikeConsumer(user: Record<string, unknown>, req: PayloadRequest): string | number | undefined {
  const cookie = req.headers.get('cookie') ?? ''
  const match = cookie.match(/payload-tenant=(\d+)/)
  if (match?.[1]) return Number(match[1])
  const tenants = user.tenants as Array<{ tenant: number | { id: number } }> | undefined | null
  if (!tenants?.[0]) return undefined
  const t = tenants[0].tenant
  return typeof t === 'object' && t !== null ? t.id : t
}

const strategy = multiTenantSessionStrategy({ extractTenantId: extractTenantLikeConsumer })

const alice = { id: 42, tenants: [{ tenant: 1 }, { tenant: 2 }] }

describe('multiTenantSessionStrategy — tenant-aware session ids', () => {
  it('buildSessionId embeds the tenant from the cookie, not tenants[0]', async () => {
    const req = makeReq(2)
    const sessionId = await strategy.buildSessionId({
      user: alice,
      agentSlug: 'bastos',
      payload: {} as Payload,
      req
    })
    expect(sessionId.startsWith('bastos:2:42:')).toBe(true)
  })

  it('buildSessionId falls back to tenants[0] when no cookie is present', async () => {
    const req = makeReq(null)
    const sessionId = await strategy.buildSessionId({
      user: alice,
      agentSlug: 'bastos',
      payload: {} as Payload,
      req
    })
    expect(sessionId.startsWith('bastos:1:42:')).toBe(true)
  })

  it('buildSessionId passes through an existing chatId unchanged', async () => {
    const sessionId = await strategy.buildSessionId({
      user: alice,
      agentSlug: 'bastos',
      chatId: 'continuing-chat-abc',
      payload: {} as Payload,
      req: makeReq(2)
    })
    expect(sessionId).toBe('continuing-chat-abc')
  })

  it('validateSessionOwnership accepts sessions whose tenant matches the active cookie', async () => {
    const ok = await strategy.validateSessionOwnership('bastos:2:42:some-uuid', {
      user: alice,
      payload: {} as Payload,
      req: makeReq(2)
    })
    expect(ok).toBe(true)
  })

  it('validateSessionOwnership rejects sessions tagged with a different tenant than the active one', async () => {
    const ok = await strategy.validateSessionOwnership('bastos:1:42:some-uuid', {
      user: alice,
      payload: {} as Payload,
      req: makeReq(2)
    })
    expect(ok).toBe(false)
  })

  it('validateSessionOwnership rejects sessions for a different user even if the tenant matches', async () => {
    const ok = await strategy.validateSessionOwnership('bastos:2:99:some-uuid', {
      user: alice,
      payload: {} as Payload,
      req: makeReq(2)
    })
    expect(ok).toBe(false)
  })

  it('validateSessionOwnership rejects when the user has no id', async () => {
    const ok = await strategy.validateSessionOwnership('bastos:2:42:some-uuid', {
      user: { tenants: alice.tenants },
      payload: {} as Payload,
      req: makeReq(2)
    })
    expect(ok).toBe(false)
  })
})
