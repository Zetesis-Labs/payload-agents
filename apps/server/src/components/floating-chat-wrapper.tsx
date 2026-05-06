'use client'

import { AgentChatProvider, AgentThread, AgentThreadList } from '@zetesis/agent-ui'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

interface AgentInfo {
  slug: string
  name: string
  welcomeTitle?: string
  welcomeSubtitle?: string
  suggestedQuestions?: Array<{ prompt: string; title: string; description: string }>
}

export function FloatingChatWrapper() {
  const [open, setOpen] = useState(false)
  const [agent, setAgent] = useState<AgentInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/chat/agents')
      .then(r => (r.ok ? (r.json() as Promise<{ agents?: AgentInfo[] }>) : null))
      .then(data => {
        if (!cancelled) setAgent(data?.agents?.[0] ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!agent) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label={open ? 'Cerrar chat' : 'Abrir chat'}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-24 right-6 z-40 flex h-[600px] w-[420px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
          >
            <AgentChatProvider
              endpoint="/api/chat"
              agentSlug={agent.slug}
              agentName={agent.name}
              generateHref={({ type, value }) => `/${type}/${value.slug || value.id}`}
              LinkComponent={Link}
            >
              <div className="grid flex-1 grid-cols-[180px_1fr] overflow-hidden">
                <aside className="overflow-y-auto border-r border-border bg-muted/20">
                  <AgentThreadList />
                </aside>
                <main className="overflow-hidden">
                  <AgentThread
                    welcomeTitle={agent.welcomeTitle}
                    welcomeSubtitle={agent.welcomeSubtitle}
                    suggestedQuestions={agent.suggestedQuestions}
                  />
                </main>
              </div>
            </AgentChatProvider>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
