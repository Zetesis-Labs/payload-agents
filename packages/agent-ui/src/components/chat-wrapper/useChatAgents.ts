'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import type { AgentChatDataSource, AgentInfo, AgentLoadState, SessionSummary } from './types'

export function pickInitialAgentSlug(agents: AgentInfo[], sessions: SessionSummary[]): string | null {
  const availableSlugs = new Set(agents.map(agent => agent.slug))
  const mostRecentSession = sessions.find(
    session => session.status === 'active' && session.agentSlug && availableSlugs.has(session.agentSlug)
  )

  return mostRecentSession?.agentSlug ?? agents[0]?.slug ?? null
}

export function useChatAgents(
  hasAccess: boolean,
  dataSource: AgentChatDataSource
): {
  agents: AgentInfo[]
  selectedAgentSlug: string | null
  setSelectedAgentSlug: (slug: string | null) => void
  agentLoadState: AgentLoadState
} {
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(null)

  const {
    data: agents,
    error: agentsError,
    isLoading: agentsLoading
  } = useSWR(hasAccess ? 'chat-agents' : null, () => dataSource.getAgents(), {
    revalidateOnFocus: false,
    dedupingInterval: 60000
  })

  const { data: recentSessions } = useSWR(
    hasAccess ? 'recent-sessions' : null,
    () => dataSource.getRecentSessions(undefined, 10),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000
    }
  )

  useEffect(() => {
    if (!hasAccess) {
      setSelectedAgentSlug(null)
      return
    }

    if (agents && agents.length > 0) {
      setSelectedAgentSlug(currentSlug => {
        if (currentSlug && agents.some(agent => agent.slug === currentSlug)) {
          return currentSlug
        }
        return pickInitialAgentSlug(agents, recentSessions ?? [])
      })
    }
  }, [hasAccess, agents, recentSessions])

  let agentLoadState: AgentLoadState = 'idle'
  if (!hasAccess) agentLoadState = 'idle'
  else if (agentsError) agentLoadState = 'error'
  else if (agentsLoading) agentLoadState = 'loading'
  else if (agents && agents.length === 0) agentLoadState = 'empty'
  else if (agents && agents.length > 0) agentLoadState = 'ready'

  return {
    agents: agents ?? [],
    selectedAgentSlug,
    setSelectedAgentSlug,
    agentLoadState
  }
}
