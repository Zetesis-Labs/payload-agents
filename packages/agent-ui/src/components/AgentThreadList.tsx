'use client'

import { Loader2, MessageSquare, Pencil, Trash2 } from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { cn } from '../lib/utils'
import { useAgentChat } from '../runtime/AgentChatProvider'
import type { AgentChatDataSource, SessionSummary } from './chat-wrapper/types'

export interface AgentThreadListProps {
  dataSource: AgentChatDataSource
  agentSlug?: string
  onSelectThread?: (conversationId: string) => void
  className?: string
}

export const AgentThreadList: FC<AgentThreadListProps> = ({ dataSource, agentSlug, onSelectThread, className }) => {
  const { threadId, runCount } = useAgentChat()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const {
    data: activeSessions,
    error,
    isLoading: loading,
    mutate
  } = useSWR(
    ['agent-sessions', agentSlug, runCount],
    async () => {
      const allSessions = await dataSource.getRecentSessions(agentSlug)
      return allSessions.filter(s => s.status === 'active')
    },
    { revalidateOnFocus: false }
  )

  const renamingRef = useRef(false)
  const handleRename = async (id: string, title: string) => {
    if (renamingRef.current || !dataSource.renameSession) return
    renamingRef.current = true
    try {
      await dataSource.renameSession(id, title)
      setEditing(null)
      void mutate()
    } catch (err) {
      console.error('[AgentThreadList] rename failed:', err)
    } finally {
      renamingRef.current = false
    }
  }

  const handleDelete = async (id: string) => {
    if (!dataSource.deleteSession) return
    try {
      await dataSource.deleteSession(id)
      void mutate()
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

      {!loading && !error && (!activeSessions || activeSessions.length === 0) && (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">No hay conversaciones recientes.</div>
      )}

      {activeSessions?.map(session => (
        <div
          key={session.conversation_id}
          className={cn(
            'group relative flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
            threadId === session.conversation_id && 'bg-primary/5 text-primary hover:bg-primary/10'
          )}
        >
          {editing === session.conversation_id ? (
            <div className="flex items-center gap-2">
              <input
                ref={el => {
                  if (el) el.focus()
                }}
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm outline-none ring-offset-background focus-visible:ring-1 focus-visible:ring-ring"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleRename(session.conversation_id, draft)
                  if (e.key === 'Escape') setEditing(null)
                }}
                onBlur={() => handleRename(session.conversation_id, draft)}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 overflow-hidden"
                onClick={() => onSelectThread?.(session.conversation_id)}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate font-medium">{session.title || 'Nueva conversación'}</span>
              </button>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {dataSource.renameSession && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      setDraft(session.title || '')
                      setEditing(session.conversation_id)
                    }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    title="Renombrar"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {dataSource.deleteSession && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      if (confirm('¿Eliminar esta conversación?')) {
                        void handleDelete(session.conversation_id)
                      }
                    }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}
          <span className="text-[10px] text-muted-foreground/70">
            {new Date(session.last_activity).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
      ))}
    </div>
  )
}
