'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import type { FC } from 'react'
import { useAgentChat } from '../runtime/AgentChatProvider'

export const LimitAlert: FC = () => {
  const { limitError, setLimitError, usage } = useAgentChat()
  if (!limitError) return null

  const resetTime = usage?.reset_at
    ? new Date(usage.reset_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <motion.div
      className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-destructive">{limitError}</p>
          {resetTime && <p className="text-xs text-muted-foreground">Tu límite se restablecerá a las {resetTime}</p>}
        </div>
        <button
          type="button"
          onClick={() => setLimitError(null)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cerrar alerta"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )
}
