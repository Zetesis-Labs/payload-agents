'use client'

import type { FC } from 'react'

export interface InlineThinkingProps {
  agentName?: string
}

/**
 * Typing-dots indicator shown while the assistant is generating a
 * response but hasn't emitted any text yet.
 */
export const InlineThinking: FC<InlineThinkingProps> = ({ agentName = 'El asistente' }) => (
  <div className="flex items-center gap-3 text-muted-foreground">
    <div className="flex items-center gap-1">
      <span className="typing-dot w-2 h-2 rounded-full bg-primary/60" />
      <span className="typing-dot w-2 h-2 rounded-full bg-primary/60" />
      <span className="typing-dot w-2 h-2 rounded-full bg-primary/60" />
    </div>
    <span className="text-sm">{agentName} está pensando...</span>
  </div>
)
