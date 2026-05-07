'use client'

import type { ThreadMessageLike } from '@assistant-ui/react'
import { useCallback, useState } from 'react'
import { toThreadMessageLike } from './message-adapters'
import type { AgentChatDataSource, AgentInfo, SessionSummary } from './types'
import { useAutoloadRecentThread } from './useAutoloadRecentThread'

export interface LoadedThread {
  id: string
  messages: ThreadMessageLike[]
}

export interface UseChatThreadOptions {
  open: boolean
  agent: AgentInfo | undefined
  recentSessions: SessionSummary[]
  dataSource: AgentChatDataSource
  /**
   * Callback opcional invocado cuando el thread cambia (autoload o
   * selección manual). Útil para cerrar popups asociados.
   */
  onThreadChanged?: () => void
}

export interface UseChatThreadResult {
  /** Thread actualmente cargado (por autoload o selección del historial). */
  loadedThread: LoadedThread | null
  /**
   * Clave que cambia con cada nuevo chat manual; sirve para forzar el
   * remount del provider AG-UI.
   */
  threadKey: number
  /** Carga la conversación indicada y la coloca como thread activo. */
  loadConversation: (conversationId: string) => Promise<void>
  /** Vacía el thread y empieza uno nuevo (resetea key y bloquea autoload). */
  startNewThread: () => void
}

/**
 * Centraliza la gestión del thread del chat: autoload de la última
 * conversación, carga manual desde el historial, y reset cuando el usuario
 * pulsa "+". Mantiene el ref de "autoload ya intentado" sincronizado con
 * acciones explícitas para que la última conversación no se restaure por
 * detrás de una decisión del usuario.
 */
export function useChatThread({
  open,
  agent,
  recentSessions,
  dataSource,
  onThreadChanged
}: UseChatThreadOptions): UseChatThreadResult {
  const [loadedThread, setLoadedThread] = useState<LoadedThread | null>(null)
  const [threadKey, setThreadKey] = useState(0)

  const handleAutoloaded = useCallback(
    (id: string, messages: ThreadMessageLike[]) => {
      setLoadedThread({ id, messages })
      onThreadChanged?.()
    },
    [onThreadChanged]
  )

  const { markAttempted } = useAutoloadRecentThread({
    open,
    agent,
    recentSessions,
    dataSource,
    hasLoadedThread: loadedThread !== null,
    onLoaded: handleAutoloaded
  })

  const loadConversation = useCallback(
    async (conversationId: string) => {
      try {
        const detail = await dataSource.getSession(conversationId)
        const messages = (detail.messages || []).map(toThreadMessageLike)
        setLoadedThread({ id: conversationId, messages })
        onThreadChanged?.()
      } catch (err) {
        console.error('[useChatThread] loadConversation failed:', err)
      }
    },
    [dataSource, onThreadChanged]
  )

  const startNewThread = useCallback(() => {
    markAttempted()
    setLoadedThread(null)
    setThreadKey(prev => prev + 1)
    onThreadChanged?.()
  }, [markAttempted, onThreadChanged])

  return {
    loadedThread,
    threadKey,
    loadConversation,
    startNewThread
  }
}
