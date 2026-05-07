'use client'

import { useEffect, useState } from 'react'
import type { AgentInfo, AgentLoadState, SessionSummary } from './types'

export function pickInitialAgentSlug(agents: AgentInfo[], sessions: SessionSummary[]): string | null {
  const availableSlugs = new Set(agents.map(agent => agent.slug))
  const mostRecentSession = sessions.find(
    session => session.status === 'active' && session.agentSlug && availableSlugs.has(session.agentSlug)
  )

  return mostRecentSession?.agentSlug ?? agents[0]?.slug ?? null
}

export function useChatAgents(
  hasAccess: boolean,
  apiBaseUrl: string = '/api/chat'
): {
  agents: AgentInfo[]
  selectedAgentSlug: string | null
  setSelectedAgentSlug: (slug: string | null) => void
  agentLoadState: AgentLoadState
} {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(null)
  const [agentLoadState, setAgentLoadState] = useState<AgentLoadState>('idle')

  useEffect(() => {
    if (!hasAccess) {
      setAgents([])
      setSelectedAgentSlug(null)
      setAgentLoadState('idle')
      return
    }

    let cancelled = false

    async function loadAgents() {
      setAgentLoadState('loading')
      try {
        const agentsRes = await fetch(`${apiBaseUrl}/agents`)
        if (!agentsRes.ok) throw new Error(`Failed to load chat agents: ${agentsRes.status}`)

        const agentsData = (await agentsRes.json()) as { agents?: AgentInfo[] }
        const loadedAgents = agentsData.agents ?? []

        let recentSessions: SessionSummary[] = []
        try {
          const sessionsRes = await fetch(`${apiBaseUrl}/sessions?limit=10`)
          if (sessionsRes.ok) {
            const sessionsData = (await sessionsRes.json()) as { sessions?: SessionSummary[] }
            recentSessions = sessionsData.sessions ?? []
          } else {
            console.error(`[useChatAgents] failed to load recent sessions: ${sessionsRes.status}`)
          }
        } catch (err) {
          console.error('[useChatAgents] failed to load recent sessions:', err)
        }

        if (cancelled) return

        setAgents(loadedAgents)
        setSelectedAgentSlug(currentSlug => {
          if (currentSlug && loadedAgents.some(agent => agent.slug === currentSlug)) return currentSlug
          return pickInitialAgentSlug(loadedAgents, recentSessions)
        })
        setAgentLoadState(loadedAgents.length > 0 ? 'ready' : 'empty')
      } catch (err) {
        console.error('[useChatAgents] failed to load agents:', err)
        if (!cancelled) {
          setAgents([])
          setSelectedAgentSlug(null)
          setAgentLoadState('error')
        }
      }
    }

    void loadAgents()

    return () => {
      cancelled = true
    }
  }, [hasAccess, apiBaseUrl])

  return { agents, selectedAgentSlug, setSelectedAgentSlug, agentLoadState }
}
