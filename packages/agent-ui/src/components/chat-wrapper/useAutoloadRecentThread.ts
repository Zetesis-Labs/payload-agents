'use client'

import type { ThreadMessageLike } from '@assistant-ui/react'
import { useEffect, useRef } from 'react'
import { toThreadMessageLike } from './message-adapters'
import type { AgentChatDataSource, AgentInfo, SessionSummary } from './types'

export interface UseAutoloadRecentThreadOptions {
  /** Panel apertura — el autoload solo dispara cuando es `true`. */
  open: boolean
  /** Agente actualmente seleccionado. */
  agent: AgentInfo | undefined
  /** Lista de sesiones recientes (ya cargada por `useChatAgents`). */
  recentSessions: SessionSummary[]
  /** Origen de datos del chat. */
  dataSource: AgentChatDataSource
  /** `true` si ya hay un thread cargado en el provider — el autoload se salta. */
  hasLoadedThread: boolean
  /** Callback que recibe el thread cargado para que el wrapper lo aplique. */
  onLoaded: (id: string, messages: ThreadMessageLike[]) => void
}

export interface UseAutoloadRecentThreadResult {
  /**
   * Marca el autoload como completado sin hacer la carga. Llamarlo cuando
   * el usuario hace una elección explícita ("+" / nuevo chat) que debe
   * impedir que la sesión más reciente se restaure detrás de su decisión.
   */
  markAttempted: () => void
}

/**
 * La primera vez que el panel se abre, restaura la conversación más
 * reciente del usuario cuyo agente coincida con el seleccionado. Si ya hay
 * un thread cargado, no toca nada. Si no hay ninguna sesión que coincida,
 * marca el intento como hecho y se queda quieto.
 *
 * El "ya intentado" vive en un ref para no incluirlo en el array de deps
 * — flipear un state desde dentro del effect lo re-ejecutaría y abortaría
 * el fetch en vuelo vía el flag local `cancelled`.
 */
export function useAutoloadRecentThread({
  open,
  agent,
  recentSessions,
  dataSource,
  hasLoadedThread,
  onLoaded
}: UseAutoloadRecentThreadOptions): UseAutoloadRecentThreadResult {
  const attempted = useRef(false)

  useEffect(() => {
    if (!open) return
    if (attempted.current) return
    if (hasLoadedThread) return
    if (!agent) return
    if (recentSessions.length === 0) return

    const mostRecent = recentSessions.find(s => s.status === 'active' && s.agentSlug === agent.slug)
    if (!mostRecent) {
      attempted.current = true
      return
    }
    attempted.current = true

    let cancelled = false
    void (async () => {
      try {
        const detail = await dataSource.getSession(mostRecent.conversation_id)
        if (cancelled) return
        const messages = (detail.messages || []).map(toThreadMessageLike)
        onLoaded(mostRecent.conversation_id, messages)
      } catch (err) {
        console.error('[useAutoloadRecentThread] autoload failed:', err)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, agent, recentSessions, dataSource, hasLoadedThread, onLoaded])

  return {
    markAttempted: () => {
      attempted.current = true
    }
  }
}
