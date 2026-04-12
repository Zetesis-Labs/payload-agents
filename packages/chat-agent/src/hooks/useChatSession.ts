import { useCallback, useEffect, useState } from 'react'
import type { ChatAdapter, Message, SessionSummary } from '../adapters/ChatAdapter'

export type { Message, SessionSummary }

interface UseChatSessionReturn {
  conversationId: string | null
  setConversationId: (id: string | null) => void
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  isLoadingSession: boolean
  handleNewConversation: () => Promise<void>
  // History management
  sessionsHistory: SessionSummary[]
  isLoadingHistory: boolean
  loadHistory: () => Promise<void>
  loadSession: (conversationId: string) => Promise<void>
  renameSession: (conversationId: string, newTitle: string) => Promise<boolean>
  deleteSession: (conversationId: string) => Promise<boolean>
}

interface UseChatSessionOptions {
  /** Called when a session is loaded with the agent slug it belongs to. */
  onAgentChange?: (agentSlug: string) => void
}

/**
 * Hook to manage chat session state and persistence
 */
export function useChatSession(adapter: ChatAdapter, options?: UseChatSessionOptions): UseChatSessionReturn {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoadingSession, setIsLoadingSession] = useState(true)

  // History state
  const [sessionsHistory, setSessionsHistory] = useState<SessionSummary[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Load active session from backend on mount
  useEffect(() => {
    const loadActiveSession = async () => {
      try {
        console.log('[useChatSession] 🔄 Loading active session through adapter...')

        const sessionData = await adapter.getActiveSession()

        if (sessionData) {
          console.log('[useChatSession] ✅ Active session found:', sessionData.conversationId)
          // Restore conversation state
          setConversationId(sessionData.conversationId)
          // Restore messages
          if (sessionData.messages && sessionData.messages.length > 0) {
            setMessages(sessionData.messages)
            console.log('[useChatSession] ✅ Session restored with', sessionData.messages.length, 'messages')
          }
        } else {
          // No active session found
          console.log('[useChatSession] ℹ️ No active session found (adapter returned null)')
        }
      } catch (error) {
        console.error('[useChatSession] ❌ Error loading session:', error)
      } finally {
        setIsLoadingSession(false)
      }
    }

    loadActiveSession()
  }, [adapter])

  // Load history
  const loadHistory = useCallback(async () => {
    try {
      setIsLoadingHistory(true)
      const sessions = await adapter.getHistory()
      setSessionsHistory(sessions)
    } catch (error) {
      console.error('[useChatSession] ❌ Error loading history:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [adapter])

  // Load a specific session
  const loadSession = useCallback(
    async (id: string) => {
      try {
        setIsLoadingSession(true)
        console.log('[useChatSession] 🔄 Loading session:', id)

        const sessionData = await adapter.loadSession(id)

        if (sessionData) {
          setConversationId(sessionData.conversationId)
          setMessages(sessionData.messages)
          if (sessionData.agentSlug) {
            options?.onAgentChange?.(sessionData.agentSlug)
          }
        } else {
          console.error('[useChatSession] ❌ Failed to load session (adapter returned null)')
        }
      } catch (error) {
        console.error('[useChatSession] ❌ Error loading session:', error)
      } finally {
        setIsLoadingSession(false)
      }
    },
    [adapter, options?.onAgentChange]
  )

  // Rename session
  const renameSession = useCallback(
    async (id: string, newTitle: string) => {
      try {
        const success = await adapter.renameSession(id, newTitle)

        if (success) {
          // Update local history
          setSessionsHistory(prev => prev.map(s => (s.conversation_id === id ? { ...s, title: newTitle } : s)))
          return true
        }
        return false
      } catch (error) {
        console.error('[useChatSession] ❌ Error renaming session:', error)
        return false
      }
    },
    [adapter]
  )

  // Delete session
  const deleteSession = useCallback(
    async (id: string) => {
      try {
        const success = await adapter.deleteSession(id)

        if (success) {
          // Update local history
          setSessionsHistory(prev => prev.filter(s => s.conversation_id !== id))
          // If current session was deleted, clear it
          if (id === conversationId) {
            setConversationId(null)
            setMessages([])
          }
          return true
        }
        return false
      } catch (error) {
        console.error('[useChatSession] ❌ Error deleting session:', error)
        return false
      }
    },
    [conversationId, adapter]
  )

  // Clear conversation and start new one
  const handleNewConversation = useCallback(async () => {
    // Just clear local state, don't close the session on backend (backend keeps history)
    setMessages([])
    setConversationId(null)
    console.log('[useChatSession] 🆕 Started new conversation')
  }, [])

  return {
    conversationId,
    setConversationId,
    messages,
    setMessages,
    isLoadingSession,
    handleNewConversation,
    sessionsHistory,
    isLoadingHistory,
    loadHistory,
    loadSession,
    renameSession,
    deleteSession
  }
}
