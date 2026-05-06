'use client'

import { motion } from 'framer-motion'
import type { FC } from 'react'
import { cn } from '../lib/utils'
import { useAgentChat } from '../runtime/AgentChatProvider'

export const TokenUsageBar: FC = () => {
  const { usage } = useAgentChat()
  if (!usage) return null

  const percentage = usage.daily_limit > 0 ? Math.min((usage.daily_used / usage.daily_limit) * 100, 100) : 0
  const gradient =
    percentage > 80
      ? 'from-red-500 to-red-600'
      : percentage > 50
        ? 'from-yellow-500 to-orange-500'
        : 'from-primary to-primary/80'

  return (
    <div className="px-4 py-2 border-b border-border/50">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>
          {usage.daily_used.toLocaleString()} / {usage.daily_limit.toLocaleString()} tokens
        </span>
        <span>{percentage.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full bg-gradient-to-r', gradient)}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
