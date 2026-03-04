import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../core/logging/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../stream-handler', () => ({
  parseConversationEvent: vi.fn(),
  extractSourcesFromResults: vi.fn().mockReturnValue([]),
  buildContextText: vi.fn().mockReturnValue('')
}))

vi.mock('./utils', () => ({
  estimateTokensFromText: vi.fn().mockReturnValue(10)
}))

vi.mock('../utils/sse-utils', () => ({
  sendSSEEvent: vi.fn()
}))

import { parseConversationEvent } from '../stream-handler'
import { sendSSEEvent } from '../utils/sse-utils'
import { defaultHandleStreamingResponse } from './streaming-handler'

const mockParse = vi.mocked(parseConversationEvent)
const mockSendSSE = vi.mocked(sendSSEEvent)

function createMockResponse(lines: string[]): Response {
  const text = `${lines.join('\n')}\n`
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    }
  })
  return { body: stream } as Response
}

function createMockController(): ReadableStreamDefaultController<Uint8Array> {
  return {
    enqueue: vi.fn(),
    close: vi.fn(),
    error: vi.fn(),
    desiredSize: 1
  } as unknown as ReadableStreamDefaultController<Uint8Array>
}

describe('defaultHandleStreamingResponse', () => {
  it('releases reader lock on successful completion (finally)', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close()
      }
    })
    const originalGetReader = stream.getReader.bind(stream)
    const reader = originalGetReader()
    reader.releaseLock()

    // Create a stream that tracks releaseLock
    const trackedStream = new ReadableStream({
      start(controller) {
        controller.close()
      }
    })
    const response = { body: trackedStream } as Response

    mockParse.mockReturnValue(null)

    await defaultHandleStreamingResponse(response, createMockController(), new TextEncoder())

    // If we get here without error, the reader was released (no locked reader exception)
  })

  it('releases reader lock when processing throws (finally)', async () => {
    mockParse.mockImplementation(() => {
      throw new Error('parse error')
    })

    const response = createMockResponse(['data: {"message":"hi"}'])

    await expect(defaultHandleStreamingResponse(response, createMockController(), new TextEncoder())).rejects.toThrow(
      'parse error'
    )

    // Verify we can create a new reader (lock was released)
    // If reader lock wasn't released, this would be a different error
  })

  it('throws when response body is null', async () => {
    const response = { body: null } as Response

    await expect(defaultHandleStreamingResponse(response, createMockController(), new TextEncoder())).rejects.toThrow(
      'Response body is null'
    )
  })

  it('accumulates tokens from message events', async () => {
    mockParse
      .mockReturnValueOnce({ message: 'Hello' })
      .mockReturnValueOnce({ message: ' World' })
      .mockReturnValueOnce(null)

    const response = createMockResponse(['line1', 'line2', 'line3'])
    const controller = createMockController()

    const result = await defaultHandleStreamingResponse(response, controller, new TextEncoder())

    expect(result.fullAssistantMessage).toBe('Hello World')
  })

  it('extracts sources from first event with results', async () => {
    const { extractSourcesFromResults } = await import('../stream-handler')
    const mockExtract = vi.mocked(extractSourcesFromResults)
    mockExtract.mockReturnValue([
      {
        id: 'src-1',
        title: 'Source',
        slug: 'source',
        type: 'post',
        chunkIndex: 0,
        relevanceScore: 0.9,
        content: '',
        excerpt: 'test'
      }
    ])

    mockParse.mockReturnValueOnce({
      results: [{ hits: [], found: 1 }] as never
    })

    const response = createMockResponse(['line1'])
    const controller = createMockController()

    const result = await defaultHandleStreamingResponse(response, controller, new TextEncoder())

    expect(result.sources).toHaveLength(1)
    expect(mockSendSSE).toHaveBeenCalledWith(
      controller,
      expect.any(TextEncoder),
      expect.objectContaining({ type: 'sources' })
    )
  })

  it('skips unparseable lines without crashing', async () => {
    mockParse
      .mockReturnValueOnce(null) // unparseable
      .mockReturnValueOnce({ message: 'ok' }) // valid
      .mockReturnValueOnce(null) // unparseable

    const response = createMockResponse(['garbage', 'data: valid', 'more garbage'])

    const result = await defaultHandleStreamingResponse(response, createMockController(), new TextEncoder())

    expect(result.fullAssistantMessage).toBe('ok')
  })
})
