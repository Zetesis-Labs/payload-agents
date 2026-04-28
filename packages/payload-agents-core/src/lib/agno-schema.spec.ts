import { describe, expect, it } from 'vitest'
import { extractMessagesFromRuns, parseAgnoRuns, parseAgnoSession } from './agno-schema'

describe('parseAgnoSession', () => {
  it('parses a valid session with all required fields', () => {
    const result = parseAgnoSession({
      session_id: 'sess-1',
      session_name: 'Untitled chat'
    })
    expect(result).toEqual({ session_id: 'sess-1', session_name: 'Untitled chat' })
  })

  it('preserves optional fields when present', () => {
    const result = parseAgnoSession({
      session_id: 'sess-1',
      session_name: 'Untitled chat',
      agent_id: 'a1',
      created_at: '2026-01-01T00:00:00Z',
      chat_history: [{ role: 'user', content: 'hi' }]
    })
    expect(result?.agent_id).toBe('a1')
    expect(result?.chat_history).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('returns null when session_id is missing', () => {
    expect(parseAgnoSession({ session_name: 'x' })).toBeNull()
  })

  it('returns null when session_id is not a string', () => {
    expect(parseAgnoSession({ session_id: 42, session_name: 'x' })).toBeNull()
  })

  it('returns null when session_name is missing', () => {
    expect(parseAgnoSession({ session_id: 'sess-1' })).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(parseAgnoSession(null)).toBeNull()
    expect(parseAgnoSession(undefined)).toBeNull()
    expect(parseAgnoSession('not an object')).toBeNull()
    expect(parseAgnoSession(42)).toBeNull()
  })
})

describe('parseAgnoRuns', () => {
  it('parses an array of valid runs', () => {
    const result = parseAgnoRuns([
      { messages: [{ role: 'user', content: 'hi' }] },
      { messages: [{ role: 'assistant', content: 'hello' }] }
    ])
    expect(result).toHaveLength(2)
    expect(result[0].messages).toHaveLength(1)
  })

  it('parses an empty array', () => {
    expect(parseAgnoRuns([])).toEqual([])
  })

  it('accepts runs with no messages field (optional)', () => {
    const result = parseAgnoRuns([{}, { messages: [] }])
    expect(result).toHaveLength(2)
  })

  it('returns [] when input is not an array', () => {
    expect(parseAgnoRuns({ runs: [] })).toEqual([])
    expect(parseAgnoRuns('runs')).toEqual([])
    expect(parseAgnoRuns(null)).toEqual([])
    expect(parseAgnoRuns(undefined)).toEqual([])
  })

  it('returns [] when any run is malformed (Zod is strict on the array)', () => {
    // A run with a non-array `messages` fails the schema → whole parse fails
    expect(parseAgnoRuns([{ messages: 'not an array' }])).toEqual([])
  })

  it('rejects messages with no role', () => {
    expect(parseAgnoRuns([{ messages: [{ content: 'hi' }] }])).toEqual([])
  })

  it('accepts message content as null (matches Agno wire shape)', () => {
    const result = parseAgnoRuns([{ messages: [{ role: 'tool', content: null, tool_call_id: 'tc1' }] }])
    expect(result[0].messages?.[0].content).toBeNull()
  })

  it('accepts message tool_calls structure', () => {
    const result = parseAgnoRuns([
      {
        messages: [
          {
            role: 'assistant',
            tool_calls: [{ id: 'tc1', function: { name: 'search', arguments: '{"q":"x"}' } }]
          }
        ]
      }
    ])
    expect(result[0].messages?.[0].tool_calls).toHaveLength(1)
  })
})

describe('extractMessagesFromRuns', () => {
  it('flattens messages across runs in order', () => {
    const messages = extractMessagesFromRuns([
      { messages: [{ role: 'user', content: 'q1' }] },
      { messages: [{ role: 'assistant', content: 'a1' }] }
    ])
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('q1')
    expect(messages[1].content).toBe('a1')
  })

  it('skips runs without messages', () => {
    const messages = extractMessagesFromRuns([
      {},
      { messages: [{ role: 'user', content: 'hi' }] },
      { messages: undefined }
    ])
    expect(messages).toHaveLength(1)
  })

  it('returns [] for empty runs array', () => {
    expect(extractMessagesFromRuns([])).toEqual([])
  })
})
