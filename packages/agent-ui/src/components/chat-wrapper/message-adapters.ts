import type { ThreadAssistantMessagePart, ThreadMessageLike } from '@assistant-ui/react'
import type { Source } from '../../lib/types'

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue }
export type JsonObject = { readonly [key: string]: JsonValue }

export interface BackendMessage {
  role: 'user' | 'assistant' | string
  content: string
  timestamp?: string
  sources?: Source[]
  toolCalls?: Array<{
    id: string
    name: string
    input?: JsonObject
    result?: string
    sources?: Source[]
  }>
}

let _msgIdCounter = 0
export const newMessageId = () => `loaded-${Date.now()}-${++_msgIdCounter}`

export function toThreadMessageLike(m: BackendMessage): ThreadMessageLike {
  const role: ThreadMessageLike['role'] = m.role === 'user' ? 'user' : 'assistant'

  // assistant-ui v0.12 renders tool calls and citations from the
  // message's content[] (parts). Map every backend toolCall to a
  // `tool-call` part — the new ToolCallPart component reads its
  // result and extracts sources from there.
  const parts: ThreadAssistantMessagePart[] = []
  if (m.content) {
    parts.push({ type: 'text', text: m.content } as const)
  }
  if (role === 'assistant' && m.toolCalls?.length) {
    for (const tc of m.toolCalls) {
      parts.push({
        type: 'tool-call' as const,
        toolCallId: tc.id,
        toolName: tc.name,
        args: tc.input ?? {},
        argsText: tc.input ? JSON.stringify(tc.input) : '',
        result: tc.result
      })
    }
  }

  return {
    id: newMessageId(),
    role,
    content: parts.length > 0 ? parts : []
  }
}
