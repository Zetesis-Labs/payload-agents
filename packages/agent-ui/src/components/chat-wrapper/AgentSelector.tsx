'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { AgentInfo } from './types'

export interface AgentSelectorProps {
  agents: AgentInfo[]
  selectedAgentSlug: string | null
  fallbackTitle: string
  onSelectAgent: (agentSlug: string) => void
}

export function AgentSelector({ agents, selectedAgentSlug, fallbackTitle, onSelectAgent }: AgentSelectorProps) {
  const [open, setOpen] = useState(false)
  const [pendingAgentSlug, setPendingAgentSlug] = useState<string | null>(null)
  const selectedAgent = agents.find(agent => agent.slug === selectedAgentSlug)
  const pendingAgent = agents.find(agent => agent.slug === pendingAgentSlug)
  const title = selectedAgent?.name || selectedAgent?.slug || fallbackTitle

  if (agents.length <= 1) {
    return <span className="text-sm font-medium leading-tight">{title}</span>
  }

  const closeMenu = () => {
    setOpen(false)
  }

  const handleAgentClick = (agentSlug: string) => {
    if (agentSlug === selectedAgentSlug) {
      closeMenu()
      return
    }
    setPendingAgentSlug(agentSlug)
  }

  const confirmAgentChange = () => {
    if (pendingAgentSlug) {
      onSelectAgent(pendingAgentSlug)
    }
    setPendingAgentSlug(null)
    closeMenu()
  }

  const cancelAgentChange = () => {
    setPendingAgentSlug(null)
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="flex max-w-[13rem] items-center gap-1.5 text-sm font-medium leading-tight text-foreground transition-colors hover:text-foreground/80"
          aria-label="Seleccionar agente"
          aria-expanded={open}
        >
          <span className="truncate">{title}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default border-none bg-transparent"
              onClick={closeMenu}
              aria-label="Cerrar selector de agentes"
            />
            <div className="absolute left-0 top-full z-50 mt-2 min-w-[16rem] max-w-[20rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cambiar agente
              </div>
              {agents.map(agent => {
                const selected = selectedAgentSlug === agent.slug
                return (
                  <button
                    type="button"
                    key={agent.slug}
                    onClick={() => handleAgentClick(agent.slug)}
                    className={`relative flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground ${
                      selected ? 'bg-primary/10 font-medium text-primary' : ''
                    }`}
                  >
                    <span className="truncate">{agent.name || agent.slug}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {pendingAgentSlug && pendingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold text-foreground">¿Cambiar de agente?</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Se iniciará una nueva conversación con <strong>{pendingAgent.name}</strong>.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelAgentChange}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAgentChange}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Confirmar cambio
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
