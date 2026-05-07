'use client'

import { Loader2, MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'
import { useAgentChat } from '../runtime/AgentChatProvider'

export interface SessionSummary {
  conversation_id: string
  title?: string
  last_activity: string
  status: 'active' | 'closed'
  agentSlug?: string
}

export interface AgentThreadListProps {
  /**
   * Same-origin endpoint roots, defaulting to the convention used by the
   * Payload BFF: `/api/chat/sessions` (list) and `/api/chat/session`
   * (single — query string is appended).
   */
  sessionsEndpoint?: string
  sessionEndpoint?: string
  onSelectThread?: (conversationId: string) => void
  className?: string
}

export const AgentThreadList: FC<AgentThreadListProps> = ({
  sessionsEndpoint = '/api/chat/sessions',
  sessionEndpoint = '/api/chat/session',
  onSelectThread,
  className
}) => {
  const { threadId, runCount } = useAgentChat()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(sessionsEndpoint)
      if (!res.ok) {
        setSessions([])
        return
      }
      const body = (await res.json()) as { sessions?: SessionSummary[] }
      const active = (body.sessions ?? []).filter(s => s.status === 'active')
      setSessions(active)
    } catch (err) {
      console.error('[AgentThreadList] refresh failed:', err)
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [sessionsEndpoint])

  // Refresh on mount and after every completed run — new conversations
  // appear in the list as soon as the server has them, without having
  // to close and reopen the popover.
  useEffect(() => {
    void refresh()
  }, [refresh, runCount])

  const renamingRef = useRef(false)
  const handleRename = async (id: string, title: string) => {
    if (renamingRef.current) return
    renamingRef.current = true
    try {
      await fetch(`${sessionEndpoint}?conversationId=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      })
      setEditing(null)
      void refresh()
    } catch (err) {
      console.error('[AgentThreadList] rename failed:', err)
    } finally {
      renamingRef.current = false
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${sessionEndpoint}?conversationId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      void refresh()
    } catch (err) {
      console.error('[AgentThreadList] delete failed:', err)
    }
  }

  return (
    <div className={cn('flex flex-col gap-1 p-2', className)}>
      {loading && (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      {!loading && sessions.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">No tienes conversaciones todavía.</p>
      )}
      {sessions.map(s => {
        const isActive = s.conversation_id === threadId
        return (
          <div
            key={s.conversation_id}
            className={cn(
              'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            {editing === s.conversation_id ? (
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => handleRename(s.conversation_id, draft)}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditing(null)
                }}
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
                ref={el => el?.focus()}
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelectThread?.(s.conversation_id)}
                className="flex-1 truncate text-left"
              >
                {s.title || 'Conversación sin título'}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditing(s.conversation_id)
                setDraft(s.title ?? '')
              }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
              aria-label="Renombrar"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(s.conversation_id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              aria-label="Borrar"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
