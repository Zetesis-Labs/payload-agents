'use client'

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike
} from '@assistant-ui/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode
} from 'react'
import type { LinkComponent, Source, ToolCall, UsageSnapshot } from '../lib/types'

/**
 * Provider that turns a same-origin AG-UI endpoint into an assistant-ui
 * runtime. We do not use `@ag-ui/client`'s `HttpAgent` directly: it
 * auto-generates a threadId on first run, which our BFF would then
 * have to validate as an existing session — fragile, and the dist
 * shape varies across versions. Instead we POST `RunAgentInput` and
 * parse the SSE stream ourselves; AG-UI events are plain JSON and the
 * surface we consume is small (RUN_*, TEXT_MESSAGE_*, TOOL_CALL_*,
 * CUSTOM `usage`).
 */

export interface AgentChatContextValue {
  usage: UsageSnapshot | null
  limitError: string | null
  setLimitError: (msg: string | null) => void
  threadId: string | null
  agentName?: string
  generateHref?: GenerateHref
  LinkComponent?: LinkComponent
}

const AgentChatContext = createContext<AgentChatContextValue | null>(null)

export function useAgentChat(): AgentChatContextValue {
  const ctx = useContext(AgentChatContext)
  if (!ctx) throw new Error('useAgentChat must be used inside <AgentChatProvider>')
  return ctx
}

export type GenerateHref = (props: {
  type: string
  value: { id: number; slug?: string | null }
}) => string

export interface AgentChatProviderProps {
  endpoint: string
  agentSlug: string
  agentName?: string
  generateHref?: GenerateHref
  LinkComponent?: LinkComponent
  initialThreadId?: string
  initialMessages?: ThreadMessageLike[]
  children: ReactNode
}

interface InternalToolCall extends ToolCall {
  argsBuffer: string
}

interface DraftAssistant {
  id: string
  text: string
  toolCalls: Map<string, InternalToolCall>
}

const newId = () => Math.random().toString(36).slice(2)

export const AgentChatProvider: FC<AgentChatProviderProps> = ({
  endpoint,
  agentSlug,
  agentName,
  generateHref,
  LinkComponent,
  initialThreadId,
  initialMessages,
  children
}) => {
  const [messages, setMessages] = useState<ThreadMessageLike[]>(initialMessages ?? [])
  const [isRunning, setIsRunning] = useState(false)
  const [usage, setUsage] = useState<UsageSnapshot | null>(null)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(initialThreadId ?? null)
  const abortRef = useRef<AbortController | null>(null)
  const draftRef = useRef<DraftAssistant | null>(null)

  // Eager-load the daily usage snapshot so the budget bar renders
  // before the user sends the first message. The endpoint mirrors the
  // shape of the `CUSTOM usage` event the BFF emits later.
  useEffect(() => {
    let cancelled = false
    const usageUrl = endpoint.endsWith('/') ? `${endpoint}usage` : `${endpoint}/usage`
    fetch(usageUrl)
      .then(r => (r.ok ? (r.json() as Promise<UsageSnapshot>) : null))
      .then(data => {
        if (!cancelled && data) setUsage(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [endpoint])

  const flushDraft = useCallback(() => {
    const d = draftRef.current
    if (!d) return
    const tools: ToolCall[] = Array.from(d.toolCalls.values()).map(tc => ({
      id: tc.id,
      name: tc.name,
      args: tc.args,
      result: tc.result,
      sources: tc.sources,
      isLoading: tc.isLoading
    }))
    const sources = collectSources(tools)
    setMessages(prev => {
      const next = [...prev]
      const idx = next.findIndex(m => m.id === d.id)
      const updated: ThreadMessageLike = {
        id: d.id,
        role: 'assistant',
        content: d.text ? [{ type: 'text', text: d.text }] : [],
        metadata: { custom: { sources, toolCalls: tools } }
      }
      if (idx >= 0) next[idx] = updated
      else next.push(updated)
      return next
    })
  }, [])

  const handleEvent = useCallback(
    (event: AGUIEvent) => {
      switch (event.type) {
        case 'RUN_STARTED': {
          if (typeof event.threadId === 'string') setThreadId(event.threadId)
          break
        }
        case 'TEXT_MESSAGE_START': {
          break
        }
        case 'TEXT_MESSAGE_CONTENT': {
          const d = draftRef.current
          if (!d) return
          if (typeof event.delta === 'string') d.text += event.delta
          flushDraft()
          break
        }
        case 'TEXT_MESSAGE_END':
          flushDraft()
          break
        case 'TOOL_CALL_START': {
          const id = String(event.toolCallId ?? '')
          const name = String(event.toolCallName ?? '')
          if (!id) return
          const d = draftRef.current
          if (!d) return
          d.toolCalls.set(id, { id, name, argsBuffer: '', isLoading: true })
          flushDraft()
          break
        }
        case 'TOOL_CALL_ARGS': {
          const id = String(event.toolCallId ?? '')
          const tc = draftRef.current?.toolCalls.get(id)
          if (!tc) return
          if (typeof event.delta === 'string') tc.argsBuffer += event.delta
          try {
            tc.args = JSON.parse(tc.argsBuffer) as Record<string, unknown>
          } catch {
            /* still streaming */
          }
          break
        }
        case 'TOOL_CALL_END': {
          const id = String(event.toolCallId ?? '')
          const tc = draftRef.current?.toolCalls.get(id)
          if (!tc) return
          tc.isLoading = false
          flushDraft()
          break
        }
        case 'TOOL_CALL_RESULT': {
          const id = String(event.toolCallId ?? '')
          const tc = draftRef.current?.toolCalls.get(id)
          if (!tc) return
          const content = typeof event.content === 'string' ? event.content : undefined
          tc.result = content
          tc.sources = extractSources(content)
          tc.isLoading = false
          flushDraft()
          break
        }
        case 'CUSTOM': {
          if (event.name === 'usage' && event.value && typeof event.value === 'object') {
            setUsage(event.value as UsageSnapshot)
          }
          break
        }
        case 'RUN_ERROR': {
          const msg = typeof event.message === 'string' ? event.message : 'Run failed'
          setLimitError(msg)
          break
        }
        case 'RUN_FINISHED':
          break
      }
    },
    [flushDraft]
  )

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const userText = message.content
        .map(c => (c.type === 'text' ? c.text : ''))
        .join('')
      if (!userText.trim()) return

      const userMessage: ThreadMessageLike = {
        id: newId(),
        role: 'user',
        content: [{ type: 'text', text: userText }]
      }
      const assistantId = newId()
      draftRef.current = { id: assistantId, text: '', toolCalls: new Map() }

      setMessages(prev => [
        ...prev,
        userMessage,
        { id: assistantId, role: 'assistant', content: [] }
      ])
      setIsRunning(true)
      setLimitError(null)

      const abort = new AbortController()
      abortRef.current = abort

      const aguiMessages = [
        ...messages.map(toAGUIMessage),
        { id: userMessage.id, role: 'user', content: userText }
      ]

      // AG-UI `RunAgentInput` marks `state`, `tools` and `context` as
      // required — even when empty. Always send them.
      const body: Record<string, unknown> = {
        runId: newId(),
        messages: aguiMessages,
        state: {},
        tools: [],
        context: [],
        forwardedProps: { agentSlug }
      }
      if (threadId) body.threadId = threadId

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body),
          signal: abort.signal
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}: ${text || 'request failed'}`)
        }
        if (!res.body) throw new Error('Empty response body')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let frameEnd = buffer.indexOf('\n\n')
          while (frameEnd !== -1) {
            const frame = buffer.slice(0, frameEnd)
            buffer = buffer.slice(frameEnd + 2)
            frameEnd = buffer.indexOf('\n\n')
            const ev = parseFrame(frame)
            if (ev) handleEvent(ev)
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        setLimitError(err instanceof Error ? err.message : 'Run failed')
      } finally {
        setIsRunning(false)
        draftRef.current = null
        abortRef.current = null
      }
    },
    [agentSlug, endpoint, handleEvent, messages, threadId]
  )

  const onCancel = useCallback(() => {
    abortRef.current?.abort()
    setIsRunning(false)
    draftRef.current = null
  }, [])

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    isRunning,
    messages,
    onNew,
    onCancel,
    convertMessage: m => m
  })

  const contextValue = useMemo<AgentChatContextValue>(
    () => ({
      usage,
      limitError,
      setLimitError,
      threadId,
      agentName,
      generateHref,
      LinkComponent
    }),
    [usage, limitError, threadId, agentName, generateHref, LinkComponent]
  )

  return (
    <AgentChatContext.Provider value={contextValue}>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </AgentChatContext.Provider>
  )
}

interface AGUIEvent {
  type: string
  threadId?: string
  delta?: string
  toolCallId?: string
  toolCallName?: string
  content?: string
  message?: string
  name?: string
  value?: unknown
  [key: string]: unknown
}

function parseFrame(frame: string): AGUIEvent | null {
  for (const raw of frame.split('\n')) {
    if (raw.startsWith('data: ')) {
      try {
        return JSON.parse(raw.slice(6)) as AGUIEvent
      } catch {
        return null
      }
    }
  }
  return null
}

function toAGUIMessage(m: ThreadMessageLike): { id: string; role: string; content: string } {
  const text = Array.isArray(m.content)
    ? m.content
        .map(c => (typeof c === 'object' && c && 'text' in c ? String((c as { text: unknown }).text ?? '') : ''))
        .join('')
    : typeof m.content === 'string'
      ? m.content
      : ''
  return { id: m.id ?? newId(), role: m.role, content: text }
}

function extractSources(result: unknown): Source[] {
  if (typeof result !== 'string' || !result.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(result)
  } catch {
    return []
  }
  const list = isObject(parsed) && Array.isArray(parsed.sources) ? parsed.sources : []
  return list.filter(isObject).map(s => ({
    id: String(s.id ?? ''),
    title: String(s.title ?? ''),
    slug: String(s.slug ?? ''),
    type: String(s.type ?? 'document'),
    chunkIndex:
      typeof s.chunkIndex === 'number'
        ? s.chunkIndex
        : typeof s.chunk_index === 'number'
          ? s.chunk_index
          : undefined,
    content: typeof s.content === 'string' ? s.content : undefined,
    excerpt: typeof s.excerpt === 'string' ? s.excerpt : undefined,
    relevanceScore:
      typeof s.relevanceScore === 'number'
        ? s.relevanceScore
        : typeof s.relevance_score === 'number'
          ? s.relevance_score
          : undefined
  }))
}

function collectSources(tools: ToolCall[]): Source[] {
  const out: Source[] = []
  const seen = new Set<string>()
  for (const t of tools) {
    if (!t.sources) continue
    for (const s of t.sources) {
      const key = `${s.id}:${s.slug}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
    }
  }
  return out
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
