import type { PayloadHandler } from 'payload'
import { describe, expect, it } from 'vitest'
import { ChatRequestSchema, parseChatBody } from './chat'

type ChatHandlerReq = Parameters<PayloadHandler>[0]

function fakeReq(body: () => unknown | Promise<unknown>): ChatHandlerReq {
  return { json: () => Promise.resolve(body()) } as unknown as ChatHandlerReq
}

describe('ChatRequestSchema', () => {
  it('accepts a minimal valid body (just message)', () => {
    expect(ChatRequestSchema.safeParse({ message: 'hi' }).success).toBe(true)
  })

  it('accepts a full body', () => {
    const result = ChatRequestSchema.safeParse({ message: 'hi', chatId: 'c1', agentSlug: 'support' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty message', () => {
    const result = ChatRequestSchema.safeParse({ message: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a missing message', () => {
    expect(ChatRequestSchema.safeParse({}).success).toBe(false)
  })

  it('rejects a non-string message', () => {
    expect(ChatRequestSchema.safeParse({ message: 42 }).success).toBe(false)
  })

  it('rejects a non-string agentSlug', () => {
    expect(ChatRequestSchema.safeParse({ message: 'hi', agentSlug: 42 }).success).toBe(false)
  })
})

describe('parseChatBody', () => {
  it('returns ok=true with the parsed data on a valid body', async () => {
    const result = await parseChatBody(fakeReq(() => ({ message: 'hello' })))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.message).toBe('hello')
  })

  it('returns 400 when req.json() throws (malformed JSON)', async () => {
    const req = {
      json: () => Promise.reject(new Error('invalid json'))
    } as unknown as ChatHandlerReq
    const result = await parseChatBody(req)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(400)
  })

  it('returns 422 with details when schema fails', async () => {
    const result = await parseChatBody(fakeReq(() => ({ agentSlug: 'a1' })))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(422)
      const body = (await result.response.json()) as { error: string; details: unknown }
      expect(body.error).toBe('Invalid payload')
      expect(body.details).toBeDefined()
    }
  })

  it('returns 400 when message is whitespace-only (passes schema, fails trim check)', async () => {
    const result = await parseChatBody(fakeReq(() => ({ message: '   ' })))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
      const body = (await result.response.json()) as { error: string }
      expect(body.error).toBe('Message is required')
    }
  })

  it('passes through chatId and agentSlug when present', async () => {
    const result = await parseChatBody(fakeReq(() => ({ message: 'hi', chatId: 'c1', agentSlug: 'support' })))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.chatId).toBe('c1')
      expect(result.data.agentSlug).toBe('support')
    }
  })
})
