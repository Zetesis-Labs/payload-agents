import type { PayloadHandler } from 'payload'
import { describe, expect, it } from 'vitest'
import { parseChatBody, RunAgentInputSchema } from './chat'

type ChatHandlerReq = Parameters<PayloadHandler>[0]

function fakeReq(body: () => unknown | Promise<unknown>): ChatHandlerReq {
  return { json: () => Promise.resolve(body()) } as unknown as ChatHandlerReq
}

describe('RunAgentInputSchema', () => {
  it('accepts a minimal AG-UI body (just threadId + forwardedProps.agentSlug)', () => {
    expect(
      RunAgentInputSchema.safeParse({ threadId: 't1', forwardedProps: { agentSlug: 'support' } }).success
    ).toBe(true)
  })

  it('accepts a full AG-UI body with messages, runId and forwardedProps', () => {
    const result = RunAgentInputSchema.safeParse({
      threadId: 't1',
      runId: 'r1',
      messages: [{ role: 'user', content: 'hi' }],
      state: {},
      context: [],
      tools: [],
      forwardedProps: { agentSlug: 'support', user_id: 42 }
    })
    expect(result.success).toBe(true)
  })

  it('accepts an empty object (auth/agentSlug checks happen in the handler, not the schema)', () => {
    expect(RunAgentInputSchema.safeParse({}).success).toBe(true)
  })

  it('rejects non-array messages', () => {
    expect(RunAgentInputSchema.safeParse({ messages: 'oops' }).success).toBe(false)
  })
})

describe('parseChatBody', () => {
  it('returns ok=true with the parsed data on a valid body', async () => {
    const result = await parseChatBody(
      fakeReq(() => ({
        threadId: 't1',
        forwardedProps: { agentSlug: 'support' },
        messages: [{ role: 'user', content: 'hello' }]
      }))
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.threadId).toBe('t1')
      expect(result.data.forwardedProps?.agentSlug).toBe('support')
    }
  })

  it('returns 400 when req.json() throws (malformed JSON)', async () => {
    const req = {
      json: () => Promise.reject(new Error('invalid json'))
    } as unknown as ChatHandlerReq
    const result = await parseChatBody(req)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  it('returns 422 when the body fails schema validation', async () => {
    const result = await parseChatBody(fakeReq(() => ({ messages: 'not-an-array' })))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(422)
  })

  it('passes through threadId and forwardedProps.agentSlug when present', async () => {
    const result = await parseChatBody(
      fakeReq(() => ({ threadId: 'c1', forwardedProps: { agentSlug: 'support' }, messages: [] }))
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.threadId).toBe('c1')
      expect(result.data.forwardedProps?.agentSlug).toBe('support')
    }
  })
})
