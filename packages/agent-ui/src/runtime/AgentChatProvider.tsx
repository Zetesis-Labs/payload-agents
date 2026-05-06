'use client'

import { HttpAgent } from '@ag-ui/client'
import {
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  type ThreadMessageLike
} from '@assistant-ui/react'
import { useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import type { ThreadHistoryAdapter } from '@assistant-ui/core'
import { createContext, type FC, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import type { LinkComponent, UsageSnapshot } from '../lib/types'

/**
 * AgentChatProvider — wires an AG-UI compliant endpoint into an
 * assistant-ui v0.12 runtime via the official `@assistant-ui/react-ag-ui`
 * adapter. The transport is `@ag-ui/client`'s `HttpAgent`, subclassed to
 * inject `forwardedProps.agentSlug` on every run so the portal BFF can
 * route to the correct agent without leaking that field outside the AG-UI
 * `RunAgentInput` shape.
 *
 * Tool calls and their results travel through assistant-ui's native
 * tool-call message parts: register a part component via
 * `MessagePrimitive.Parts components.tools.Fallback` to render them.
 * Sources are parsed from the tool result inside the part renderer.
 *
 * Custom events:
 *   - `usage` (from BFF)              → setUsage, drives the budget bar.
 *   - `agno_run_completed` (from BFF) → forwarded for downstream
 *     telemetry; the canonical ledger is updated server-side, this is
 *     just for clients that want to react to it.
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

export type GenerateHref = (props: { type: string; value: { id: number; slug?: string | null } }) => string

export interface AgentChatProviderProps {
  endpoint: string
  agentSlug: string
  agentName?: string
  generateHref?: GenerateHref
  LinkComponent?: LinkComponent
  initialThreadId?: string
  initialMessages?: ThreadMessageLike[]
  /** Extra headers forwarded with every request (e.g. embed JWT). */
  headers?: Record<string, string>
  children: ReactNode
}

/** Minimal message shape the HttpAgent accepts at construction time. */
interface AGUIMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
}

function toAGUIMessages(messages: ThreadMessageLike[] | undefined): AGUIMessage[] | undefined {
  if (!messages?.length) return undefined
  let i = 0
  return messages.map(m => {
    const text = Array.isArray(m.content)
      ? m.content
          .map(c => (typeof c === 'object' && c && 'text' in c ? String((c as { text: unknown }).text ?? '') : ''))
          .join('')
      : typeof m.content === 'string'
        ? m.content
        : ''
    return {
      id: m.id ?? `loaded-${++i}`,
      role: (m.role === 'user' ? 'user' : 'assistant') as AGUIMessage['role'],
      content: text
    }
  })
}

/**
 * `HttpAgent` subclass that injects portal-specific fields into every
 * `RunAgentInput` without breaking the AG-UI wire format.
 */
class PortalAgent extends HttpAgent {
  readonly _portalAgentSlug: string

  constructor(config: {
    url: string
    headers?: Record<string, string>
    agentSlug: string
    threadId?: string
    initialMessages?: AGUIMessage[]
  }) {
    super({
      url: config.url,
      headers: config.headers,
      threadId: config.threadId,
      initialMessages: config.initialMessages as never
    })
    this._portalAgentSlug = config.agentSlug
  }

  protected prepareRunAgentInput(
    parameters?: Parameters<HttpAgent['runAgent']>[0]
  ): ReturnType<HttpAgent['prepareRunAgentInput']> {
    const input = (
      HttpAgent.prototype as unknown as { prepareRunAgentInput: HttpAgent['prepareRunAgentInput'] }
    ).prepareRunAgentInput.call(this, parameters)
    const existing = (input as { forwardedProps?: Record<string, unknown> }).forwardedProps ?? {}
    return {
      ...input,
      forwardedProps: { ...existing, agentSlug: this._portalAgentSlug }
    }
  }
}

export const AgentChatProvider: FC<AgentChatProviderProps> = ({
  endpoint,
  agentSlug,
  agentName,
  generateHref,
  LinkComponent,
  initialThreadId,
  initialMessages,
  headers,
  children
}) => {
  const [usage, setUsage] = useState<UsageSnapshot | null>(null)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(initialThreadId ?? null)

  const agent = useMemo(
    () =>
      new PortalAgent({
        url: endpoint,
        headers,
        agentSlug,
        threadId: initialThreadId,
        initialMessages: toAGUIMessages(initialMessages)
      }),
    [endpoint, headers, agentSlug, initialThreadId, initialMessages]
  )

  // Eager-load the daily budget snapshot.
  useEffect(() => {
    let cancelled = false
    const usageUrl = endpoint.endsWith('/') ? `${endpoint}usage` : `${endpoint}/usage`
    fetch(usageUrl, headers ? { headers } : undefined)
      .then(r => (r.ok ? (r.json() as Promise<UsageSnapshot>) : null))
      .then(data => {
        if (!cancelled && data) setUsage(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [endpoint, headers])

  // Subscribe to portal-specific events. Standard AG-UI events
  // (text, tool calls, run lifecycle) are handled by the runtime
  // adapter — we only need RUN_STARTED for the threadId echo, our
  // own CUSTOM events for the usage bar, and RUN_ERROR for the
  // budget-cap alert.
  useEffect(() => {
    const sub = agent.subscribe({
      onRunStartedEvent: ({ event }) => {
        const tid = (event as { threadId?: string }).threadId
        if (typeof tid === 'string') setThreadId(tid)
      },
      onCustomEvent: ({ event }) => {
        const e = event as { name?: string; value?: unknown }
        if (e.name === 'usage' && e.value && typeof e.value === 'object') {
          setUsage(e.value as UsageSnapshot)
        }
      },
      onRunErrorEvent: ({ event }) => {
        const msg = (event as { message?: string }).message
        setLimitError(typeof msg === 'string' && msg ? msg : 'Run failed')
      }
    })
    return () => sub.unsubscribe()
  }, [agent])

  // Hydrate the runtime with the loaded thread's messages via the
  // official history adapter; the runtime calls `load()` once on mount
  // and seeds its message store with whatever we return. Without this
  // adapter, `initialMessages` passed to HttpAgent at construction
  // never reach the assistant-ui store.
  const historyAdapter = useMemo<ThreadHistoryAdapter | undefined>(() => {
    if (!initialMessages?.length) return undefined
    const repo = ExportedMessageRepository.fromArray(initialMessages)
    return {
      load: async () => repo,
      append: async () => {
        /* no-op: every run is persisted server-side by the runtime */
      }
    }
  }, [initialMessages])

  const runtime = useAgUiRuntime({
    agent,
    onError: err => setLimitError(err instanceof Error ? err.message : 'Run failed'),
    adapters: historyAdapter ? { history: historyAdapter } : undefined
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
