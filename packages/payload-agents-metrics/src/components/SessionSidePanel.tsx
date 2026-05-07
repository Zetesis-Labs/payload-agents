'use client'

import { ReadOnlyThread, type ReadOnlyThreadMessage } from '@zetesis/agent-ui'
import { motion } from 'framer-motion'
import type { ComponentType } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { SessionDetailResponseSchema } from './types'

export function SessionSidePanel({
  basePath,
  conversationId,
  onClose,
  LinkComponent,
  panelTopOffset
}: {
  basePath: string
  conversationId: string
  onClose: () => void
  LinkComponent?: ComponentType<{ href: string; children: React.ReactNode; className?: string }>
  panelTopOffset: string
}) {
  const [messages, setMessages] = useState<ReadOnlyThreadMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api${basePath}/session?conversationId=${encodeURIComponent(conversationId)}`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return SessionDetailResponseSchema.parse(await res.json())
      })
      .then(data => {
        setMessages(
          data.messages.map((m, index) => ({
            id: `${conversationId}-${index}`,
            role: m.role,
            content: [
              ...(m.content ? ([{ type: 'text', text: m.content }] satisfies ReadOnlyThreadMessage['content']) : []),
              ...(m.toolCalls?.map(tc => ({
                type: 'tool-call' as const,
                toolCallId: tc.id,
                toolName: tc.name,
                args: tc.input,
                result: tc.result,
                sources: tc.sources
              })) ?? [])
            ],
            sources: m.sources
          }))
        )
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [conversationId, basePath])

  const generateHref = useCallback(
    ({ type, value }: { type: string; value: { id: number; slug?: string | null } }) =>
      `/${type}/${value.slug || value.id}`,
    []
  )

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      style={{ top: panelTopOffset }}
      className="fixed bottom-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="truncate font-mono text-xs text-muted-foreground">{conversationId}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm hover:bg-muted transition-colors"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>
        ) : (
          <ReadOnlyThread messages={messages} generateHref={generateHref} LinkComponent={LinkComponent} />
        )}
      </div>
    </motion.div>
  )
}
