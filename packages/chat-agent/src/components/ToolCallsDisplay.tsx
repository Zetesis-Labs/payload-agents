'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { type FC, useState } from 'react'
import type { ToolCall } from '../adapters/ChatAdapter'

interface ToolCallsDisplayProps {
  toolCalls: ToolCall[]
}

const ToolCallsDisplay: FC<ToolCallsDisplayProps> = ({ toolCalls }) => {
  const [isOpen, setIsOpen] = useState(false)

  if (toolCalls.length === 0) return null

  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
          role="img"
        >
          <title>Toggle tool calls</title>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>
          {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
        </span>
        {toolCalls.some(tc => tc.isLoading) && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              {toolCalls.map(tc => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const ToolCallCard: FC<{ toolCall: ToolCall }> = ({ toolCall }) => {
  const [showInput, setShowInput] = useState(false)
  const [showOutput, setShowOutput] = useState(false)

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 text-xs">
      <div className="flex items-center gap-2 px-3 py-2">
        {toolCall.isLoading ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        ) : (
          <svg
            className="h-3 w-3 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
            role="img"
          >
            <title>Completed</title>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        <span className="font-mono font-semibold text-foreground">{toolCall.name}</span>
      </div>

      <div className="border-t border-border/40 px-3 py-1.5 flex gap-3">
        <button
          type="button"
          onClick={() => setShowInput(!showInput)}
          className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <svg
            className={`h-2.5 w-2.5 transition-transform ${showInput ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
            role="img"
          >
            <title>Toggle input</title>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Input
        </button>
        {toolCall.result && (
          <button
            type="button"
            onClick={() => setShowOutput(!showOutput)}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <svg
              className={`h-2.5 w-2.5 transition-transform ${showOutput ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
              role="img"
            >
              <title>Toggle output</title>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Output
          </button>
        )}
      </div>

      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <pre className="border-t border-border/40 bg-muted/50 px-3 py-2 overflow-x-auto max-h-48 text-[11px] leading-relaxed text-muted-foreground font-mono">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOutput && toolCall.result && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <pre className="border-t border-border/40 bg-muted/50 px-3 py-2 overflow-x-auto max-h-64 text-[11px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-words">
              {toolCall.result}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export { ToolCallsDisplay }
