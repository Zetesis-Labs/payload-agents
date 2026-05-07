'use client'

import type { ThreadMessageLike } from '@assistant-ui/react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, History, Maximize2, MessageCircle, Minimize2, Plus, X } from 'lucide-react'
import type { ComponentType } from 'react'
import { useEffect, useRef, useState } from 'react'

import { AgentChatProvider } from '../../runtime/AgentChatProvider'
import { AgentThread } from '../AgentThread'
import { AgentThreadList } from '../AgentThreadList'
import { AgentSelector } from './AgentSelector'
import { type BackendMessage, toThreadMessageLike } from './message-adapters'
import type { ImageComponentProps } from './types'
import { useChatAgents } from './useChatAgents'

function getPanelAnimationState(maximized: boolean) {
  if (maximized) {
    return {
      x: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      borderRadius: '0px'
    }
  }

  if (typeof window !== 'undefined' && window.innerWidth < 1024) {
    return {
      x: 0,
      left: 0,
      top: 0,
      right: 'auto',
      bottom: 0,
      width: '100vw',
      height: '100vh',
      borderRadius: '0px'
    }
  }

  return {
    x: 0,
    left: '1rem',
    top: '5rem',
    right: 'auto',
    bottom: '1rem',
    width: '33.333333%',
    height: 'auto',
    borderRadius: '0.75rem'
  }
}

export interface FloatingChatWrapperProps {
  hasAccess: boolean
  dataSource: import('./types').AgentChatDataSource
  chatEndpoint?: string
  LinkComponent?: ComponentType<{ href: string; children: React.ReactNode; className?: string }>
  ImageComponent?: ComponentType<ImageComponentProps>
}

export function FloatingChatWrapper({
  hasAccess,
  dataSource,
  chatEndpoint = '/api/chat',
  LinkComponent,
  ImageComponent
}: FloatingChatWrapperProps) {
  const [open, setOpen] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [threadKey, setThreadKey] = useState(0)
  const [loadedThread, setLoadedThread] = useState<{ id: string; messages: ThreadMessageLike[] } | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [shouldAnimate, setShouldAnimate] = useState(false)
  const isFirstMount = useRef(true)

  const { agents, selectedAgentSlug, setSelectedAgentSlug, agentLoadState } = useChatAgents(hasAccess, dataSource)

  // Solo animar si no es la carga inicial en desktop
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      if (typeof window !== 'undefined' && window.innerWidth >= 1024 && agents.length > 0) {
        setOpen(true)
        setIsInitialLoad(true)
        // Enable animations after a short delay to prevent initial entrance animation
        const timer = setTimeout(() => {
          setShouldAnimate(true)
          setIsInitialLoad(false)
        }, 500)
        return () => clearTimeout(timer)
      } else {
        setShouldAnimate(true)
        setIsInitialLoad(false)
      }
    }
  }, [agents.length])

  const agent = agents.find(a => a.slug === selectedAgentSlug)

  const loadConversation = async (conversationId: string) => {
    try {
      const data = await dataSource.getSession(conversationId)
      const convertedMessages = (data.messages || []).map(toThreadMessageLike)

      setLoadedThread({ id: conversationId, messages: convertedMessages })
      setHistoryOpen(false)
    } catch (err) {
      console.error('[FloatingChatWrapper] loadConversation failed:', err)
    }
  }

  const handleSelectThread = (id: string) => {
    void loadConversation(id)
  }

  const handleNewThread = () => {
    setLoadedThread(null)
    setThreadKey(k => k + 1)
    setHistoryOpen(false)
  }

  const handleSelectAgent = (newSlug: string) => {
    setSelectedAgentSlug(newSlug)
    handleNewThread() // Force new thread when switching agents
  }

  if (agentLoadState === 'empty' || agentLoadState === 'error') return null

  const agentStatusMessage =
    agentLoadState === 'loading' ? 'Cargando asistentes...' : 'Selecciona un asistente para continuar.'

  return (
    <>
      <AnimatePresence>
        {!open && agents.length > 0 && (
          <motion.button
            initial={isInitialLoad ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={shouldAnimate ? { type: 'spring', damping: 25, stiffness: 300 } : { duration: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-shadow lg:hidden"
            aria-label="Abrir chat"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <MessageCircle className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={
              isInitialLoad
                ? getPanelAnimationState(maximized)
                : typeof window !== 'undefined' && window.innerWidth < 1024
                  ? { y: '100%', opacity: 0 }
                  : { opacity: 0, scale: 0.95, y: 20 }
            }
            animate={
              shouldAnimate
                ? getPanelAnimationState(maximized)
                : typeof window !== 'undefined' && window.innerWidth < 1024
                  ? { y: 0, opacity: 1 }
                  : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              shouldAnimate
                ? typeof window !== 'undefined' && window.innerWidth < 1024
                  ? { y: '100%', opacity: 0 }
                  : { opacity: 0, scale: 0.95, y: 20 }
                : { opacity: 0 }
            }
            transition={
              shouldAnimate
                ? {
                    type: 'spring',
                    damping: 30,
                    stiffness: 300,
                    mass: 0.8
                  }
                : { duration: 0 }
            }
            className="fixed z-50 flex flex-col overflow-hidden border-border bg-background shadow-2xl lg:border"
            style={{
              ...getPanelAnimationState(maximized),
              transition: shouldAnimate ? 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 'none'
            }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card/80 px-4 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                  {agent?.avatar ? (
                    ImageComponent ? (
                      <ImageComponent
                        src={agent.avatar}
                        alt={agent.name}
                        width={24}
                        height={24}
                        className="rounded-md"
                      />
                    ) : (
                      <img src={agent.avatar} alt={agent.name} width={24} height={24} className="rounded-md" />
                    )
                  ) : (
                    <Bot className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex flex-col">
                  <AgentSelector
                    agents={agents}
                    selectedAgentSlug={selectedAgentSlug}
                    fallbackTitle="Zetesis AI"
                    onSelectAgent={handleSelectAgent}
                  />
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    En línea
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <motion.button
                  type="button"
                  onClick={handleNewThread}
                  className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Nuevo chat"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Plus className="w-4 h-4" />
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setHistoryOpen(o => !o)}
                  className={`h-9 w-9 flex items-center justify-center rounded-md transition-colors ${historyOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                  aria-label="Historial"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <History className="w-4 h-4" />
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setMaximized(m => !m)}
                  className="hidden lg:flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label={maximized ? 'Minimizar' : 'Maximizar'}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Cerrar chat"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {agent ? (
                <AgentChatProvider
                  key={`${agent.slug}:${loadedThread?.id ?? `new-${threadKey}`}`}
                  endpoint={chatEndpoint}
                  agentSlug={agent.slug}
                  agentName={agent.name}
                  initialThreadId={loadedThread?.id}
                  initialMessages={loadedThread?.messages}
                  generateHref={({ type, value }) => `/${type}/${value.slug || value.id}`}
                  LinkComponent={LinkComponent}
                >
                  <div className="relative h-full">
                    <AgentThread
                      welcomeTitle={agent.welcomeTitle}
                      welcomeSubtitle={agent.welcomeSubtitle}
                      suggestedQuestions={agent.suggestedQuestions}
                    />
                    <AnimatePresence>
                      {historyOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute inset-x-0 top-0 z-10 max-h-[60%] overflow-y-auto border-b border-border bg-background shadow-lg"
                        >
                          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Conversaciones
                            </span>
                            <button
                              type="button"
                              onClick={() => setHistoryOpen(false)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Cerrar historial"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <AgentThreadList
                            dataSource={dataSource}
                            agentSlug={agent.slug}
                            onSelectThread={handleSelectThread}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </AgentChatProvider>
              ) : agentLoadState === 'loading' || agentLoadState === 'idle' ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="flex space-x-2 justify-center mb-4">
                      <div className="w-3 h-3 rounded-full bg-primary animate-bounce" />
                      <div className="w-3 h-3 rounded-full bg-primary animate-bounce delay-75" />
                      <div className="w-3 h-3 rounded-full bg-primary animate-bounce delay-150" />
                    </div>
                    <p className="text-muted-foreground">Cargando asistente...</p>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center">
                  <p className="text-sm text-muted-foreground">{agentStatusMessage}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
