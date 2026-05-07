'use client'

import { motion } from 'framer-motion'
import type { FC, ReactNode } from 'react'
import { cn } from '../lib/utils'

export interface MessageBubbleProps {
  variant: 'user' | 'assistant'
  children: ReactNode
  className?: string
}

const springTransition = { type: 'spring' as const, stiffness: 400, damping: 25 }

/**
 * Chat-bubble wrapper used by both the live `AgentThread` and the
 * read-only `ReadOnlyThread`. Provides the rounded card, variant-based
 * styling, and the spring entrance animation.
 */
export const MessageBubble: FC<MessageBubbleProps> = ({ variant, children, className }) => (
  <motion.div
    className={cn(
      'rounded-2xl px-4 py-3 shadow-sm',
      variant === 'user'
        ? 'max-w-[80%] rounded-br-md bg-primary text-primary-foreground'
        : 'max-w-[85%] rounded-bl-md border-l-4 border-l-primary/30 bg-card text-card-foreground',
      className
    )}
    initial={{ opacity: 0, scale: 0.95, y: 10 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={springTransition}
  >
    {children}
  </motion.div>
)
